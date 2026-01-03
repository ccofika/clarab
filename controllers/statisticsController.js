const StatisticCard = require('../models/StatisticCard');
const Ticket = require('../models/Ticket');
const Agent = require('../models/Agent');
const User = require('../models/User');

// Helper function to build date filter based on time range
// Uses dateEntered (when ticket was created) instead of gradedDate
const buildDateFilter = (timeRange) => {
  const now = new Date();
  let startDate, endDate;

  // Handle both string and object time range formats
  const rangeType = typeof timeRange === 'string' ? timeRange : timeRange?.type;

  switch (rangeType) {
    case 'last7days':
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 7);
      endDate = now;
      break;
    case 'last30days':
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 30);
      endDate = now;
      break;
    case 'last90days':
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 90);
      endDate = now;
      break;
    case 'thisWeek':
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - startDate.getDay());
      startDate.setHours(0, 0, 0, 0);
      endDate = now;
      break;
    case 'thisMonth':
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      endDate = now;
      break;
    case 'lastMonth':
      startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      endDate = new Date(now.getFullYear(), now.getMonth(), 0);
      break;
    case 'thisYear':
      startDate = new Date(now.getFullYear(), 0, 1);
      endDate = now;
      break;
    case 'custom':
      startDate = timeRange?.startDate ? new Date(timeRange.startDate) : null;
      endDate = timeRange?.endDate ? new Date(timeRange.endDate) : null;
      break;
    case 'all':
    default:
      return {}; // No date filter for "all"
  }

  const filter = {};
  if (startDate) filter.$gte = startDate;
  if (endDate) filter.$lte = endDate;

  // Use dateEntered (ticket creation date) for filtering
  return Object.keys(filter).length > 0 ? { dateEntered: filter } : {};
};

// Helper function to apply conditions to query
const applyConditions = (conditions) => {
  if (!conditions || conditions.length === 0) return {};

  const andConditions = [];
  const orConditions = [];

  conditions.forEach(cond => {
    let mongoCondition;
    const field = cond.field;
    const value = cond.value;

    switch (cond.operator) {
      case 'equals':
        mongoCondition = { [field]: value };
        break;
      case 'notEquals':
        mongoCondition = { [field]: { $ne: value } };
        break;
      case 'gt':
        mongoCondition = { [field]: { $gt: Number(value) } };
        break;
      case 'gte':
        mongoCondition = { [field]: { $gte: Number(value) } };
        break;
      case 'lt':
        mongoCondition = { [field]: { $lt: Number(value) } };
        break;
      case 'lte':
        mongoCondition = { [field]: { $lte: Number(value) } };
        break;
      case 'between':
        if (Array.isArray(value) && value.length === 2) {
          mongoCondition = { [field]: { $gte: Number(value[0]), $lte: Number(value[1]) } };
        }
        break;
      case 'in':
        mongoCondition = { [field]: { $in: Array.isArray(value) ? value : [value] } };
        break;
      case 'notIn':
        mongoCondition = { [field]: { $nin: Array.isArray(value) ? value : [value] } };
        break;
      case 'contains':
        mongoCondition = { [field]: { $regex: value, $options: 'i' } };
        break;
      case 'startsWith':
        mongoCondition = { [field]: { $regex: `^${value}`, $options: 'i' } };
        break;
      case 'endsWith':
        mongoCondition = { [field]: { $regex: `${value}$`, $options: 'i' } };
        break;
      default:
        return;
    }

    if (mongoCondition) {
      if (cond.logic === 'OR') {
        orConditions.push(mongoCondition);
      } else {
        andConditions.push(mongoCondition);
      }
    }
  });

  const result = {};
  if (andConditions.length > 0) {
    result.$and = andConditions;
  }
  if (orConditions.length > 0) {
    result.$or = orConditions;
  }

  return result;
};

// Get quality grade from score
const getQualityGrade = (score) => {
  if (score >= 95) return 'A+';
  if (score >= 90) return 'A';
  if (score >= 85) return 'B+';
  if (score >= 80) return 'B';
  if (score >= 75) return 'C+';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
};

// ==========================================
// CS AGENT METRICS (Customer Support - being graded)
// ==========================================

// Fetch quality score data
const fetchQualityScoreData = async (baseFilter, groupBy, aggregation) => {
  const filter = { ...baseFilter, status: 'Graded', qualityScorePercent: { $exists: true } };

  if (groupBy === 'none' || !groupBy) {
    const result = await Ticket.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          value: aggregation === 'avg' ? { $avg: '$qualityScorePercent' } :
                 aggregation === 'max' ? { $max: '$qualityScorePercent' } :
                 aggregation === 'min' ? { $min: '$qualityScorePercent' } :
                 { $avg: '$qualityScorePercent' },
          count: { $sum: 1 }
        }
      }
    ]);

    return {
      value: result[0]?.value ? Math.round(result[0].value * 10) / 10 : 0,
      count: result[0]?.count || 0,
      trend: 0
    };
  }

  let groupField;
  let sortField = '_id';

  switch (groupBy) {
    case 'agent':
      groupField = '$agent';
      break;
    case 'grader':
      groupField = '$createdBy';
      break;
    case 'category':
      groupField = '$category';
      break;
    case 'priority':
      groupField = '$priority';
      break;
    case 'week':
      groupField = { week: '$weekNumber', year: '$weekYear' };
      sortField = { '_id.year': 1, '_id.week': 1 };
      break;
    case 'month':
      groupField = { $month: '$gradedDate' };
      break;
    case 'day':
      groupField = { $dateToString: { format: '%Y-%m-%d', date: '$gradedDate' } };
      break;
    default:
      groupField = null;
  }

  const pipeline = [
    { $match: filter },
    {
      $group: {
        _id: groupField,
        value: { $avg: '$qualityScorePercent' },
        count: { $sum: 1 }
      }
    },
    { $sort: typeof sortField === 'string' ? { [sortField]: 1 } : sortField }
  ];

  // Populate agent names if grouping by agent
  if (groupBy === 'agent') {
    pipeline.push({
      $lookup: {
        from: 'agents',
        localField: '_id',
        foreignField: '_id',
        as: 'agentInfo'
      }
    });
    pipeline.push({
      $addFields: {
        label: { $arrayElemAt: ['$agentInfo.name', 0] }
      }
    });
  }

  // Populate grader names if grouping by grader
  if (groupBy === 'grader') {
    pipeline.push({
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'graderInfo'
      }
    });
    pipeline.push({
      $addFields: {
        label: { $arrayElemAt: ['$graderInfo.name', 0] }
      }
    });
  }

  const results = await Ticket.aggregate(pipeline);

  // Return data in Recharts format: [{ name, value, count }, ...]
  return results.map(r => {
    let name;
    if (groupBy === 'agent' || groupBy === 'grader') {
      name = r.label || 'Unknown';
    } else if (groupBy === 'week') {
      name = `W${r._id?.week} ${r._id?.year}`;
    } else {
      name = r._id || 'Unknown';
    }
    return {
      name,
      value: Math.round(r.value * 10) / 10,
      count: r.count
    };
  });
};

// Fetch ticket count data
const fetchTicketCountData = async (baseFilter, groupBy, metric) => {
  let filter = { ...baseFilter };

  if (metric === 'gradedCount') {
    filter.status = 'Graded';
  } else if (metric === 'selectedCount') {
    filter.status = 'Selected';
  }

  if (groupBy === 'none' || !groupBy) {
    const count = await Ticket.countDocuments(filter);
    return { value: count, trend: 0 };
  }

  let groupField;
  switch (groupBy) {
    case 'agent':
      groupField = '$agent';
      break;
    case 'grader':
      groupField = '$createdBy';
      break;
    case 'category':
      groupField = '$category';
      break;
    case 'priority':
      groupField = '$priority';
      break;
    case 'day':
      groupField = { $dateToString: { format: '%Y-%m-%d', date: '$dateEntered' } };
      break;
    case 'week':
      groupField = { week: '$weekNumber', year: '$weekYear' };
      break;
    case 'month':
      groupField = { $month: '$dateEntered' };
      break;
    default:
      groupField = null;
  }

  const pipeline = [
    { $match: filter },
    { $group: { _id: groupField, count: { $sum: 1 } } },
    { $sort: { _id: 1 } }
  ];

  if (groupBy === 'agent') {
    pipeline.push({
      $lookup: {
        from: 'agents',
        localField: '_id',
        foreignField: '_id',
        as: 'agentInfo'
      }
    });
    pipeline.push({
      $addFields: {
        label: { $arrayElemAt: ['$agentInfo.name', 0] }
      }
    });
  }

  if (groupBy === 'grader') {
    pipeline.push({
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'graderInfo'
      }
    });
    pipeline.push({
      $addFields: {
        label: { $arrayElemAt: ['$graderInfo.name', 0] }
      }
    });
  }

  const results = await Ticket.aggregate(pipeline);

  return {
    labels: results.map(r => {
      if (groupBy === 'agent' || groupBy === 'grader') return r.label || 'Unknown';
      if (groupBy === 'week') return `W${r._id?.week} ${r._id?.year}`;
      return r._id || 'Unknown';
    }),
    values: results.map(r => r.count)
  };
};

// Fetch time to grade data
const fetchTimeToGradeData = async (baseFilter, groupBy) => {
  const filter = {
    ...baseFilter,
    status: 'Graded',
    gradedDate: { $exists: true },
    dateEntered: { $exists: true }
  };

  const pipeline = [
    { $match: filter },
    {
      $addFields: {
        timeToGradeHours: {
          $divide: [{ $subtract: ['$gradedDate', '$dateEntered'] }, 1000 * 60 * 60]
        }
      }
    }
  ];

  if (groupBy === 'none' || !groupBy) {
    pipeline.push({
      $group: {
        _id: null,
        avgTime: { $avg: '$timeToGradeHours' },
        count: { $sum: 1 }
      }
    });
    const result = await Ticket.aggregate(pipeline);
    return {
      value: result[0]?.avgTime ? Math.round(result[0].avgTime * 10) / 10 : 0,
      count: result[0]?.count || 0,
      unit: 'hours'
    };
  }

  let groupField;
  if (groupBy === 'agent') groupField = '$agent';
  else if (groupBy === 'grader') groupField = '$createdBy';
  else if (groupBy === 'category') groupField = '$category';
  else groupField = null;

  pipeline.push({
    $group: {
      _id: groupField,
      avgTime: { $avg: '$timeToGradeHours' },
      count: { $sum: 1 }
    }
  });
  pipeline.push({ $sort: { avgTime: 1 } });

  if (groupBy === 'agent') {
    pipeline.push({
      $lookup: {
        from: 'agents',
        localField: '_id',
        foreignField: '_id',
        as: 'agentInfo'
      }
    });
  }

  if (groupBy === 'grader') {
    pipeline.push({
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'graderInfo'
      }
    });
  }

  const results = await Ticket.aggregate(pipeline);

  return {
    labels: results.map(r => {
      if (groupBy === 'agent') return r.agentInfo?.[0]?.name || 'Unknown';
      if (groupBy === 'grader') return r.graderInfo?.[0]?.name || 'Unknown';
      return r._id || 'Unknown';
    }),
    values: results.map(r => Math.round(r.avgTime * 10) / 10),
    unit: 'hours'
  };
};

// Fetch content length data (notes or feedback)
const fetchContentLengthData = async (baseFilter, groupBy, metric) => {
  const field = metric === 'avgNotesLength' ? '$notes' : '$feedback';
  const filter = {
    ...baseFilter,
    [metric === 'avgNotesLength' ? 'notes' : 'feedback']: { $exists: true, $ne: '' }
  };

  const pipeline = [
    { $match: filter },
    {
      $addFields: {
        contentLength: { $strLenCP: field }
      }
    }
  ];

  if (groupBy === 'none' || !groupBy) {
    pipeline.push({
      $group: {
        _id: null,
        avgLength: { $avg: '$contentLength' },
        count: { $sum: 1 }
      }
    });
    const result = await Ticket.aggregate(pipeline);
    return {
      value: result[0]?.avgLength ? Math.round(result[0].avgLength) : 0,
      count: result[0]?.count || 0,
      unit: 'characters'
    };
  }

  let groupField;
  if (groupBy === 'week') groupField = { week: '$weekNumber', year: '$weekYear' };
  else if (groupBy === 'agent') groupField = '$agent';
  else if (groupBy === 'grader') groupField = '$createdBy';
  else groupField = null;

  pipeline.push({
    $group: {
      _id: groupField,
      avgLength: { $avg: '$contentLength' },
      count: { $sum: 1 }
    }
  });
  pipeline.push({ $sort: { _id: 1 } });

  if (groupBy === 'grader') {
    pipeline.push({
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'graderInfo'
      }
    });
  }

  const results = await Ticket.aggregate(pipeline);

  return {
    labels: results.map(r => {
      if (groupBy === 'week') return `W${r._id?.week} ${r._id?.year}`;
      if (groupBy === 'grader') return r.graderInfo?.[0]?.name || 'Unknown';
      return r._id || 'Unknown';
    }),
    values: results.map(r => Math.round(r.avgLength)),
    unit: 'characters'
  };
};

// Fetch distribution data
const fetchDistributionData = async (baseFilter, field) => {
  const pipeline = [
    { $match: { ...baseFilter, [field]: { $exists: true, $ne: null } } },
    { $group: { _id: `$${field}`, count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ];

  const results = await Ticket.aggregate(pipeline);

  return {
    labels: results.map(r => r._id || 'Unknown'),
    values: results.map(r => r.count)
  };
};

// Fetch score distribution (A+, A, B+, etc.)
const fetchScoreDistribution = async (baseFilter) => {
  const filter = {
    ...baseFilter,
    status: 'Graded',
    qualityScorePercent: { $exists: true }
  };

  const results = await Ticket.aggregate([
    { $match: filter },
    {
      $bucket: {
        groupBy: '$qualityScorePercent',
        boundaries: [0, 60, 70, 75, 80, 85, 90, 95, 101],
        default: 'Other',
        output: { count: { $sum: 1 } }
      }
    }
  ]);

  const gradeLabels = ['F (<60)', 'D (60-69)', 'C (70-74)', 'C+ (75-79)', 'B (80-84)', 'B+ (85-89)', 'A (90-94)', 'A+ (95-100)'];
  const gradeCounts = new Array(8).fill(0);

  results.forEach(r => {
    if (r._id === 0) gradeCounts[0] = r.count;
    else if (r._id === 60) gradeCounts[1] = r.count;
    else if (r._id === 70) gradeCounts[2] = r.count;
    else if (r._id === 75) gradeCounts[3] = r.count;
    else if (r._id === 80) gradeCounts[4] = r.count;
    else if (r._id === 85) gradeCounts[5] = r.count;
    else if (r._id === 90) gradeCounts[6] = r.count;
    else if (r._id === 95) gradeCounts[7] = r.count;
  });

  return {
    labels: gradeLabels,
    values: gradeCounts
  };
};

// Fetch tickets over time
const fetchTicketsOverTime = async (baseFilter, interval) => {
  const groupField = interval === 'week'
    ? { week: '$weekNumber', year: '$weekYear' }
    : { $dateToString: { format: '%Y-%m-%d', date: '$dateEntered' } };

  const results = await Ticket.aggregate([
    { $match: baseFilter },
    { $group: { _id: groupField, count: { $sum: 1 } } },
    { $sort: { _id: 1 } },
    { $limit: 90 }
  ]);

  return {
    labels: results.map(r => {
      if (interval === 'week') return `W${r._id?.week} ${r._id?.year}`;
      return r._id;
    }),
    values: results.map(r => r.count)
  };
};

// Fetch grading rate
const fetchGradingRate = async (baseFilter, groupBy) => {
  if (groupBy === 'none' || !groupBy) {
    const total = await Ticket.countDocuments(baseFilter);
    const graded = await Ticket.countDocuments({ ...baseFilter, status: 'Graded' });
    const rate = total > 0 ? (graded / total) * 100 : 0;

    return {
      value: Math.round(rate * 10) / 10,
      total,
      graded,
      unit: '%'
    };
  }

  return { value: 0, unit: '%' };
};

// Fetch CS agent performance
const fetchAgentPerformance = async (baseFilter) => {
  const results = await Ticket.aggregate([
    { $match: { ...baseFilter, status: 'Graded', qualityScorePercent: { $exists: true } } },
    {
      $group: {
        _id: '$agent',
        avgScore: { $avg: '$qualityScorePercent' },
        ticketCount: { $sum: 1 },
        minScore: { $min: '$qualityScorePercent' },
        maxScore: { $max: '$qualityScorePercent' }
      }
    },
    { $sort: { avgScore: -1 } },
    {
      $lookup: {
        from: 'agents',
        localField: '_id',
        foreignField: '_id',
        as: 'agentInfo'
      }
    }
  ]);

  return {
    data: results.map(r => ({
      agent: r.agentInfo?.[0]?.name || 'Unknown',
      avgScore: Math.round(r.avgScore * 10) / 10,
      ticketCount: r.ticketCount,
      minScore: r.minScore,
      maxScore: r.maxScore,
      grade: getQualityGrade(r.avgScore)
    })),
    labels: results.map(r => r.agentInfo?.[0]?.name || 'Unknown'),
    values: results.map(r => Math.round(r.avgScore * 10) / 10)
  };
};

// Fetch trend data
const fetchTrendData = async (baseFilter, interval) => {
  const groupField = interval === 'month'
    ? { year: { $year: '$gradedDate' }, month: { $month: '$gradedDate' } }
    : { week: '$weekNumber', year: '$weekYear' };

  const results = await Ticket.aggregate([
    { $match: { ...baseFilter, status: 'Graded', qualityScorePercent: { $exists: true } } },
    {
      $group: {
        _id: groupField,
        avgScore: { $avg: '$qualityScorePercent' },
        count: { $sum: 1 }
      }
    },
    { $sort: { '_id.year': 1, '_id.month': 1, '_id.week': 1 } },
    { $limit: 52 }
  ]);

  return {
    labels: results.map(r => {
      if (interval === 'month') return `${r._id?.month}/${r._id?.year}`;
      return `W${r._id?.week} ${r._id?.year}`;
    }),
    values: results.map(r => Math.round(r.avgScore * 10) / 10),
    counts: results.map(r => r.count)
  };
};

// Fetch unresolved issues
const fetchUnresolvedIssues = async () => {
  const results = await Agent.aggregate([
    {
      $project: {
        name: 1,
        unresolvedCount: {
          $size: {
            $filter: {
              input: { $ifNull: ['$unresolvedIssues', []] },
              as: 'issue',
              cond: { $eq: ['$$issue.isResolved', false] }
            }
          }
        }
      }
    },
    { $match: { unresolvedCount: { $gt: 0 } } },
    { $sort: { unresolvedCount: -1 } }
  ]);

  return {
    labels: results.map(r => r.name),
    values: results.map(r => r.unresolvedCount)
  };
};

// ==========================================
// QA AGENT METRICS (Quality Assurance - graders)
// ==========================================

// Fetch grader ticket count
const fetchGraderTicketCount = async (baseFilter, groupBy) => {
  const filter = { ...baseFilter, status: 'Graded' };

  if (groupBy === 'none' || !groupBy) {
    const count = await Ticket.countDocuments(filter);
    return { value: count, trend: 0 };
  }

  const pipeline = [
    { $match: filter },
    { $group: { _id: '$createdBy', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    {
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'graderInfo'
      }
    },
    {
      $addFields: {
        label: { $arrayElemAt: ['$graderInfo.name', 0] }
      }
    }
  ];

  const results = await Ticket.aggregate(pipeline);

  return {
    labels: results.map(r => r.label || 'Unknown'),
    values: results.map(r => r.count)
  };
};

// Fetch grader average score given
const fetchGraderAvgScoreGiven = async (baseFilter) => {
  const filter = { ...baseFilter, status: 'Graded', qualityScorePercent: { $exists: true } };

  const results = await Ticket.aggregate([
    { $match: filter },
    {
      $group: {
        _id: '$createdBy',
        avgScore: { $avg: '$qualityScorePercent' },
        count: { $sum: 1 }
      }
    },
    { $sort: { avgScore: -1 } },
    {
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'graderInfo'
      }
    },
    {
      $addFields: {
        label: { $arrayElemAt: ['$graderInfo.name', 0] }
      }
    }
  ]);

  return {
    labels: results.map(r => r.label || 'Unknown'),
    values: results.map(r => Math.round(r.avgScore * 10) / 10),
    counts: results.map(r => r.count)
  };
};

// Fetch grader daily/weekly output
const fetchGraderOutput = async (baseFilter, interval) => {
  const filter = { ...baseFilter, status: 'Graded' };

  const groupField = interval === 'week'
    ? { week: '$weekNumber', year: '$weekYear' }
    : { $dateToString: { format: '%Y-%m-%d', date: '$gradedDate' } };

  const results = await Ticket.aggregate([
    { $match: filter },
    { $group: { _id: groupField, count: { $sum: 1 } } },
    { $sort: { _id: 1 } },
    { $limit: 90 }
  ]);

  return {
    labels: results.map(r => {
      if (interval === 'week') return `W${r._id?.week} ${r._id?.year}`;
      return r._id;
    }),
    values: results.map(r => r.count)
  };
};

// Fetch grader feedback/notes length
const fetchGraderContentLength = async (baseFilter, metric) => {
  const field = metric === 'graderNotesLength' ? '$notes' : '$feedback';
  const fieldName = metric === 'graderNotesLength' ? 'notes' : 'feedback';

  const filter = {
    ...baseFilter,
    status: 'Graded',
    [fieldName]: { $exists: true, $ne: '' }
  };

  const results = await Ticket.aggregate([
    { $match: filter },
    {
      $addFields: {
        contentLength: { $strLenCP: field }
      }
    },
    {
      $group: {
        _id: '$createdBy',
        avgLength: { $avg: '$contentLength' },
        count: { $sum: 1 }
      }
    },
    { $sort: { avgLength: -1 } },
    {
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'graderInfo'
      }
    },
    {
      $addFields: {
        label: { $arrayElemAt: ['$graderInfo.name', 0] }
      }
    }
  ]);

  return {
    labels: results.map(r => r.label || 'Unknown'),
    values: results.map(r => Math.round(r.avgLength)),
    counts: results.map(r => r.count),
    unit: 'characters'
  };
};

// Fetch grader category breakdown
const fetchGraderCategoryBreakdown = async (baseFilter) => {
  const filter = { ...baseFilter, status: 'Graded', category: { $exists: true, $ne: null } };

  const results = await Ticket.aggregate([
    { $match: filter },
    {
      $group: {
        _id: { grader: '$createdBy', category: '$category' },
        count: { $sum: 1 }
      }
    },
    {
      $lookup: {
        from: 'users',
        localField: '_id.grader',
        foreignField: '_id',
        as: 'graderInfo'
      }
    },
    {
      $addFields: {
        graderName: { $arrayElemAt: ['$graderInfo.name', 0] }
      }
    },
    { $sort: { count: -1 } }
  ]);

  // Transform for heatmap format
  const graders = [...new Set(results.map(r => r.graderName || 'Unknown'))];
  const categories = [...new Set(results.map(r => r._id.category))];

  const heatmapData = graders.map(grader => {
    const graderData = { grader };
    categories.forEach(cat => {
      const match = results.find(r => r.graderName === grader && r._id.category === cat);
      graderData[cat] = match ? match.count : 0;
    });
    return graderData;
  });

  return {
    data: heatmapData,
    graders,
    categories,
    labels: graders,
    values: graders.map(g => results.filter(r => r.graderName === g).reduce((sum, r) => sum + r.count, 0))
  };
};

// Fetch grader score distribution
const fetchGraderScoreDistribution = async (baseFilter) => {
  const filter = {
    ...baseFilter,
    status: 'Graded',
    qualityScorePercent: { $exists: true }
  };

  const results = await Ticket.aggregate([
    { $match: filter },
    {
      $bucket: {
        groupBy: '$qualityScorePercent',
        boundaries: [0, 60, 70, 75, 80, 85, 90, 95, 101],
        default: 'Other',
        output: { count: { $sum: 1 } }
      }
    }
  ]);

  const gradeLabels = ['F (<60)', 'D (60-69)', 'C (70-74)', 'C+ (75-79)', 'B (80-84)', 'B+ (85-89)', 'A (90-94)', 'A+ (95-100)'];
  const gradeCounts = new Array(8).fill(0);

  results.forEach(r => {
    if (r._id === 0) gradeCounts[0] = r.count;
    else if (r._id === 60) gradeCounts[1] = r.count;
    else if (r._id === 70) gradeCounts[2] = r.count;
    else if (r._id === 75) gradeCounts[3] = r.count;
    else if (r._id === 80) gradeCounts[4] = r.count;
    else if (r._id === 85) gradeCounts[5] = r.count;
    else if (r._id === 90) gradeCounts[6] = r.count;
    else if (r._id === 95) gradeCounts[7] = r.count;
  });

  return {
    labels: gradeLabels,
    values: gradeCounts
  };
};

// Fetch grader comparison (comprehensive stats)
const fetchGraderComparison = async (baseFilter) => {
  const filter = { ...baseFilter, status: 'Graded' };

  const results = await Ticket.aggregate([
    { $match: filter },
    {
      $addFields: {
        feedbackLength: { $cond: [{ $ifNull: ['$feedback', false] }, { $strLenCP: '$feedback' }, 0] },
        notesLength: { $cond: [{ $ifNull: ['$notes', false] }, { $strLenCP: '$notes' }, 0] }
      }
    },
    {
      $group: {
        _id: '$createdBy',
        ticketCount: { $sum: 1 },
        avgScore: { $avg: '$qualityScorePercent' },
        minScore: { $min: '$qualityScorePercent' },
        maxScore: { $max: '$qualityScorePercent' },
        avgFeedbackLength: { $avg: '$feedbackLength' },
        avgNotesLength: { $avg: '$notesLength' }
      }
    },
    { $sort: { ticketCount: -1 } },
    {
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'graderInfo'
      }
    },
    {
      $addFields: {
        graderName: { $arrayElemAt: ['$graderInfo.name', 0] },
        graderEmail: { $arrayElemAt: ['$graderInfo.email', 0] }
      }
    }
  ]);

  return {
    data: results.map(r => ({
      grader: r.graderName || 'Unknown',
      email: r.graderEmail || '',
      ticketCount: r.ticketCount,
      avgScore: r.avgScore ? Math.round(r.avgScore * 10) / 10 : null,
      minScore: r.minScore,
      maxScore: r.maxScore,
      avgFeedbackLength: Math.round(r.avgFeedbackLength || 0),
      avgNotesLength: Math.round(r.avgNotesLength || 0),
      grade: r.avgScore ? getQualityGrade(r.avgScore) : null
    })),
    labels: results.map(r => r.graderName || 'Unknown'),
    values: results.map(r => r.ticketCount)
  };
};

// Fetch grader productivity trend
const fetchGraderTrend = async (baseFilter) => {
  const filter = { ...baseFilter, status: 'Graded' };

  const results = await Ticket.aggregate([
    { $match: filter },
    {
      $group: {
        _id: { week: '$weekNumber', year: '$weekYear' },
        count: { $sum: 1 }
      }
    },
    { $sort: { '_id.year': 1, '_id.week': 1 } },
    { $limit: 52 }
  ]);

  return {
    labels: results.map(r => `W${r._id?.week} ${r._id?.year}`),
    values: results.map(r => r.count)
  };
};

// ==========================================
// MAIN FETCH FUNCTION
// ==========================================

const fetchStatisticData = async (card, userId = null) => {
  const dateFilter = buildDateFilter(card.timeRange);
  const conditionsFilter = applyConditions(card.conditions);

  const baseFilter = {
    ...dateFilter,
    ...conditionsFilter,
    isArchived: false
  };

  let result;

  try {
    switch (card.metric) {
      // CS Agent metrics
      case 'qualityScorePercent':
        result = await fetchQualityScoreData(baseFilter, card.groupBy, card.aggregation);
        break;

      case 'ticketCount':
      case 'gradedCount':
      case 'selectedCount':
        result = await fetchTicketCountData(baseFilter, card.groupBy, card.metric);
        break;

      case 'avgTimeToGrade':
        result = await fetchTimeToGradeData(baseFilter, card.groupBy);
        break;

      case 'avgNotesLength':
      case 'avgFeedbackLength':
        result = await fetchContentLengthData(baseFilter, card.groupBy, card.metric);
        break;

      case 'categoryDistribution':
        result = await fetchDistributionData(baseFilter, 'category');
        break;

      case 'priorityDistribution':
        result = await fetchDistributionData(baseFilter, 'priority');
        break;

      case 'scoreDistribution':
        result = await fetchScoreDistribution(baseFilter);
        break;

      case 'ticketsPerDay':
      case 'ticketsPerWeek':
        result = await fetchTicketsOverTime(baseFilter, card.metric === 'ticketsPerWeek' ? 'week' : 'day');
        break;

      case 'gradingRate':
        result = await fetchGradingRate(baseFilter, card.groupBy);
        break;

      case 'agentPerformance':
        result = await fetchAgentPerformance(baseFilter);
        break;

      case 'weeklyTrend':
      case 'monthlyTrend':
        result = await fetchTrendData(baseFilter, card.metric === 'monthlyTrend' ? 'month' : 'week');
        break;

      case 'unresolvedIssues':
        result = await fetchUnresolvedIssues();
        break;

      // QA Agent (Grader) metrics
      case 'graderTicketCount':
        result = await fetchGraderTicketCount(baseFilter, card.groupBy);
        break;

      case 'graderAvgScoreGiven':
        result = await fetchGraderAvgScoreGiven(baseFilter);
        break;

      case 'graderActivity':
      case 'graderDailyOutput':
        result = await fetchGraderOutput(baseFilter, 'day');
        break;

      case 'graderWeeklyOutput':
        result = await fetchGraderOutput(baseFilter, 'week');
        break;

      case 'graderFeedbackLength':
      case 'graderNotesLength':
        result = await fetchGraderContentLength(baseFilter, card.metric);
        break;

      case 'graderCategoryBreakdown':
        result = await fetchGraderCategoryBreakdown(baseFilter);
        break;

      case 'graderScoreDistribution':
        result = await fetchGraderScoreDistribution(baseFilter);
        break;

      case 'graderComparison':
        result = await fetchGraderComparison(baseFilter);
        break;

      case 'graderTrend':
        result = await fetchGraderTrend(baseFilter);
        break;

      default:
        result = { error: 'Unknown metric' };
    }

    // Transform old format { labels: [], values: [] } to Recharts format [{ name, value }, ...]
    if (result && result.labels && result.values) {
      const transformed = result.labels.map((label, i) => ({
        name: String(label || 'Unknown'),
        value: result.values[i] || 0,
        count: result.counts ? result.counts[i] : undefined
      }));
      return transformed;
    }

    // If result is already an array, return as-is
    if (Array.isArray(result)) {
      return result;
    }

    // If result is a simple object (KPI), return as-is
    return result;
  } catch (error) {
    console.error('Error fetching statistic data:', error);
    return { error: error.message };
  }
};

// ==========================================
// CONTROLLER METHODS
// ==========================================

// Get all statistic cards for a user
exports.getStatisticCards = async (req, res) => {
  try {
    const cards = await StatisticCard.find({ userId: req.user._id })
      .sort({ order: 1, createdAt: -1 });

    res.json({ data: cards });
  } catch (error) {
    console.error('Error fetching statistic cards:', error);
    res.status(500).json({ message: 'Failed to fetch statistic cards' });
  }
};

// Get statistic cards for another user (view-only)
exports.getStatisticCardsForUser = async (req, res) => {
  try {
    const { userId } = req.params;

    const allowedEmails = ['filipkozomara@mebit.io', 'nevena@mebit.io'];
    if (!allowedEmails.includes(req.user.email)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const cards = await StatisticCard.find({ userId })
      .sort({ order: 1, createdAt: -1 });

    res.json({ data: cards });
  } catch (error) {
    console.error('Error fetching statistic cards for user:', error);
    res.status(500).json({ message: 'Failed to fetch statistic cards' });
  }
};

// Get single statistic card
exports.getStatisticCard = async (req, res) => {
  try {
    const card = await StatisticCard.findById(req.params.id);

    if (!card) {
      return res.status(404).json({ message: 'Statistic card not found' });
    }

    res.json({ data: card });
  } catch (error) {
    console.error('Error fetching statistic card:', error);
    res.status(500).json({ message: 'Failed to fetch statistic card' });
  }
};

// Create statistic card
exports.createStatisticCard = async (req, res) => {
  try {
    const {
      title, description, chartType, metric, aggregation, groupBy, agentType,
      conditions, timeRange, layout, styling, autoRefresh, refreshInterval
    } = req.body;

    const maxOrderCard = await StatisticCard.findOne({ userId: req.user._id })
      .sort({ order: -1 })
      .select('order');
    const newOrder = (maxOrderCard?.order || 0) + 1;

    const card = new StatisticCard({
      userId: req.user._id,
      title,
      description,
      chartType,
      metric,
      aggregation,
      groupBy,
      agentType: agentType || 'cs',
      conditions: conditions || [],
      timeRange: timeRange || { type: 'last30days' },
      layout: layout || { x: 0, y: Infinity, w: 4, h: 3 },
      styling: styling || {},
      autoRefresh: autoRefresh !== false,
      refreshInterval: refreshInterval || 5,
      order: newOrder
    });

    await card.save();
    res.status(201).json({ data: card });
  } catch (error) {
    console.error('Error creating statistic card:', error);
    res.status(500).json({ message: 'Failed to create statistic card', error: error.message });
  }
};

// Create from template
exports.createFromTemplate = async (req, res) => {
  try {
    const { templateId } = req.body;

    const templates = StatisticCard.getTemplates();
    const template = templates.find(t => t.id === templateId);

    if (!template) {
      return res.status(404).json({ message: 'Template not found' });
    }

    const maxOrderCard = await StatisticCard.findOne({ userId: req.user._id })
      .sort({ order: -1 })
      .select('order');
    const newOrder = (maxOrderCard?.order || 0) + 1;

    const card = new StatisticCard({
      userId: req.user._id,
      title: template.title,
      description: template.description,
      chartType: template.chartType,
      metric: template.metric,
      aggregation: template.aggregation,
      groupBy: template.groupBy,
      timeRange: template.timeRange,
      layout: { ...template.layout, x: 0, y: Infinity },
      templateId: template.id,
      isTemplate: false,
      order: newOrder
    });

    await card.save();
    res.status(201).json({ data: card });
  } catch (error) {
    console.error('Error creating from template:', error);
    res.status(500).json({ message: 'Failed to create from template' });
  }
};

// Update statistic card
exports.updateStatisticCard = async (req, res) => {
  try {
    const card = await StatisticCard.findById(req.params.id);

    if (!card) {
      return res.status(404).json({ message: 'Statistic card not found' });
    }

    if (card.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to update this card' });
    }

    const updates = req.body;
    Object.keys(updates).forEach(key => {
      if (key !== 'userId' && key !== '_id') {
        card[key] = updates[key];
      }
    });

    await card.save();
    res.json({ data: card });
  } catch (error) {
    console.error('Error updating statistic card:', error);
    res.status(500).json({ message: 'Failed to update statistic card' });
  }
};

// Update multiple card layouts (for drag/resize)
exports.updateCardLayouts = async (req, res) => {
  try {
    const { updates } = req.body;

    if (!updates || !Array.isArray(updates) || updates.length === 0) {
      return res.json({ message: 'No updates to process' });
    }

    const updatePromises = updates.map(item =>
      StatisticCard.findOneAndUpdate(
        { _id: item.id, userId: req.user._id },
        { layout: item.layout },
        { new: true }
      )
    );

    await Promise.all(updatePromises);
    res.json({ message: 'Layouts updated successfully' });
  } catch (error) {
    console.error('Error updating layouts:', error);
    res.status(500).json({ message: 'Failed to update layouts' });
  }
};

// Delete statistic card
exports.deleteStatisticCard = async (req, res) => {
  try {
    const card = await StatisticCard.findById(req.params.id);

    if (!card) {
      return res.status(404).json({ message: 'Statistic card not found' });
    }

    if (card.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to delete this card' });
    }

    await StatisticCard.findByIdAndDelete(req.params.id);
    res.json({ message: 'Statistic card deleted successfully' });
  } catch (error) {
    console.error('Error deleting statistic card:', error);
    res.status(500).json({ message: 'Failed to delete statistic card' });
  }
};

// Fetch data for a card (live preview or refresh)
exports.fetchCardData = async (req, res) => {
  try {
    const { id } = req.params;

    let cardConfig;

    if (id === 'preview') {
      cardConfig = req.body;
    } else {
      const card = await StatisticCard.findById(id);
      if (!card) {
        return res.status(404).json({ message: 'Statistic card not found' });
      }
      cardConfig = card;
    }

    const data = await fetchStatisticData(cardConfig, req.user._id);

    res.json({
      data,
      fetchedAt: new Date()
    });
  } catch (error) {
    console.error('Error fetching card data:', error);
    res.status(500).json({ message: 'Failed to fetch card data', error: error.message });
  }
};

// Get available templates
exports.getTemplates = async (req, res) => {
  try {
    const templates = StatisticCard.getTemplates();
    res.json({ data: templates });
  } catch (error) {
    console.error('Error fetching templates:', error);
    res.status(500).json({ message: 'Failed to fetch templates' });
  }
};

// Get metadata (available metrics, operators, etc.)
exports.getMetadata = async (req, res) => {
  try {
    const { AVAILABLE_METRICS, AGGREGATIONS, GROUP_BY_OPTIONS, CHART_TYPES, OPERATORS } = require('../models/StatisticCard');

    const categories = await Ticket.distinct('category');
    const priorities = await Ticket.distinct('priority');

    const agents = await Agent.find({ isRemoved: { $ne: true } })
      .select('name team position')
      .sort({ name: 1 });

    // Get QA agents (graders)
    const qaEmails = ['filipkozomara@mebit.io', 'vasilijevitorovic@mebit.io', 'nevena@mebit.io', 'mladenjorganovic@mebit.io'];
    const graders = await User.find({ email: { $in: qaEmails } })
      .select('_id email name');

    // Helper to create readable labels from camelCase
    const toLabel = (str) => {
      return str
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, s => s.toUpperCase())
        .replace('Grader ', 'QA Agent ')
        .trim();
    };

    res.json({
      data: {
        metrics: AVAILABLE_METRICS.map(m => ({ value: m, label: toLabel(m) })),
        aggregations: AGGREGATIONS.map(a => ({ value: a, label: toLabel(a) })),
        groupByOptions: GROUP_BY_OPTIONS.map(g => ({ value: g, label: toLabel(g) })),
        chartTypes: CHART_TYPES.map(c => ({ value: c, label: toLabel(c) })),
        operators: OPERATORS.map(o => ({ value: o, label: toLabel(o) })),
        categories: categories.filter(c => c),
        priorities: priorities.filter(p => p),
        agents: agents.map(a => ({ id: a._id, name: a.name, team: a.team, position: a.position })),
        graders: graders.map(g => ({ id: g._id, name: g.name, email: g.email }))
      }
    });
  } catch (error) {
    console.error('Error fetching metadata:', error);
    res.status(500).json({ message: 'Failed to fetch metadata' });
  }
};

// Get statistics users (for switching between Nevena/Filip views)
exports.getStatisticsUsers = async (req, res) => {
  try {
    const allowedEmails = ['filipkozomara@mebit.io', 'nevena@mebit.io'];

    if (!allowedEmails.includes(req.user.email)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const users = await User.find({ email: { $in: allowedEmails } })
      .select('_id email name');

    res.json({ data: users });
  } catch (error) {
    console.error('Error fetching statistics users:', error);
    res.status(500).json({ message: 'Failed to fetch users' });
  }
};
