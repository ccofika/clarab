/**
 * Report Controller
 *
 * Handles all API endpoints for the new Statistics/Reports system.
 */

const StatisticReport = require('../models/StatisticReport');
const StatisticChart = require('../models/StatisticChart');
const AggregationEngine = require('../services/AggregationEngine');
const Agent = require('../models/Agent');
const User = require('../models/User');

// Helper to clean chart data - remove empty strings for optional enum fields
const sanitizeChartData = (data) => {
  const cleaned = { ...data };

  // Fields that should be undefined/null instead of empty string
  const enumFields = ['segmentBy', 'viewBy', 'sortBy', 'sortOrder', 'aggregation'];

  enumFields.forEach(field => {
    if (cleaned[field] === '' || cleaned[field] === null) {
      delete cleaned[field];
    }
  });

  return cleaned;
};

// ============================================
// REPORT CRUD
// ============================================

/**
 * Get all reports for current user
 */
exports.getReports = async (req, res) => {
  try {
    const userId = req.user._id;

    const reports = await StatisticReport.find({
      $or: [
        { owner: userId },
        { sharedWith: userId },
        { visibility: 'public' }
      ],
      isTemplate: false
    })
      .populate('owner', 'name email')
      .sort({ isPinned: -1, updatedAt: -1 });

    // Get chart counts
    const reportIds = reports.map(r => r._id);
    const chartCounts = await StatisticChart.aggregate([
      { $match: { report: { $in: reportIds } } },
      { $group: { _id: '$report', count: { $sum: 1 } } }
    ]);

    const countMap = {};
    chartCounts.forEach(c => { countMap[c._id.toString()] = c.count; });

    const reportsWithCounts = reports.map(r => ({
      ...r.toObject(),
      chartsCount: countMap[r._id.toString()] || 0
    }));

    res.json({ success: true, data: reportsWithCounts });
  } catch (error) {
    console.error('Error fetching reports:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Get single report with all charts
 */
exports.getReport = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const report = await StatisticReport.findById(id)
      .populate('owner', 'name email')
      .populate('sharedWith', 'name email');

    if (!report) {
      return res.status(404).json({ success: false, message: 'Report not found' });
    }

    // Check access
    if (!report.canView(userId)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    // Get charts
    const charts = await StatisticChart.find({ report: id }).sort({ order: 1 });

    // Update last viewed
    report.lastViewedAt = new Date();
    await report.save();

    res.json({
      success: true,
      data: {
        ...report.toObject(),
        charts,
        canEdit: report.canEdit(userId)
      }
    });
  } catch (error) {
    console.error('Error fetching report:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Create new report
 */
exports.createReport = async (req, res) => {
  try {
    const userId = req.user._id;
    const { title, description, visibility, dateRange, filters } = req.body;

    const report = new StatisticReport({
      title,
      description,
      owner: userId,
      visibility: visibility || 'private',
      dateRange: dateRange || { type: 'last30days' },
      filters
    });

    await report.save();

    res.status(201).json({ success: true, data: report });
  } catch (error) {
    console.error('Error creating report:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Update report
 */
exports.updateReport = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;
    const updates = req.body;

    const report = await StatisticReport.findById(id);

    if (!report) {
      return res.status(404).json({ success: false, message: 'Report not found' });
    }

    if (!report.canEdit(userId)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    // Update allowed fields
    const allowedFields = ['title', 'description', 'visibility', 'sharedWith', 'filters', 'dateRange', 'dateField', 'autoRefresh', 'sections', 'isPinned'];
    allowedFields.forEach(field => {
      if (updates[field] !== undefined) {
        report[field] = updates[field];
      }
    });

    await report.save();

    res.json({ success: true, data: report });
  } catch (error) {
    console.error('Error updating report:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Delete report
 */
exports.deleteReport = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const report = await StatisticReport.findById(id);

    if (!report) {
      return res.status(404).json({ success: false, message: 'Report not found' });
    }

    if (!report.canEdit(userId)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    // Delete all charts in this report
    await StatisticChart.deleteMany({ report: id });

    // Delete report
    await report.deleteOne();

    res.json({ success: true, message: 'Report deleted' });
  } catch (error) {
    console.error('Error deleting report:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Duplicate report
 */
exports.duplicateReport = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const originalReport = await StatisticReport.findById(id);

    if (!originalReport) {
      return res.status(404).json({ success: false, message: 'Report not found' });
    }

    if (!originalReport.canView(userId)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    // Create new report
    const newReport = new StatisticReport({
      title: `${originalReport.title} (Copy)`,
      description: originalReport.description,
      owner: userId,
      visibility: 'private',
      filters: originalReport.filters,
      dateRange: originalReport.dateRange,
      dateField: originalReport.dateField,
      layout: originalReport.layout,
      autoRefresh: originalReport.autoRefresh,
      sections: originalReport.sections
    });

    await newReport.save();

    // Duplicate charts
    const originalCharts = await StatisticChart.find({ report: id });
    for (const chart of originalCharts) {
      const newChart = new StatisticChart({
        ...chart.toObject(),
        _id: undefined,
        report: newReport._id,
        createdAt: undefined,
        updatedAt: undefined
      });
      await newChart.save();
    }

    res.status(201).json({ success: true, data: newReport });
  } catch (error) {
    console.error('Error duplicating report:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// CHART CRUD
// ============================================

/**
 * Add chart to report
 */
exports.addChart = async (req, res) => {
  try {
    const { id: reportId } = req.params;
    const userId = req.user._id;
    const chartData = req.body;

    const report = await StatisticReport.findById(reportId);

    if (!report) {
      return res.status(404).json({ success: false, message: 'Report not found' });
    }

    if (!report.canEdit(userId)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    // Get next order number
    const lastChart = await StatisticChart.findOne({ report: reportId }).sort({ order: -1 });
    const order = lastChart ? lastChart.order + 1 : 0;

    // Calculate Y position for new chart
    const existingCharts = await StatisticChart.find({ report: reportId });
    let maxY = 0;
    existingCharts.forEach(c => {
      const bottom = (c.layout?.y || 0) + (c.layout?.h || 4);
      if (bottom > maxY) maxY = bottom;
    });

    // Sanitize chart data to remove empty enum values
    const cleanedData = sanitizeChartData(chartData);

    const chart = new StatisticChart({
      ...cleanedData,
      report: reportId,
      order,
      layout: {
        ...cleanedData.layout,
        x: cleanedData.layout?.x ?? 0,
        y: cleanedData.layout?.y ?? maxY,
        w: cleanedData.layout?.w ?? 6,
        h: cleanedData.layout?.h ?? 4
      }
    });

    await chart.save();

    res.status(201).json({ success: true, data: chart });
  } catch (error) {
    console.error('Error adding chart:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Update chart
 */
exports.updateChart = async (req, res) => {
  try {
    const { id: reportId, chartId } = req.params;
    const userId = req.user._id;
    const updates = req.body;

    const report = await StatisticReport.findById(reportId);

    if (!report) {
      return res.status(404).json({ success: false, message: 'Report not found' });
    }

    if (!report.canEdit(userId)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const chart = await StatisticChart.findOne({ _id: chartId, report: reportId });

    if (!chart) {
      return res.status(404).json({ success: false, message: 'Chart not found' });
    }

    // Sanitize updates to remove empty enum values
    const cleanedUpdates = sanitizeChartData(updates);

    // Update all fields from request
    Object.keys(cleanedUpdates).forEach(key => {
      if (key !== '_id' && key !== 'report') {
        chart[key] = cleanedUpdates[key];
      }
    });

    // Also remove fields that were set to empty string (now deleted from cleanedUpdates)
    ['segmentBy', 'viewBy', 'sortBy', 'sortOrder'].forEach(field => {
      if (updates[field] === '' && chart[field]) {
        chart[field] = undefined;
      }
    });

    await chart.save();

    res.json({ success: true, data: chart });
  } catch (error) {
    console.error('Error updating chart:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Delete chart
 */
exports.deleteChart = async (req, res) => {
  try {
    const { id: reportId, chartId } = req.params;
    const userId = req.user._id;

    const report = await StatisticReport.findById(reportId);

    if (!report) {
      return res.status(404).json({ success: false, message: 'Report not found' });
    }

    if (!report.canEdit(userId)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const chart = await StatisticChart.findOneAndDelete({ _id: chartId, report: reportId });

    if (!chart) {
      return res.status(404).json({ success: false, message: 'Chart not found' });
    }

    res.json({ success: true, message: 'Chart deleted' });
  } catch (error) {
    console.error('Error deleting chart:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Update multiple chart layouts
 */
exports.updateChartLayouts = async (req, res) => {
  try {
    const { id: reportId } = req.params;
    const userId = req.user._id;
    const { layouts } = req.body;

    const report = await StatisticReport.findById(reportId);

    if (!report) {
      return res.status(404).json({ success: false, message: 'Report not found' });
    }

    if (!report.canEdit(userId)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    if (!layouts || !Array.isArray(layouts)) {
      return res.status(400).json({ success: false, message: 'Layouts array required' });
    }

    // Update each chart's layout
    const updatePromises = layouts.map(({ chartId, layout }) =>
      StatisticChart.findOneAndUpdate(
        { _id: chartId, report: reportId },
        { $set: { layout } },
        { new: true }
      )
    );

    await Promise.all(updatePromises);

    res.json({ success: true, message: 'Layouts updated' });
  } catch (error) {
    console.error('Error updating layouts:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// DATA FETCHING
// ============================================

/**
 * Get chart data
 */
exports.getChartData = async (req, res) => {
  try {
    const { chartId } = req.params;
    const userId = req.user._id;

    const chart = await StatisticChart.findById(chartId).populate('report');

    if (!chart) {
      return res.status(404).json({ success: false, message: 'Chart not found' });
    }

    const report = chart.report;
    if (!report.canView(userId)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    // Execute aggregation
    const data = await AggregationEngine.execute(
      chart.toObject(),
      report.filters,
      report.dateRange
    );

    // If comparison is enabled, fetch comparison data
    let comparisonData = null;
    if (chart.comparison?.enabled) {
      comparisonData = await this.getComparisonData(chart, report);
    }

    res.json({
      success: true,
      data: {
        chartData: data,
        comparisonData,
        meta: {
          chartType: chart.chartType,
          title: chart.title,
          lastUpdated: new Date()
        }
      }
    });
  } catch (error) {
    console.error('Error fetching chart data:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Preview chart data (without saving)
 */
exports.previewChartData = async (req, res) => {
  try {
    const chartConfig = req.body;

    // Execute aggregation with provided config
    const data = await AggregationEngine.execute(
      chartConfig,
      chartConfig.reportFilters || null,
      chartConfig.dateRange || { type: 'last30days' }
    );

    res.json({ success: true, data });
  } catch (error) {
    console.error('Error previewing chart data:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Get all chart data for a report
 */
exports.getReportData = async (req, res) => {
  try {
    const { id: reportId } = req.params;
    const userId = req.user._id;

    const report = await StatisticReport.findById(reportId);

    if (!report) {
      return res.status(404).json({ success: false, message: 'Report not found' });
    }

    if (!report.canView(userId)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const charts = await StatisticChart.find({ report: reportId });

    // Fetch data for all charts in parallel
    const chartDataPromises = charts.map(async chart => {
      try {
        const data = await AggregationEngine.execute(
          chart.toObject(),
          report.filters,
          report.dateRange
        );
        return { chartId: chart._id, data, error: null };
      } catch (error) {
        return { chartId: chart._id, data: null, error: error.message };
      }
    });

    const results = await Promise.all(chartDataPromises);

    // Convert to map
    const chartDataMap = {};
    results.forEach(r => {
      chartDataMap[r.chartId.toString()] = { data: r.data, error: r.error };
    });

    res.json({ success: true, data: chartDataMap });
  } catch (error) {
    console.error('Error fetching report data:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Get drill-down data
 */
exports.getDrillDownData = async (req, res) => {
  try {
    const { chartId } = req.params;
    const { filters: drillFilters, page = 1, limit = 20 } = req.body;
    const userId = req.user._id;

    const chart = await StatisticChart.findById(chartId).populate('report');

    if (!chart) {
      return res.status(404).json({ success: false, message: 'Chart not found' });
    }

    if (!chart.report.canView(userId)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    // Build match conditions
    const Ticket = require('../models/Ticket');
    const matchStage = {};

    // Apply report date range
    const dateFilter = AggregationEngine.buildDateFilter(chart.report.dateRange);
    if (dateFilter) Object.assign(matchStage, dateFilter);

    // Apply drill-down specific filters
    if (drillFilters) {
      Object.assign(matchStage, drillFilters);
    }

    // Query tickets
    const skip = (page - 1) * limit;
    const tickets = await Ticket.find(matchStage)
      .populate('agent', 'name')
      .populate('createdBy', 'name email')
      .sort({ dateEntered: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Ticket.countDocuments(matchStage);

    res.json({
      success: true,
      data: {
        tickets,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Error fetching drill-down data:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// METADATA
// ============================================

/**
 * Get all metadata for chart builder
 */
exports.getMetadata = async (req, res) => {
  try {
    const metadata = StatisticChart.getMetadata();

    // Get list of agents for filtering
    const agents = await Agent.find({ isArchived: { $ne: true } })
      .select('name')
      .sort({ name: 1 });

    // Get list of QA agents (users with statistics access)
    const qaAgents = await User.find({
      email: { $in: ['nevena@mebit.io', 'filipkozomara@mebit.io', 'vasilije@mebit.io', 'mladen@mebit.io'] }
    }).select('name email');

    // Get unique categories from tickets
    const Ticket = require('../models/Ticket');
    const categories = await Ticket.distinct('categories');
    const tags = await Ticket.distinct('tags');
    const priorities = ['Low', 'Medium', 'High', 'Critical'];

    res.json({
      success: true,
      data: {
        ...metadata,
        agents: agents.map(a => ({ value: a._id, label: a.name })),
        qaAgents: qaAgents.map(u => ({ value: u._id, label: u.name, email: u.email })),
        categories: categories.filter(c => c).map(c => ({ value: c, label: c })),
        tags: tags.filter(t => t).map(t => ({ value: t, label: t })),
        priorities: priorities.map(p => ({ value: p, label: p })),
        qualityGrades: ['A+', 'A', 'B+', 'B', 'C+', 'C', 'D', 'F'].map(g => ({ value: g, label: g })),
        statuses: ['Selected', 'Graded'].map(s => ({ value: s, label: s })),
        dateRangeOptions: [
          { value: 'today', label: 'Today' },
          { value: 'yesterday', label: 'Yesterday' },
          { value: 'last7days', label: 'Last 7 Days' },
          { value: 'last14days', label: 'Last 14 Days' },
          { value: 'last30days', label: 'Last 30 Days' },
          { value: 'last90days', label: 'Last 90 Days' },
          { value: 'thisWeek', label: 'This Week' },
          { value: 'lastWeek', label: 'Last Week' },
          { value: 'thisMonth', label: 'This Month' },
          { value: 'lastMonth', label: 'Last Month' },
          { value: 'thisQuarter', label: 'This Quarter' },
          { value: 'lastQuarter', label: 'Last Quarter' },
          { value: 'thisYear', label: 'This Year' },
          { value: 'lastYear', label: 'Last Year' },
          { value: 'all', label: 'All Time' },
          { value: 'custom', label: 'Custom Range' }
        ]
      }
    });
  } catch (error) {
    console.error('Error fetching metadata:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// TEMPLATES
// ============================================

/**
 * Get available templates
 */
exports.getTemplates = async (req, res) => {
  try {
    const templates = await StatisticReport.find({ isTemplate: true })
      .populate('owner', 'name')
      .sort({ templateCategory: 1, title: 1 });

    // Also include predefined templates
    const predefinedTemplates = getPredefinedTemplates();

    res.json({
      success: true,
      data: {
        saved: templates,
        predefined: predefinedTemplates
      }
    });
  } catch (error) {
    console.error('Error fetching templates:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Create report from template
 */
exports.createFromTemplate = async (req, res) => {
  try {
    const { templateId, predefinedId } = req.body;
    const userId = req.user._id;

    let reportData, chartsData;

    if (predefinedId) {
      // Use predefined template
      const template = getPredefinedTemplates().find(t => t.id === predefinedId);
      if (!template) {
        return res.status(404).json({ success: false, message: 'Template not found' });
      }
      reportData = template.report;
      chartsData = template.charts;
    } else if (templateId) {
      // Use saved template
      const template = await StatisticReport.findById(templateId);
      if (!template) {
        return res.status(404).json({ success: false, message: 'Template not found' });
      }
      reportData = template.toObject();
      chartsData = await StatisticChart.find({ report: templateId });
    } else {
      return res.status(400).json({ success: false, message: 'Template ID required' });
    }

    // Create new report
    const report = new StatisticReport({
      ...reportData,
      _id: undefined,
      owner: userId,
      visibility: 'private',
      isTemplate: false,
      createdAt: undefined,
      updatedAt: undefined
    });

    await report.save();

    // Create charts
    for (const chartData of chartsData) {
      const chart = new StatisticChart({
        ...chartData,
        _id: undefined,
        report: report._id,
        createdAt: undefined,
        updatedAt: undefined
      });
      await chart.save();
    }

    res.status(201).json({ success: true, data: report });
  } catch (error) {
    console.error('Error creating from template:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Save report as template
 */
exports.saveAsTemplate = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, category } = req.body;
    const userId = req.user._id;

    const report = await StatisticReport.findById(id);

    if (!report) {
      return res.status(404).json({ success: false, message: 'Report not found' });
    }

    if (!report.canEdit(userId)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    // Create template
    const template = new StatisticReport({
      ...report.toObject(),
      _id: undefined,
      title: title || `${report.title} Template`,
      owner: userId,
      visibility: 'public',
      isTemplate: true,
      templateCategory: category || 'custom',
      createdAt: undefined,
      updatedAt: undefined
    });

    await template.save();

    // Copy charts
    const charts = await StatisticChart.find({ report: id });
    for (const chart of charts) {
      const templateChart = new StatisticChart({
        ...chart.toObject(),
        _id: undefined,
        report: template._id,
        createdAt: undefined,
        updatedAt: undefined
      });
      await templateChart.save();
    }

    res.status(201).json({ success: true, data: template });
  } catch (error) {
    console.error('Error saving as template:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get comparison data for chart
 */
async function getComparisonData(chart, report) {
  const { comparison } = chart;
  if (!comparison?.enabled) return null;

  // Calculate comparison date range
  const currentRange = report.dateRange;
  const comparisonRange = calculateComparisonRange(currentRange, comparison.type);

  // Execute with comparison range
  return await AggregationEngine.execute(
    chart.toObject(),
    report.filters,
    comparisonRange
  );
}

/**
 * Calculate comparison date range
 */
function calculateComparisonRange(currentRange, comparisonType) {
  const now = new Date();
  // This is a simplified implementation
  // Full implementation would need to calculate exact previous periods
  return {
    type: 'custom',
    customStart: new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000), // 60 days ago
    customEnd: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) // 30 days ago
  };
}

/**
 * Get predefined templates
 */
function getPredefinedTemplates() {
  return [
    {
      id: 'cs-agent-overview',
      title: 'CS Agent Performance Overview',
      description: 'Overview of customer support agent quality scores and trends',
      category: 'cs-agent',
      report: {
        title: 'CS Agent Performance Overview',
        description: 'Overview of customer support agent quality scores and trends',
        dateRange: { type: 'last30days' }
      },
      charts: [
        {
          title: 'Average Quality Score',
          chartType: 'kpi',
          dataset: 'tickets',
          metric: 'qualityScorePercent',
          aggregation: 'avg',
          viewBy: 'none',
          options: { format: 'percentage', showTrend: true },
          target: { value: 85, showLine: true },
          comparison: { enabled: true, type: 'previousPeriod' },
          layout: { x: 0, y: 0, w: 3, h: 2 }
        },
        {
          title: 'Total Tickets Graded',
          chartType: 'kpi',
          dataset: 'tickets',
          metric: 'gradedCount',
          aggregation: 'sum',
          viewBy: 'none',
          options: { format: 'number', showTrend: true },
          layout: { x: 3, y: 0, w: 3, h: 2 }
        },
        {
          title: 'Score by Agent',
          chartType: 'bar',
          dataset: 'csAgentPerformance',
          metric: 'avgScore',
          aggregation: 'avg',
          viewBy: 'csAgent',
          topN: 10,
          sortOrder: 'desc',
          options: { showDataLabels: true },
          target: { value: 85, showLine: true },
          layout: { x: 0, y: 2, w: 6, h: 4 }
        },
        {
          title: 'Score Trend',
          chartType: 'line',
          dataset: 'tickets',
          metric: 'qualityScorePercent',
          aggregation: 'avg',
          viewBy: 'week',
          options: { smooth: true, showPoints: true },
          layout: { x: 6, y: 0, w: 6, h: 4 }
        },
        {
          title: 'Agent Details',
          chartType: 'table',
          dataset: 'csAgentPerformance',
          metric: 'avgScore',
          viewBy: 'csAgent',
          options: {
            columns: [
              { field: 'name', label: 'Agent' },
              { field: 'avgScore', label: 'Avg Score', format: 'percentage' },
              { field: 'count', label: 'Tickets' },
              { field: 'consistency', label: 'Consistency' }
            ],
            showSummaryRow: true
          },
          layout: { x: 6, y: 4, w: 6, h: 4 }
        }
      ]
    },
    {
      id: 'qa-agent-activity',
      title: 'QA Agent Activity Dashboard',
      description: 'Track grading activity and output of QA team members',
      category: 'qa-agent',
      report: {
        title: 'QA Agent Activity Dashboard',
        description: 'Track grading activity and output of QA team members',
        dateRange: { type: 'last30days' }
      },
      charts: [
        {
          title: 'Tickets Graded This Period',
          chartType: 'kpi',
          dataset: 'qaAgentActivity',
          metric: 'ticketsGradedByGrader',
          aggregation: 'sum',
          viewBy: 'none',
          options: { format: 'number', showTrend: true },
          layout: { x: 0, y: 0, w: 3, h: 2 }
        },
        {
          title: 'Grading by QA Agent',
          chartType: 'bar',
          dataset: 'qaAgentActivity',
          metric: 'ticketsGradedByGrader',
          aggregation: 'sum',
          viewBy: 'qaAgent',
          options: { showDataLabels: true },
          layout: { x: 0, y: 2, w: 6, h: 4 }
        },
        {
          title: 'Grading Activity Heatmap',
          chartType: 'heatmap',
          dataset: 'tickets',
          metric: 'ticketCount',
          viewBy: 'none',
          options: {
            heatmapRows: 'dayOfWeek',
            heatmapCols: 'hour',
            showCellValues: true
          },
          layout: { x: 6, y: 0, w: 6, h: 5 }
        },
        {
          title: 'Average Score Given by Grader',
          chartType: 'column',
          dataset: 'qaAgentActivity',
          metric: 'avgScoreGiven',
          aggregation: 'avg',
          viewBy: 'qaAgent',
          options: { showDataLabels: true },
          layout: { x: 0, y: 6, w: 6, h: 4 }
        }
      ]
    },
    {
      id: 'category-analysis',
      title: 'Category Analysis',
      description: 'Analyze ticket distribution and quality by category',
      category: 'quality',
      report: {
        title: 'Category Analysis',
        description: 'Analyze ticket distribution and quality by category',
        dateRange: { type: 'last30days' }
      },
      charts: [
        {
          title: 'Tickets by Category',
          chartType: 'donut',
          dataset: 'categoryAnalysis',
          metric: 'categoryCount',
          viewBy: 'category',
          topN: 8,
          options: { showCenterText: true, centerTextType: 'total' },
          layout: { x: 0, y: 0, w: 6, h: 5 }
        },
        {
          title: 'Score by Category',
          chartType: 'bar',
          dataset: 'categoryAnalysis',
          metric: 'categoryAvgScore',
          viewBy: 'category',
          sortOrder: 'desc',
          options: { showDataLabels: true },
          target: { value: 85, showLine: true },
          layout: { x: 6, y: 0, w: 6, h: 5 }
        },
        {
          title: 'Category Trend',
          chartType: 'area',
          dataset: 'tickets',
          metric: 'ticketCount',
          viewBy: 'week',
          segmentBy: 'category',
          options: { stacked: true },
          layout: { x: 0, y: 5, w: 12, h: 4 }
        }
      ]
    }
  ];
}

module.exports = exports;
