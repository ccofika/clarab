const mongoose = require('mongoose');

// Available metrics for statistics
// CS Agents = Customer Support agents (who are being graded)
// QA Agents = Quality Assurance agents (who do the grading)
const AVAILABLE_METRICS = [
  // ==========================================
  // CS AGENT METRICS (Customer Support - being graded)
  // ==========================================
  'qualityScorePercent',    // Average quality score of CS agents
  'ticketCount',            // Number of tickets for CS agents
  'gradedCount',            // Number of graded tickets for CS agents
  'selectedCount',          // Number of selected tickets for CS agents
  'avgTimeToGrade',         // Average time from creation to grading (hours)
  'avgNotesLength',         // Average notes character length
  'avgFeedbackLength',      // Average feedback character length
  'categoryDistribution',   // Distribution by category
  'priorityDistribution',   // Distribution by priority
  'scoreDistribution',      // Distribution by score ranges (A+, A, B, etc.)
  'ticketsPerDay',          // Tickets created per day
  'ticketsPerWeek',         // Tickets created per week
  'gradingRate',            // Percentage of tickets graded
  'agentPerformance',       // CS Agent performance comparison
  'weeklyTrend',            // Weekly quality trend
  'monthlyTrend',           // Monthly quality trend
  'unresolvedIssues',       // Count of unresolved issues per CS agent

  // ==========================================
  // QA AGENT METRICS (Quality Assurance - graders)
  // ==========================================
  'graderTicketCount',      // Number of tickets graded by QA agent
  'graderAvgScoreGiven',    // Average score that QA agent gives
  'graderActivity',         // QA agent grading activity over time
  'graderComparison',       // Compare QA agents' grading stats
  'graderFeedbackLength',   // Average feedback length per QA agent
  'graderNotesLength',      // Average notes length per QA agent
  'graderCategoryBreakdown', // What categories each QA agent grades most
  'graderDailyOutput',      // Tickets graded per day by QA agent
  'graderWeeklyOutput',     // Tickets graded per week by QA agent
  'graderScoreDistribution', // Distribution of scores given by QA agent
  'graderTrend'             // QA agent productivity trend over time
];

// Available aggregations
const AGGREGATIONS = ['avg', 'sum', 'count', 'min', 'max', 'distribution'];

// Available group by options
const GROUP_BY_OPTIONS = [
  'agent',      // CS Agent (being graded)
  'grader',     // QA Agent (who grades)
  'category',
  'priority',
  'day',
  'week',
  'month',
  'year',
  'status',
  'team',       // CS Agent team
  'none'
];

// Chart types
const CHART_TYPES = ['pie', 'line', 'bar', 'area', 'table', 'kpi', 'heatmap'];

// Operators for conditions
const OPERATORS = [
  'equals',
  'notEquals',
  'gt',           // greater than
  'gte',          // greater than or equal
  'lt',           // less than
  'lte',          // less than or equal
  'between',
  'in',
  'notIn',
  'contains',
  'startsWith',
  'endsWith'
];

// Condition schema
const conditionSchema = new mongoose.Schema({
  field: {
    type: String,
    required: true
  },
  operator: {
    type: String,
    enum: OPERATORS,
    required: true
  },
  value: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  logic: {
    type: String,
    enum: ['AND', 'OR'],
    default: 'AND'
  }
}, { _id: false });

// Layout schema for react-grid-layout
const layoutSchema = new mongoose.Schema({
  x: { type: Number, default: 0 },
  y: { type: Number, default: 0 },
  w: { type: Number, default: 4, min: 1, max: 12 },
  h: { type: Number, default: 3, min: 1, max: 12 },
  minW: { type: Number, default: 2 },
  minH: { type: Number, default: 2 },
  maxW: { type: Number, default: 12 },
  maxH: { type: Number, default: 12 }
}, { _id: false });

// Time range schema
const timeRangeSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['last7days', 'last30days', 'last90days', 'thisWeek', 'thisMonth', 'thisYear', 'custom', 'all'],
    default: 'last30days'
  },
  startDate: Date,
  endDate: Date
}, { _id: false });

// Styling schema
const stylingSchema = new mongoose.Schema({
  colors: {
    type: [String],
    default: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16']
  },
  showLegend: { type: Boolean, default: true },
  showValues: { type: Boolean, default: true },
  showGrid: { type: Boolean, default: true },
  showTooltip: { type: Boolean, default: true },
  labelPosition: {
    type: String,
    enum: ['inside', 'outside', 'none'],
    default: 'outside'
  }
}, { _id: false });

// Main StatisticCard schema
const statisticCardSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  title: {
    type: String,
    required: [true, 'Title is required'],
    trim: true,
    maxlength: [100, 'Title cannot exceed 100 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  chartType: {
    type: String,
    enum: CHART_TYPES,
    required: [true, 'Chart type is required']
  },

  // Query configuration
  metric: {
    type: String,
    enum: AVAILABLE_METRICS,
    required: [true, 'Metric is required']
  },
  aggregation: {
    type: String,
    enum: AGGREGATIONS,
    default: 'avg'
  },
  groupBy: {
    type: String,
    enum: GROUP_BY_OPTIONS,
    default: 'none'
  },

  // Agent type (CS = Customer Support agents being graded, QA = graders)
  agentType: {
    type: String,
    enum: ['cs', 'qa'],
    default: 'cs'
  },

  // Filters and conditions
  conditions: [conditionSchema],
  timeRange: {
    type: timeRangeSchema,
    default: () => ({ type: 'last30days' })
  },

  // Layout for grid
  layout: {
    type: layoutSchema,
    default: () => ({ x: 0, y: 0, w: 4, h: 3 })
  },

  // Styling options
  styling: {
    type: stylingSchema,
    default: () => ({})
  },

  // Template info (if created from template)
  isTemplate: {
    type: Boolean,
    default: false
  },
  templateId: {
    type: String
  },

  // Auto-refresh settings
  autoRefresh: {
    type: Boolean,
    default: true
  },
  refreshInterval: {
    type: Number,
    default: 5, // minutes
    min: 1,
    max: 60
  },

  // Order in dashboard
  order: {
    type: Number,
    default: 0
  },

  // Last data fetch timestamp
  lastFetched: {
    type: Date
  },

  // Cached data (to reduce API calls)
  cachedData: {
    type: mongoose.Schema.Types.Mixed,
    select: false
  }
}, {
  timestamps: true
});

// Indexes
statisticCardSchema.index({ userId: 1, order: 1 });
statisticCardSchema.index({ userId: 1, isTemplate: 1 });
statisticCardSchema.index({ createdAt: -1 });

// Virtual for user-friendly time range display
statisticCardSchema.virtual('timeRangeDisplay').get(function() {
  const labels = {
    'last7days': 'Last 7 Days',
    'last30days': 'Last 30 Days',
    'last90days': 'Last 90 Days',
    'thisWeek': 'This Week',
    'thisMonth': 'This Month',
    'thisYear': 'This Year',
    'custom': 'Custom Range',
    'all': 'All Time'
  };
  return labels[this.timeRange?.type] || 'Unknown';
});

// Static method to get predefined templates
statisticCardSchema.statics.getTemplates = function() {
  return [
    // ==========================================
    // CS AGENT TEMPLATES (Customer Support)
    // ==========================================
    {
      id: 'weekly-agent-performance',
      title: 'CS Agent Weekly Performance',
      description: 'Compare customer support agent quality scores over the past week',
      chartType: 'bar',
      metric: 'qualityScorePercent',
      aggregation: 'avg',
      groupBy: 'agent',
      timeRange: { type: 'last7days' },
      layout: { w: 6, h: 4 },
      category: 'cs-agent'
    },
    {
      id: 'category-distribution',
      title: 'Category Distribution',
      description: 'Breakdown of tickets by category',
      chartType: 'pie',
      metric: 'categoryDistribution',
      aggregation: 'count',
      groupBy: 'category',
      timeRange: { type: 'last30days' },
      layout: { w: 4, h: 4 },
      category: 'cs-agent'
    },
    {
      id: 'quality-trend',
      title: 'Quality Score Trend',
      description: 'Weekly average quality score trend',
      chartType: 'line',
      metric: 'qualityScorePercent',
      aggregation: 'avg',
      groupBy: 'week',
      timeRange: { type: 'last90days' },
      layout: { w: 6, h: 3 },
      category: 'cs-agent'
    },
    {
      id: 'score-distribution',
      title: 'Score Distribution',
      description: 'Distribution of quality scores (A+, A, B, etc.)',
      chartType: 'pie',
      metric: 'scoreDistribution',
      aggregation: 'distribution',
      groupBy: 'none',
      timeRange: { type: 'last30days' },
      layout: { w: 4, h: 4 },
      category: 'cs-agent'
    },
    {
      id: 'priority-breakdown',
      title: 'Priority Breakdown',
      description: 'Tickets by priority level',
      chartType: 'bar',
      metric: 'priorityDistribution',
      aggregation: 'count',
      groupBy: 'priority',
      timeRange: { type: 'last30days' },
      layout: { w: 4, h: 3 },
      category: 'cs-agent'
    },
    {
      id: 'total-tickets-kpi',
      title: 'Total Tickets',
      description: 'Total number of tickets this month',
      chartType: 'kpi',
      metric: 'ticketCount',
      aggregation: 'count',
      groupBy: 'none',
      timeRange: { type: 'thisMonth' },
      layout: { w: 2, h: 2 },
      category: 'cs-agent'
    },
    {
      id: 'avg-score-kpi',
      title: 'Average Quality Score',
      description: 'Average quality score this month',
      chartType: 'kpi',
      metric: 'qualityScorePercent',
      aggregation: 'avg',
      groupBy: 'none',
      timeRange: { type: 'thisMonth' },
      layout: { w: 2, h: 2 },
      category: 'cs-agent'
    },
    {
      id: 'top-agents-table',
      title: 'Top CS Agents',
      description: 'Customer support agents ranked by average quality score',
      chartType: 'table',
      metric: 'agentPerformance',
      aggregation: 'avg',
      groupBy: 'agent',
      timeRange: { type: 'last30days' },
      layout: { w: 6, h: 4 },
      category: 'cs-agent'
    },
    {
      id: 'feedback-length-trend',
      title: 'Feedback Quality Trend',
      description: 'Average feedback length over time (indicates thoroughness)',
      chartType: 'line',
      metric: 'avgFeedbackLength',
      aggregation: 'avg',
      groupBy: 'week',
      timeRange: { type: 'last90days' },
      layout: { w: 6, h: 3 },
      category: 'cs-agent'
    },

    // ==========================================
    // QA AGENT TEMPLATES (Quality Assurance - Graders)
    // ==========================================
    {
      id: 'grader-output-comparison',
      title: 'QA Agent Output Comparison',
      description: 'Compare how many tickets each QA agent has graded',
      chartType: 'bar',
      metric: 'graderTicketCount',
      aggregation: 'count',
      groupBy: 'grader',
      timeRange: { type: 'last30days' },
      layout: { w: 6, h: 4 },
      category: 'qa-agent'
    },
    {
      id: 'grader-avg-score',
      title: 'QA Agent Average Scores Given',
      description: 'Average quality score each QA agent gives',
      chartType: 'bar',
      metric: 'graderAvgScoreGiven',
      aggregation: 'avg',
      groupBy: 'grader',
      timeRange: { type: 'last30days' },
      layout: { w: 6, h: 4 },
      category: 'qa-agent'
    },
    {
      id: 'grader-daily-activity',
      title: 'QA Daily Grading Activity',
      description: 'Number of tickets graded per day by QA team',
      chartType: 'area',
      metric: 'graderDailyOutput',
      aggregation: 'count',
      groupBy: 'day',
      timeRange: { type: 'last30days' },
      layout: { w: 6, h: 3 },
      category: 'qa-agent'
    },
    {
      id: 'grader-weekly-output',
      title: 'QA Weekly Output',
      description: 'Tickets graded per week by each QA agent',
      chartType: 'line',
      metric: 'graderWeeklyOutput',
      aggregation: 'count',
      groupBy: 'week',
      timeRange: { type: 'last90days' },
      layout: { w: 6, h: 3 },
      category: 'qa-agent'
    },
    {
      id: 'grader-feedback-quality',
      title: 'QA Feedback Quality',
      description: 'Average feedback length per QA agent (thoroughness indicator)',
      chartType: 'bar',
      metric: 'graderFeedbackLength',
      aggregation: 'avg',
      groupBy: 'grader',
      timeRange: { type: 'last30days' },
      layout: { w: 6, h: 4 },
      category: 'qa-agent'
    },
    {
      id: 'grader-category-focus',
      title: 'QA Category Focus',
      description: 'Which categories each QA agent grades most',
      chartType: 'heatmap',
      metric: 'graderCategoryBreakdown',
      aggregation: 'count',
      groupBy: 'grader',
      timeRange: { type: 'last30days' },
      layout: { w: 8, h: 5 },
      category: 'qa-agent'
    },
    {
      id: 'grader-score-distribution',
      title: 'QA Score Distribution',
      description: 'How QA agents distribute their scores',
      chartType: 'pie',
      metric: 'graderScoreDistribution',
      aggregation: 'distribution',
      groupBy: 'grader',
      timeRange: { type: 'last30days' },
      layout: { w: 4, h: 4 },
      category: 'qa-agent'
    },
    {
      id: 'grader-table',
      title: 'QA Agent Stats Table',
      description: 'Detailed QA agent statistics',
      chartType: 'table',
      metric: 'graderComparison',
      aggregation: 'count',
      groupBy: 'grader',
      timeRange: { type: 'last30days' },
      layout: { w: 8, h: 4 },
      category: 'qa-agent'
    },
    {
      id: 'grader-total-kpi',
      title: 'Total Tickets Graded',
      description: 'Total tickets graded by QA team this month',
      chartType: 'kpi',
      metric: 'graderTicketCount',
      aggregation: 'count',
      groupBy: 'none',
      timeRange: { type: 'thisMonth' },
      layout: { w: 2, h: 2 },
      category: 'qa-agent'
    },
    {
      id: 'grader-productivity-trend',
      title: 'QA Productivity Trend',
      description: 'QA team productivity over time',
      chartType: 'line',
      metric: 'graderTrend',
      aggregation: 'count',
      groupBy: 'week',
      timeRange: { type: 'last90days' },
      layout: { w: 6, h: 3 },
      category: 'qa-agent'
    }
  ];
};

// Pre-save middleware
statisticCardSchema.pre('save', function(next) {
  // Clear cached data when configuration changes
  if (this.isModified('metric') || this.isModified('aggregation') ||
      this.isModified('groupBy') || this.isModified('conditions') ||
      this.isModified('timeRange')) {
    this.cachedData = undefined;
    this.lastFetched = undefined;
  }
  next();
});

// Export constants for use in other files
module.exports = mongoose.model('StatisticCard', statisticCardSchema);
module.exports.AVAILABLE_METRICS = AVAILABLE_METRICS;
module.exports.AGGREGATIONS = AGGREGATIONS;
module.exports.GROUP_BY_OPTIONS = GROUP_BY_OPTIONS;
module.exports.CHART_TYPES = CHART_TYPES;
module.exports.OPERATORS = OPERATORS;
