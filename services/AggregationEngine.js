/**
 * AggregationEngine
 *
 * Core engine for building MongoDB aggregation pipelines based on chart configuration.
 * Handles all metric calculations, grouping, filtering, and data transformations.
 */

const mongoose = require('mongoose');
const Ticket = require('../models/Ticket');
const Agent = require('../models/Agent');
const User = require('../models/User');

class AggregationEngine {
  constructor() {
    this.Ticket = Ticket;
    this.Agent = Agent;
    this.User = User;
  }

  /**
   * Main execution method
   * @param {Object} config - Chart configuration
   * @param {Object} reportFilters - Report-level filters
   * @param {Object} dateRange - Date range configuration
   * @returns {Object} - Aggregated data
   */
  async execute(config, reportFilters = null, dateRange = null) {
    const {
      dataset = 'tickets',
      metric,
      metrics = [],
      aggregation = 'avg',
      viewBy = 'none',
      segmentBy,
      filters,
      topN,
      showOthers = true,
      sortBy = 'value',
      sortOrder = 'desc',
      percentileValue,
      options = {}
    } = config;

    // Merge report and chart filters
    const combinedFilters = this.mergeFilters(reportFilters, filters);

    // Use chart's date range if overriding, otherwise report's date range
    const effectiveDateRange = config.overrideDateRange && config.dateRange
      ? config.dateRange
      : dateRange;

    // Route to appropriate handler based on dataset
    switch (dataset) {
      case 'tickets':
        return this.executeTicketDataset(config, combinedFilters, effectiveDateRange);
      case 'csAgentPerformance':
        return this.executeCSAgentDataset(config, combinedFilters, effectiveDateRange);
      case 'qaAgentActivity':
        return this.executeQAAgentDataset(config, combinedFilters, effectiveDateRange);
      case 'timeBased':
        return this.executeTimeBasedDataset(config, combinedFilters, effectiveDateRange);
      case 'categoryAnalysis':
        return this.executeCategoryDataset(config, combinedFilters, effectiveDateRange);
      default:
        throw new Error(`Unknown dataset: ${dataset}`);
    }
  }

  // ============================================
  // TICKET DATASET
  // ============================================

  async executeTicketDataset(config, filters, dateRange) {
    const { metric, aggregation, viewBy, segmentBy, topN, sortBy, sortOrder, percentileValue } = config;
    const pipeline = [];

    // Stage 1: Match (filters + date range)
    const matchStage = this.buildMatchStage(filters, dateRange);
    if (Object.keys(matchStage).length > 0) {
      pipeline.push({ $match: matchStage });
    }

    // Stage 2: Lookup for agent names if needed
    if (viewBy === 'csAgent' || segmentBy === 'csAgent') {
      pipeline.push({
        $lookup: {
          from: 'agents',
          localField: 'agent',
          foreignField: '_id',
          as: 'agentInfo'
        }
      });
      pipeline.push({ $unwind: { path: '$agentInfo', preserveNullAndEmptyArrays: true } });
    }

    if (viewBy === 'qaAgent' || segmentBy === 'qaAgent') {
      pipeline.push({
        $lookup: {
          from: 'users',
          localField: 'createdBy',
          foreignField: '_id',
          as: 'graderInfo'
        }
      });
      pipeline.push({ $unwind: { path: '$graderInfo', preserveNullAndEmptyArrays: true } });
    }

    // Stage 3: Add computed fields
    pipeline.push({
      $addFields: {
        notesLength: { $strLenCP: { $ifNull: ['$notes', ''] } },
        feedbackLength: { $strLenCP: { $ifNull: ['$feedback', ''] } },
        qualityGrade: this.getQualityGradeExpression(),
        dayOfWeek: { $dayOfWeek: '$dateEntered' },
        hour: { $hour: '$dateEntered' },
        timeToGrade: {
          $cond: {
            if: { $and: ['$dateEntered', '$gradedDate'] },
            then: { $subtract: ['$gradedDate', '$dateEntered'] },
            else: null
          }
        }
      }
    });

    // Stage 4: Group
    const groupStage = this.buildGroupStage(metric, aggregation, viewBy, segmentBy, percentileValue);
    pipeline.push({ $group: groupStage });

    // Stage 5: Handle segmentBy by restructuring data
    if (segmentBy && segmentBy !== 'none') {
      pipeline.push(...this.buildSegmentReshape(viewBy, segmentBy));
    }

    // Stage 6: Sort
    const sortField = sortBy === 'value' ? 'value' : '_id';
    pipeline.push({ $sort: { [sortField]: sortOrder === 'asc' ? 1 : -1 } });

    // Stage 7: Limit (TopN)
    if (topN && topN > 0) {
      if (showOthers) {
        // Need to facet for "Others" aggregation
        pipeline.push({
          $facet: {
            top: [{ $limit: topN }],
            others: [
              { $skip: topN },
              {
                $group: {
                  _id: null,
                  value: { $sum: '$value' },
                  count: { $sum: '$count' }
                }
              },
              { $addFields: { name: 'Others' } }
            ]
          }
        });
        pipeline.push({
          $project: {
            data: {
              $concatArrays: [
                '$top',
                { $cond: { if: { $gt: [{ $size: '$others' }, 0] }, then: '$others', else: [] } }
              ]
            }
          }
        });
        pipeline.push({ $unwind: '$data' });
        pipeline.push({ $replaceRoot: { newRoot: '$data' } });
      } else {
        pipeline.push({ $limit: topN });
      }
    }

    // Stage 8: Project final format
    pipeline.push({
      $project: {
        _id: 0,
        name: { $ifNull: ['$name', '$_id'] },
        value: { $round: ['$value', 2] },
        count: 1,
        segments: 1
      }
    });

    // Execute
    const results = await this.Ticket.aggregate(pipeline);

    // Handle single value (no grouping)
    if (viewBy === 'none' && results.length === 1) {
      return {
        value: results[0].value,
        count: results[0].count,
        formatted: this.formatValue(results[0].value, metric)
      };
    }

    return results;
  }

  // ============================================
  // CS AGENT PERFORMANCE DATASET
  // ============================================

  async executeCSAgentDataset(config, filters, dateRange) {
    const { metric, aggregation, viewBy, topN, sortOrder } = config;
    const pipeline = [];

    // Base match
    const matchStage = this.buildMatchStage(filters, dateRange);
    matchStage.status = 'Graded';
    matchStage.isArchived = { $ne: true };
    pipeline.push({ $match: matchStage });

    // Lookup agent
    pipeline.push({
      $lookup: {
        from: 'agents',
        localField: 'agent',
        foreignField: '_id',
        as: 'agentInfo'
      }
    });
    pipeline.push({ $unwind: '$agentInfo' });

    // Group by agent
    pipeline.push({
      $group: {
        _id: '$agent',
        name: { $first: '$agentInfo.name' },
        avgScore: { $avg: '$qualityScorePercent' },
        minScore: { $min: '$qualityScorePercent' },
        maxScore: { $max: '$qualityScorePercent' },
        ticketCount: { $sum: 1 },
        scores: { $push: '$qualityScorePercent' },
        categories: { $push: '$categories' },
        priorities: { $push: '$priority' }
      }
    });

    // Calculate additional metrics
    pipeline.push({
      $addFields: {
        scoreStdDev: { $stdDevPop: '$scores' },
        consistencyScore: {
          $subtract: [100, { $multiply: [{ $stdDevPop: '$scores' }, 2] }]
        }
      }
    });

    // Select the requested metric
    const metricField = this.getCSAgentMetricField(metric);
    pipeline.push({
      $project: {
        _id: 0,
        name: 1,
        value: metricField,
        count: '$ticketCount',
        avgScore: { $round: ['$avgScore', 1] },
        consistency: { $round: ['$consistencyScore', 1] }
      }
    });

    // Sort and limit
    pipeline.push({ $sort: { value: sortOrder === 'asc' ? 1 : -1 } });
    if (topN) pipeline.push({ $limit: topN });

    return await this.Ticket.aggregate(pipeline);
  }

  // ============================================
  // QA AGENT ACTIVITY DATASET
  // ============================================

  async executeQAAgentDataset(config, filters, dateRange) {
    const { metric, aggregation, viewBy, topN, sortOrder } = config;
    const pipeline = [];

    // Base match
    const matchStage = this.buildMatchStage(filters, dateRange);
    matchStage.status = 'Graded';
    matchStage.isArchived = { $ne: true };
    pipeline.push({ $match: matchStage });

    // Lookup grader (user)
    pipeline.push({
      $lookup: {
        from: 'users',
        localField: 'createdBy',
        foreignField: '_id',
        as: 'graderInfo'
      }
    });
    pipeline.push({ $unwind: '$graderInfo' });

    // Add computed fields
    pipeline.push({
      $addFields: {
        feedbackLength: { $strLenCP: { $ifNull: ['$feedback', ''] } },
        notesLength: { $strLenCP: { $ifNull: ['$notes', ''] } }
      }
    });

    // Group by grader
    pipeline.push({
      $group: {
        _id: '$createdBy',
        name: { $first: '$graderInfo.name' },
        email: { $first: '$graderInfo.email' },
        ticketsGraded: { $sum: 1 },
        avgScoreGiven: { $avg: '$qualityScorePercent' },
        avgFeedbackLength: { $avg: '$feedbackLength' },
        avgNotesLength: { $avg: '$notesLength' },
        scores: { $push: '$qualityScorePercent' },
        dates: { $push: '$gradedDate' }
      }
    });

    // Calculate daily output
    pipeline.push({
      $addFields: {
        uniqueDays: { $size: { $setUnion: [{ $map: { input: '$dates', as: 'd', in: { $dateToString: { format: '%Y-%m-%d', date: '$$d' } } } }] } },
        dailyOutput: {
          $cond: {
            if: { $gt: [{ $size: { $setUnion: [{ $map: { input: '$dates', as: 'd', in: { $dateToString: { format: '%Y-%m-%d', date: '$$d' } } } }] } }, 0] },
            then: { $divide: ['$ticketsGraded', { $size: { $setUnion: [{ $map: { input: '$dates', as: 'd', in: { $dateToString: { format: '%Y-%m-%d', date: '$$d' } } } }] } }] },
            else: 0
          }
        }
      }
    });

    // Select metric
    const metricField = this.getQAAgentMetricField(metric);
    pipeline.push({
      $project: {
        _id: 0,
        name: 1,
        email: 1,
        value: metricField,
        ticketsGraded: 1,
        avgScoreGiven: { $round: ['$avgScoreGiven', 1] },
        avgFeedbackLength: { $round: ['$avgFeedbackLength', 0] },
        dailyOutput: { $round: ['$dailyOutput', 1] }
      }
    });

    // Sort and limit
    pipeline.push({ $sort: { value: sortOrder === 'asc' ? 1 : -1 } });
    if (topN) pipeline.push({ $limit: topN });

    return await this.Ticket.aggregate(pipeline);
  }

  // ============================================
  // TIME-BASED DATASET
  // ============================================

  async executeTimeBasedDataset(config, filters, dateRange) {
    const { metric, viewBy, sortOrder } = config;
    const pipeline = [];

    // Base match
    const matchStage = this.buildMatchStage(filters, dateRange);
    matchStage.isArchived = { $ne: true };
    pipeline.push({ $match: matchStage });

    // Determine time grouping
    const timeGroup = this.getTimeGroupExpression(viewBy);

    // Group by time
    pipeline.push({
      $group: {
        _id: timeGroup,
        ticketCount: { $sum: 1 },
        gradedCount: { $sum: { $cond: [{ $eq: ['$status', 'Graded'] }, 1, 0] } },
        avgScore: { $avg: '$qualityScorePercent' }
      }
    });

    // Project
    pipeline.push({
      $project: {
        _id: 0,
        name: '$_id',
        value: this.getTimeBasedMetricField(metric),
        count: '$ticketCount'
      }
    });

    // Sort by time
    pipeline.push({ $sort: { name: sortOrder === 'asc' ? 1 : -1 } });

    return await this.Ticket.aggregate(pipeline);
  }

  // ============================================
  // CATEGORY DATASET
  // ============================================

  async executeCategoryDataset(config, filters, dateRange) {
    const { metric, viewBy, topN, sortOrder } = config;
    const pipeline = [];

    // Base match
    const matchStage = this.buildMatchStage(filters, dateRange);
    matchStage.isArchived = { $ne: true };
    pipeline.push({ $match: matchStage });

    // Unwind categories
    if (viewBy === 'category' || metric.includes('category')) {
      pipeline.push({ $unwind: { path: '$categories', preserveNullAndEmptyArrays: true } });
      pipeline.push({
        $addFields: {
          categories: { $ifNull: ['$categories', 'Uncategorized'] }
        }
      });
    }

    // Group by category
    pipeline.push({
      $group: {
        _id: viewBy === 'category' ? '$categories' : '$priority',
        count: { $sum: 1 },
        avgScore: { $avg: '$qualityScorePercent' },
        gradedCount: { $sum: { $cond: [{ $eq: ['$status', 'Graded'] }, 1, 0] } }
      }
    });

    // Project
    pipeline.push({
      $project: {
        _id: 0,
        name: '$_id',
        value: metric.includes('Avg') ? { $round: ['$avgScore', 1] } : '$count',
        count: 1
      }
    });

    // Sort
    pipeline.push({ $sort: { value: sortOrder === 'asc' ? 1 : -1 } });
    if (topN) pipeline.push({ $limit: topN });

    return await this.Ticket.aggregate(pipeline);
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  /**
   * Build MongoDB match stage from filter configuration
   */
  buildMatchStage(filters, dateRange) {
    const match = {};

    // Apply date range
    if (dateRange) {
      const dateFilter = this.buildDateFilter(dateRange);
      if (dateFilter) {
        Object.assign(match, dateFilter);
      }
    }

    // Apply filter conditions
    if (filters && filters.conditions && filters.conditions.length > 0) {
      const filterConditions = this.buildFilterConditions(filters);
      if (filterConditions) {
        Object.assign(match, filterConditions);
      }
    }

    return match;
  }

  /**
   * Build date filter from date range config
   */
  buildDateFilter(dateRange, dateField = 'dateEntered') {
    const now = new Date();
    let start, end;

    const type = typeof dateRange === 'string' ? dateRange : dateRange?.type;

    switch (type) {
      case 'today':
        start = new Date(now.setHours(0, 0, 0, 0));
        end = new Date(now.setHours(23, 59, 59, 999));
        break;
      case 'yesterday':
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        start = new Date(yesterday.setHours(0, 0, 0, 0));
        end = new Date(yesterday.setHours(23, 59, 59, 999));
        break;
      case 'last7days':
        start = new Date(now);
        start.setDate(start.getDate() - 7);
        end = new Date();
        break;
      case 'last14days':
        start = new Date(now);
        start.setDate(start.getDate() - 14);
        end = new Date();
        break;
      case 'last30days':
        start = new Date(now);
        start.setDate(start.getDate() - 30);
        end = new Date();
        break;
      case 'last90days':
        start = new Date(now);
        start.setDate(start.getDate() - 90);
        end = new Date();
        break;
      case 'thisWeek':
        start = new Date(now);
        start.setDate(start.getDate() - start.getDay());
        start.setHours(0, 0, 0, 0);
        end = new Date();
        break;
      case 'lastWeek':
        start = new Date(now);
        start.setDate(start.getDate() - start.getDay() - 7);
        start.setHours(0, 0, 0, 0);
        end = new Date(start);
        end.setDate(end.getDate() + 6);
        end.setHours(23, 59, 59, 999);
        break;
      case 'thisMonth':
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        end = new Date();
        break;
      case 'lastMonth':
        start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
        break;
      case 'thisQuarter':
        const quarter = Math.floor(now.getMonth() / 3);
        start = new Date(now.getFullYear(), quarter * 3, 1);
        end = new Date();
        break;
      case 'lastQuarter':
        const lastQuarter = Math.floor(now.getMonth() / 3) - 1;
        const year = lastQuarter < 0 ? now.getFullYear() - 1 : now.getFullYear();
        const q = lastQuarter < 0 ? 3 : lastQuarter;
        start = new Date(year, q * 3, 1);
        end = new Date(year, q * 3 + 3, 0, 23, 59, 59, 999);
        break;
      case 'thisYear':
        start = new Date(now.getFullYear(), 0, 1);
        end = new Date();
        break;
      case 'lastYear':
        start = new Date(now.getFullYear() - 1, 0, 1);
        end = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999);
        break;
      case 'custom':
        if (dateRange.customStart) start = new Date(dateRange.customStart);
        if (dateRange.customEnd) end = new Date(dateRange.customEnd);
        break;
      case 'customRelative':
        if (dateRange.relativeDays) {
          start = new Date(now);
          const multiplier = dateRange.relativeUnit === 'weeks' ? 7 : dateRange.relativeUnit === 'months' ? 30 : 1;
          start.setDate(start.getDate() - (dateRange.relativeDays * multiplier));
          end = new Date();
        }
        break;
      case 'all':
      default:
        return null;
    }

    const filter = {};
    if (start) filter.$gte = start;
    if (end) filter.$lte = end;

    return Object.keys(filter).length > 0 ? { [dateField]: filter } : null;
  }

  /**
   * Build filter conditions from filter group
   */
  buildFilterConditions(filterGroup) {
    if (!filterGroup || !filterGroup.conditions || filterGroup.conditions.length === 0) {
      return null;
    }

    const conditions = filterGroup.conditions.map(cond => this.buildSingleCondition(cond));
    const validConditions = conditions.filter(c => c !== null);

    if (validConditions.length === 0) return null;
    if (validConditions.length === 1) return validConditions[0];

    return filterGroup.logic === 'OR'
      ? { $or: validConditions }
      : { $and: validConditions };
  }

  /**
   * Build single filter condition
   */
  buildSingleCondition(condition) {
    const { field, operator, value, valueTo } = condition;
    if (!field || !operator) return null;

    switch (operator) {
      case 'equals':
        return { [field]: value };
      case 'not_equals':
        return { [field]: { $ne: value } };
      case 'contains':
        return { [field]: { $regex: value, $options: 'i' } };
      case 'not_contains':
        return { [field]: { $not: { $regex: value, $options: 'i' } } };
      case 'starts_with':
        return { [field]: { $regex: `^${value}`, $options: 'i' } };
      case 'ends_with':
        return { [field]: { $regex: `${value}$`, $options: 'i' } };
      case 'greater_than':
        return { [field]: { $gt: value } };
      case 'greater_or_equal':
        return { [field]: { $gte: value } };
      case 'less_than':
        return { [field]: { $lt: value } };
      case 'less_or_equal':
        return { [field]: { $lte: value } };
      case 'between':
        return { [field]: { $gte: value, $lte: valueTo } };
      case 'in':
        return { [field]: { $in: Array.isArray(value) ? value : [value] } };
      case 'not_in':
        return { [field]: { $nin: Array.isArray(value) ? value : [value] } };
      case 'is_empty':
        return { $or: [{ [field]: '' }, { [field]: { $size: 0 } }] };
      case 'is_not_empty':
        return { $and: [{ [field]: { $ne: '' } }, { [field]: { $not: { $size: 0 } } }] };
      case 'is_null':
        return { [field]: null };
      case 'is_not_null':
        return { [field]: { $ne: null } };
      default:
        return null;
    }
  }

  /**
   * Build group stage for aggregation
   */
  buildGroupStage(metric, aggregation, viewBy, segmentBy, percentileValue) {
    const groupId = this.getGroupIdExpression(viewBy, segmentBy);
    const aggregationExpr = this.getAggregationExpression(metric, aggregation, percentileValue);

    const group = {
      _id: groupId,
      value: aggregationExpr,
      count: { $sum: 1 }
    };

    // Add name field based on viewBy
    if (viewBy !== 'none') {
      group.name = { $first: this.getNameExpression(viewBy) };
    }

    return group;
  }

  /**
   * Get group ID expression based on viewBy
   */
  getGroupIdExpression(viewBy, segmentBy) {
    const viewExpr = this.getDimensionExpression(viewBy);
    const segmentExpr = segmentBy && segmentBy !== 'none' ? this.getDimensionExpression(segmentBy) : null;

    if (!segmentExpr) {
      return viewBy === 'none' ? null : viewExpr;
    }

    return { view: viewExpr, segment: segmentExpr };
  }

  /**
   * Get dimension expression for grouping
   */
  getDimensionExpression(dimension) {
    switch (dimension) {
      case 'none':
        return null;
      case 'csAgent':
        return '$agent';
      case 'qaAgent':
        return '$createdBy';
      case 'category':
        return { $arrayElemAt: ['$categories', 0] };
      case 'priority':
        return '$priority';
      case 'qualityGrade':
        return '$qualityGrade';
      case 'status':
        return '$status';
      case 'day':
        return { $dateToString: { format: '%Y-%m-%d', date: '$dateEntered' } };
      case 'week':
        return { $dateToString: { format: '%Y-W%V', date: '$dateEntered' } };
      case 'month':
        return { $dateToString: { format: '%Y-%m', date: '$dateEntered' } };
      case 'quarter':
        return {
          $concat: [
            { $toString: { $year: '$dateEntered' } },
            '-Q',
            { $toString: { $ceil: { $divide: [{ $month: '$dateEntered' }, 3] } } }
          ]
        };
      case 'year':
        return { $year: '$dateEntered' };
      case 'dayOfWeek':
        return { $dayOfWeek: '$dateEntered' };
      case 'hour':
        return { $hour: '$dateEntered' };
      default:
        return `$${dimension}`;
    }
  }

  /**
   * Get name expression for display
   */
  getNameExpression(viewBy) {
    switch (viewBy) {
      case 'csAgent':
        return '$agentInfo.name';
      case 'qaAgent':
        return '$graderInfo.name';
      case 'dayOfWeek':
        return {
          $arrayElemAt: [
            ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
            { $subtract: ['$dayOfWeek', 1] }
          ]
        };
      default:
        return this.getDimensionExpression(viewBy);
    }
  }

  /**
   * Get aggregation expression
   */
  getAggregationExpression(metric, aggregation, percentileValue) {
    const field = this.getMetricField(metric);

    switch (aggregation) {
      case 'sum':
        return { $sum: field };
      case 'avg':
        return { $avg: field };
      case 'median':
        // MongoDB doesn't have built-in median, we'll calculate in post-processing
        return { $avg: field };
      case 'min':
        return { $min: field };
      case 'max':
        return { $max: field };
      case 'count':
        return { $sum: 1 };
      case 'countDistinct':
        return { $addToSet: field };
      case 'stddev':
        return { $stdDevPop: field };
      case 'variance':
        return { $stdDevPop: field }; // We'll square it in post-processing
      default:
        if (aggregation.startsWith('percentile')) {
          // Handle percentile aggregations
          return { $avg: field }; // Placeholder, calculated in post-processing
        }
        return { $avg: field };
    }
  }

  /**
   * Get metric field expression
   */
  getMetricField(metric) {
    switch (metric) {
      case 'ticketCount':
        return 1;
      case 'qualityScorePercent':
        return '$qualityScorePercent';
      case 'gradedCount':
        return { $cond: [{ $eq: ['$status', 'Graded'] }, 1, 0] };
      case 'selectedCount':
        return { $cond: [{ $eq: ['$status', 'Selected'] }, 1, 0] };
      case 'notesLength':
        return '$notesLength';
      case 'feedbackLength':
        return '$feedbackLength';
      case 'timeToGrade':
        return '$timeToGrade';
      default:
        return `$${metric}`;
    }
  }

  /**
   * Get quality grade expression
   */
  getQualityGradeExpression() {
    return {
      $switch: {
        branches: [
          { case: { $gte: ['$qualityScorePercent', 95] }, then: 'A+' },
          { case: { $gte: ['$qualityScorePercent', 90] }, then: 'A' },
          { case: { $gte: ['$qualityScorePercent', 85] }, then: 'B+' },
          { case: { $gte: ['$qualityScorePercent', 80] }, then: 'B' },
          { case: { $gte: ['$qualityScorePercent', 75] }, then: 'C+' },
          { case: { $gte: ['$qualityScorePercent', 70] }, then: 'C' },
          { case: { $gte: ['$qualityScorePercent', 60] }, then: 'D' }
        ],
        default: 'F'
      }
    };
  }

  /**
   * Get time group expression
   */
  getTimeGroupExpression(viewBy) {
    switch (viewBy) {
      case 'day':
        return { $dateToString: { format: '%Y-%m-%d', date: '$dateEntered' } };
      case 'week':
        return { $dateToString: { format: '%Y-W%V', date: '$dateEntered' } };
      case 'month':
        return { $dateToString: { format: '%Y-%m', date: '$dateEntered' } };
      case 'quarter':
        return {
          $concat: [
            { $toString: { $year: '$dateEntered' } },
            '-Q',
            { $toString: { $ceil: { $divide: [{ $month: '$dateEntered' }, 3] } } }
          ]
        };
      case 'year':
        return { $toString: { $year: '$dateEntered' } };
      case 'dayOfWeek':
        return { $dayOfWeek: '$dateEntered' };
      case 'hour':
        return { $hour: '$dateEntered' };
      default:
        return { $dateToString: { format: '%Y-%m-%d', date: '$dateEntered' } };
    }
  }

  /**
   * Get CS Agent metric field
   */
  getCSAgentMetricField(metric) {
    switch (metric) {
      case 'avgScore':
        return { $round: ['$avgScore', 1] };
      case 'ticketsGraded':
        return '$ticketCount';
      case 'consistencyScore':
        return { $round: ['$consistencyScore', 1] };
      default:
        return { $round: ['$avgScore', 1] };
    }
  }

  /**
   * Get QA Agent metric field
   */
  getQAAgentMetricField(metric) {
    switch (metric) {
      case 'ticketsGradedByGrader':
        return '$ticketsGraded';
      case 'avgScoreGiven':
        return { $round: ['$avgScoreGiven', 1] };
      case 'avgFeedbackLength':
        return { $round: ['$avgFeedbackLength', 0] };
      case 'avgNotesLength':
        return { $round: ['$avgNotesLength', 0] };
      case 'dailyOutput':
        return { $round: ['$dailyOutput', 1] };
      default:
        return '$ticketsGraded';
    }
  }

  /**
   * Get time-based metric field
   */
  getTimeBasedMetricField(metric) {
    switch (metric) {
      case 'dailyTicketVolume':
      case 'weeklyTicketVolume':
      case 'monthlyTicketVolume':
        return '$ticketCount';
      case 'gradedCount':
        return '$gradedCount';
      default:
        return '$ticketCount';
    }
  }

  /**
   * Build segment reshape stages
   */
  buildSegmentReshape(viewBy, segmentBy) {
    // This is used when we have both viewBy and segmentBy
    // to restructure the data for multi-series charts
    return [
      {
        $group: {
          _id: '$_id.view',
          name: { $first: '$name' },
          segments: {
            $push: {
              segment: '$_id.segment',
              value: '$value',
              count: '$count'
            }
          },
          total: { $sum: '$value' }
        }
      },
      {
        $project: {
          _id: 0,
          name: 1,
          value: '$total',
          segments: 1
        }
      }
    ];
  }

  /**
   * Merge report and chart filters
   */
  mergeFilters(reportFilters, chartFilters) {
    if (!reportFilters && !chartFilters) return null;
    if (!reportFilters) return chartFilters;
    if (!chartFilters) return reportFilters;

    // Combine with AND logic
    return {
      logic: 'AND',
      conditions: [],
      groups: [reportFilters, chartFilters]
    };
  }

  /**
   * Format value based on metric type
   */
  formatValue(value, metric) {
    if (value === null || value === undefined) return 'N/A';

    const percentageMetrics = ['qualityScorePercent', 'avgScore', 'gradingRate', 'avgScoreGiven'];
    if (percentageMetrics.includes(metric)) {
      return `${value.toFixed(1)}%`;
    }

    if (metric.includes('Length') || metric.includes('Count')) {
      return Math.round(value).toLocaleString();
    }

    if (metric.includes('time') || metric.includes('Time')) {
      // Convert ms to human readable
      const hours = Math.floor(value / 3600000);
      const mins = Math.floor((value % 3600000) / 60000);
      if (hours > 0) return `${hours}h ${mins}m`;
      return `${mins}m`;
    }

    return value.toFixed(1);
  }
}

module.exports = new AggregationEngine();
