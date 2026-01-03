const mongoose = require('mongoose');

/**
 * StatisticChart Model
 *
 * Represents a single chart/visualization within a report.
 * Contains all configuration for data fetching and display.
 */

// ============================================
// AVAILABLE OPTIONS (for validation & metadata)
// ============================================

const DATASETS = [
  'tickets',           // Main ticket data
  'csAgentPerformance', // CS Agent (graded) performance
  'qaAgentActivity',   // QA Agent (grader) activity
  'timeBased',         // Time-based analytics
  'categoryAnalysis'   // Category & tag analysis
];

const METRICS = {
  // Ticket Dataset
  tickets: [
    { value: 'ticketCount', label: 'Ticket Count', type: 'count', aggregations: ['sum'] },
    { value: 'qualityScorePercent', label: 'Quality Score', type: 'percentage', aggregations: ['avg', 'median', 'min', 'max', 'percentile'] },
    { value: 'gradedCount', label: 'Graded Tickets', type: 'count', aggregations: ['sum'] },
    { value: 'selectedCount', label: 'Selected Tickets', type: 'count', aggregations: ['sum'] },
    { value: 'gradingRate', label: 'Grading Rate', type: 'ratio', aggregations: ['avg'] },
    { value: 'notesLength', label: 'Notes Length', type: 'number', aggregations: ['avg', 'sum', 'min', 'max'] },
    { value: 'feedbackLength', label: 'Feedback Length', type: 'number', aggregations: ['avg', 'sum', 'min', 'max'] },
    { value: 'timeToGrade', label: 'Time to Grade', type: 'duration', aggregations: ['avg', 'median', 'min', 'max', 'percentile'] }
  ],

  // CS Agent Performance Dataset
  csAgentPerformance: [
    { value: 'avgScore', label: 'Average Score', type: 'percentage', aggregations: ['avg', 'median'] },
    { value: 'scoreImprovement', label: 'Score Improvement', type: 'percentage', aggregations: ['avg'] },
    { value: 'ticketsGraded', label: 'Tickets Graded', type: 'count', aggregations: ['sum'] },
    { value: 'categoryDistribution', label: 'Category Distribution', type: 'distribution', aggregations: ['count'] },
    { value: 'priorityDistribution', label: 'Priority Distribution', type: 'distribution', aggregations: ['count'] },
    { value: 'scoreDistribution', label: 'Score Distribution', type: 'distribution', aggregations: ['count'] },
    { value: 'consistencyScore', label: 'Consistency Score', type: 'number', aggregations: ['avg'] },
    { value: 'trendDirection', label: 'Trend Direction', type: 'trend', aggregations: ['latest'] }
  ],

  // QA Agent Activity Dataset
  qaAgentActivity: [
    { value: 'ticketsGradedByGrader', label: 'Tickets Graded', type: 'count', aggregations: ['sum'] },
    { value: 'avgScoreGiven', label: 'Avg Score Given', type: 'percentage', aggregations: ['avg', 'median'] },
    { value: 'avgFeedbackLength', label: 'Avg Feedback Length', type: 'number', aggregations: ['avg'] },
    { value: 'avgNotesLength', label: 'Avg Notes Length', type: 'number', aggregations: ['avg'] },
    { value: 'gradingSpeed', label: 'Grading Speed', type: 'duration', aggregations: ['avg', 'median'] },
    { value: 'dailyOutput', label: 'Daily Output', type: 'count', aggregations: ['avg', 'sum'] },
    { value: 'weeklyOutput', label: 'Weekly Output', type: 'count', aggregations: ['avg', 'sum'] },
    { value: 'scoringPattern', label: 'Scoring Pattern', type: 'pattern', aggregations: ['analyze'] },
    { value: 'graderComparison', label: 'Grader Comparison', type: 'comparison', aggregations: ['compare'] }
  ],

  // Time-Based Dataset
  timeBased: [
    { value: 'dailyTicketVolume', label: 'Daily Volume', type: 'count', aggregations: ['sum', 'avg'] },
    { value: 'weeklyTicketVolume', label: 'Weekly Volume', type: 'count', aggregations: ['sum', 'avg'] },
    { value: 'monthlyTicketVolume', label: 'Monthly Volume', type: 'count', aggregations: ['sum', 'avg'] },
    { value: 'peakHours', label: 'Peak Hours', type: 'time', aggregations: ['mode'] },
    { value: 'peakDays', label: 'Peak Days', type: 'day', aggregations: ['mode'] },
    { value: 'trendOverTime', label: 'Trend Over Time', type: 'trend', aggregations: ['trend'] }
  ],

  // Category Analysis Dataset
  categoryAnalysis: [
    { value: 'categoryCount', label: 'Category Count', type: 'count', aggregations: ['sum'] },
    { value: 'categoryAvgScore', label: 'Category Avg Score', type: 'percentage', aggregations: ['avg'] },
    { value: 'tagCount', label: 'Tag Count', type: 'count', aggregations: ['sum'] },
    { value: 'tagAvgScore', label: 'Tag Avg Score', type: 'percentage', aggregations: ['avg'] },
    { value: 'categoryTrend', label: 'Category Trend', type: 'trend', aggregations: ['trend'] }
  ]
};

const CHART_TYPES = [
  { value: 'kpi', label: 'KPI Card', icon: 'Activity', minW: 2, minH: 2, defaultW: 3, defaultH: 2 },
  { value: 'column', label: 'Column Chart', icon: 'BarChart3', minW: 4, minH: 3, defaultW: 6, defaultH: 4 },
  { value: 'bar', label: 'Bar Chart', icon: 'BarChartHorizontal', minW: 4, minH: 3, defaultW: 6, defaultH: 4 },
  { value: 'line', label: 'Line Chart', icon: 'LineChart', minW: 4, minH: 3, defaultW: 6, defaultH: 4 },
  { value: 'area', label: 'Area Chart', icon: 'TrendingUp', minW: 4, minH: 3, defaultW: 6, defaultH: 4 },
  { value: 'donut', label: 'Donut Chart', icon: 'PieChart', minW: 3, minH: 3, defaultW: 4, defaultH: 4 },
  { value: 'combo', label: 'Combo Chart', icon: 'BarChart2', minW: 6, minH: 4, defaultW: 8, defaultH: 4 },
  { value: 'heatmap', label: 'Heatmap', icon: 'Grid3X3', minW: 6, minH: 4, defaultW: 8, defaultH: 5 },
  { value: 'table', label: 'Table', icon: 'Table', minW: 4, minH: 3, defaultW: 12, defaultH: 5 },
  { value: 'gauge', label: 'Gauge', icon: 'Gauge', minW: 3, minH: 3, defaultW: 4, defaultH: 4 },
  { value: 'funnel', label: 'Funnel', icon: 'Filter', minW: 4, minH: 4, defaultW: 6, defaultH: 5 },
  { value: 'comparison', label: 'Comparison', icon: 'GitCompare', minW: 6, minH: 4, defaultW: 8, defaultH: 5 }
];

const AGGREGATIONS = [
  { value: 'sum', label: 'Sum' },
  { value: 'avg', label: 'Average' },
  { value: 'median', label: 'Median' },
  { value: 'min', label: 'Minimum' },
  { value: 'max', label: 'Maximum' },
  { value: 'count', label: 'Count' },
  { value: 'countDistinct', label: 'Count Distinct' },
  { value: 'percentile10', label: '10th Percentile' },
  { value: 'percentile25', label: '25th Percentile' },
  { value: 'percentile50', label: '50th Percentile (Median)' },
  { value: 'percentile75', label: '75th Percentile' },
  { value: 'percentile90', label: '90th Percentile' },
  { value: 'percentile95', label: '95th Percentile' },
  { value: 'percentile99', label: '99th Percentile' },
  { value: 'stddev', label: 'Standard Deviation' },
  { value: 'variance', label: 'Variance' }
];

const VIEW_BY_OPTIONS = [
  { value: 'none', label: 'No Grouping (Single Value)' },
  { value: 'csAgent', label: 'CS Agent' },
  { value: 'qaAgent', label: 'QA Agent (Grader)' },
  { value: 'category', label: 'Category' },
  { value: 'priority', label: 'Priority' },
  { value: 'qualityGrade', label: 'Quality Grade (A+, A, B...)' },
  { value: 'status', label: 'Status' },
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'quarter', label: 'Quarter' },
  { value: 'year', label: 'Year' },
  { value: 'dayOfWeek', label: 'Day of Week' },
  { value: 'hour', label: 'Hour of Day' }
];

const FILTER_OPERATORS = [
  { value: 'equals', label: 'Equals', types: ['string', 'number', 'boolean'] },
  { value: 'not_equals', label: 'Not Equals', types: ['string', 'number', 'boolean'] },
  { value: 'contains', label: 'Contains', types: ['string'] },
  { value: 'not_contains', label: 'Not Contains', types: ['string'] },
  { value: 'starts_with', label: 'Starts With', types: ['string'] },
  { value: 'ends_with', label: 'Ends With', types: ['string'] },
  { value: 'greater_than', label: 'Greater Than', types: ['number', 'date'] },
  { value: 'greater_or_equal', label: 'Greater or Equal', types: ['number', 'date'] },
  { value: 'less_than', label: 'Less Than', types: ['number', 'date'] },
  { value: 'less_or_equal', label: 'Less or Equal', types: ['number', 'date'] },
  { value: 'between', label: 'Between', types: ['number', 'date'] },
  { value: 'in', label: 'In List', types: ['string', 'number'] },
  { value: 'not_in', label: 'Not In List', types: ['string', 'number'] },
  { value: 'is_empty', label: 'Is Empty', types: ['string', 'array'] },
  { value: 'is_not_empty', label: 'Is Not Empty', types: ['string', 'array'] },
  { value: 'is_null', label: 'Is Null', types: ['any'] },
  { value: 'is_not_null', label: 'Is Not Null', types: ['any'] }
];

// ============================================
// SCHEMA DEFINITION
// ============================================

const chartFilterSchema = new mongoose.Schema({
  field: {
    type: String,
    required: true
  },
  operator: {
    type: String,
    enum: FILTER_OPERATORS.map(o => o.value),
    required: true
  },
  value: mongoose.Schema.Types.Mixed,
  valueTo: mongoose.Schema.Types.Mixed,
  logic: {
    type: String,
    enum: ['AND', 'OR'],
    default: 'AND'
  }
}, { _id: false });

const filterGroupSchema = new mongoose.Schema({
  logic: {
    type: String,
    enum: ['AND', 'OR'],
    default: 'AND'
  },
  conditions: [chartFilterSchema],
  groups: [{ type: mongoose.Schema.Types.Mixed }]
}, { _id: false });

// Metric configuration for multi-metric charts
const metricConfigSchema = new mongoose.Schema({
  metric: {
    type: String,
    required: true
  },
  aggregation: {
    type: String,
    default: 'avg'
  },
  label: String,
  color: String,
  yAxis: {
    type: String,
    enum: ['left', 'right'],
    default: 'left'
  },
  chartType: {
    type: String,
    enum: ['column', 'line', 'area']
  },
  filters: filterGroupSchema
}, { _id: false });

// Table column configuration
const tableColumnSchema = new mongoose.Schema({
  field: {
    type: String,
    required: true
  },
  label: String,
  width: Number,
  sortable: {
    type: Boolean,
    default: true
  },
  format: {
    type: String,
    enum: ['text', 'number', 'percentage', 'currency', 'date', 'duration', 'badge']
  },
  conditionalFormatting: {
    enabled: Boolean,
    rules: [{
      operator: String,
      value: mongoose.Schema.Types.Mixed,
      color: String,
      backgroundColor: String
    }]
  }
}, { _id: false });

// Target configuration
const targetSchema = new mongoose.Schema({
  value: {
    type: Number,
    required: true
  },
  type: {
    type: String,
    enum: ['static', 'dynamic'],
    default: 'static'
  },
  dynamicBase: String, // For dynamic: 'previousPeriod', 'teamAverage', etc.
  dynamicModifier: Number, // e.g., 1.05 for +5%
  showLine: {
    type: Boolean,
    default: true
  },
  zones: {
    belowTarget: { color: String, threshold: Number },
    nearTarget: { color: String, threshold: Number },
    aboveTarget: { color: String, threshold: Number },
    excellence: { color: String, threshold: Number }
  }
}, { _id: false });

// Comparison configuration
const comparisonSchema = new mongoose.Schema({
  enabled: {
    type: Boolean,
    default: false
  },
  type: {
    type: String,
    enum: ['previousPeriod', 'samePeriodLastWeek', 'samePeriodLastMonth', 'samePeriodLastYear', 'custom']
  },
  customRange: {
    start: Date,
    end: Date
  },
  showPercentChange: {
    type: Boolean,
    default: true
  },
  showAbsoluteChange: {
    type: Boolean,
    default: false
  },
  overlay: {
    type: Boolean,
    default: false
  }
}, { _id: false });

// Main chart schema
const statisticChartSchema = new mongoose.Schema({
  report: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'StatisticReport',
    required: true
  },
  title: {
    type: String,
    required: [true, 'Chart title is required'],
    trim: true,
    maxlength: [200, 'Title cannot exceed 200 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  chartType: {
    type: String,
    enum: CHART_TYPES.map(c => c.value),
    required: true
  },
  sectionId: String, // Reference to section in report

  // ==============================
  // DATA CONFIGURATION
  // ==============================

  dataset: {
    type: String,
    enum: DATASETS,
    default: 'tickets'
  },

  // Single metric (for simple charts)
  metric: String,
  aggregation: {
    type: String,
    default: 'avg'
  },
  percentileValue: {
    type: Number,
    min: 1,
    max: 99
  },

  // Multiple metrics (for multi-metric charts)
  metrics: [metricConfigSchema],

  // ==============================
  // DIMENSIONS
  // ==============================

  viewBy: {
    type: String,
    enum: VIEW_BY_OPTIONS.map(v => v.value),
    default: 'none'
  },
  segmentBy: {
    type: String,
    enum: VIEW_BY_OPTIONS.map(v => v.value)
  },

  // Limiting & sorting
  topN: {
    type: Number,
    min: 1,
    max: 100
  },
  showOthers: {
    type: Boolean,
    default: true
  },
  sortBy: {
    type: String,
    enum: ['value', 'label'],
    default: 'value'
  },
  sortOrder: {
    type: String,
    enum: ['asc', 'desc'],
    default: 'desc'
  },

  // ==============================
  // FILTERS (Chart-level)
  // ==============================

  filters: filterGroupSchema,

  // Override report date range
  overrideDateRange: {
    type: Boolean,
    default: false
  },
  dateRange: {
    type: {
      type: String
    },
    customStart: Date,
    customEnd: Date,
    relativeDays: Number,
    relativeUnit: String
  },

  // ==============================
  // DISPLAY OPTIONS
  // ==============================

  options: {
    // General
    showDataLabels: {
      type: Boolean,
      default: false
    },
    showLegend: {
      type: Boolean,
      default: true
    },
    legendPosition: {
      type: String,
      enum: ['top', 'bottom', 'left', 'right'],
      default: 'bottom'
    },
    colorPalette: {
      type: String,
      enum: ['default', 'blue', 'green', 'rainbow', 'custom'],
      default: 'default'
    },
    customColors: [String],

    // Bar/Column specific
    stacked: {
      type: Boolean,
      default: false
    },
    relative: {
      type: Boolean,
      default: false
    },
    barWidth: Number,
    orientation: {
      type: String,
      enum: ['vertical', 'horizontal']
    },

    // Line/Area specific
    smooth: {
      type: Boolean,
      default: true
    },
    showPoints: {
      type: Boolean,
      default: true
    },
    fillArea: {
      type: Boolean,
      default: false
    },
    cumulative: {
      type: Boolean,
      default: false
    },
    showTrendLine: {
      type: Boolean,
      default: false
    },

    // KPI specific
    showTrend: {
      type: Boolean,
      default: true
    },
    format: {
      type: String,
      enum: ['number', 'percentage', 'currency', 'duration'],
      default: 'number'
    },
    decimals: {
      type: Number,
      default: 1
    },
    prefix: String,
    suffix: String,

    // Donut specific
    showCenterText: {
      type: Boolean,
      default: true
    },
    centerTextType: {
      type: String,
      enum: ['total', 'custom'],
      default: 'total'
    },
    centerTextCustom: String,

    // Heatmap specific
    heatmapRows: {
      type: String,
      default: 'dayOfWeek'
    },
    heatmapCols: {
      type: String,
      default: 'hour'
    },
    showCellValues: {
      type: Boolean,
      default: true
    },

    // Table specific
    columns: [tableColumnSchema],
    showSummaryRow: {
      type: Boolean,
      default: false
    },
    pageSize: {
      type: Number,
      default: 10
    },
    enableSearch: {
      type: Boolean,
      default: false
    },

    // Gauge specific
    gaugeMin: {
      type: Number,
      default: 0
    },
    gaugeMax: {
      type: Number,
      default: 100
    },
    gaugeZones: [{
      from: Number,
      to: Number,
      color: String
    }],

    // Funnel specific
    funnelStages: [{
      id: String,
      label: String,
      filter: filterGroupSchema
    }],
    showDropOff: {
      type: Boolean,
      default: true
    },

    // Comparison card specific
    comparisonEntities: [{
      type: {
        type: String,
        enum: ['csAgent', 'qaAgent', 'category', 'period']
      },
      value: mongoose.Schema.Types.Mixed,
      label: String
    }],
    comparisonMetrics: [String]
  },

  // ==============================
  // TARGET & COMPARISON
  // ==============================

  target: targetSchema,
  comparison: comparisonSchema,

  // ==============================
  // LAYOUT
  // ==============================

  layout: {
    x: {
      type: Number,
      default: 0
    },
    y: {
      type: Number,
      default: 0
    },
    w: {
      type: Number,
      default: 6
    },
    h: {
      type: Number,
      default: 4
    }
  },
  order: {
    type: Number,
    default: 0
  },

  // ==============================
  // DRILL-DOWN
  // ==============================

  drillDown: {
    enabled: {
      type: Boolean,
      default: true
    },
    fields: [String] // Fields to show in drill-down view
  }

}, {
  timestamps: true
});

// Indexes
statisticChartSchema.index({ report: 1, order: 1 });
statisticChartSchema.index({ report: 1, sectionId: 1 });

// Pre-save: set default layout based on chart type
statisticChartSchema.pre('save', function(next) {
  if (this.isNew && this.chartType) {
    const chartTypeConfig = CHART_TYPES.find(c => c.value === this.chartType);
    if (chartTypeConfig && !this.layout.w) {
      this.layout.w = chartTypeConfig.defaultW;
      this.layout.h = chartTypeConfig.defaultH;
    }
  }
  next();
});

// Static method to get all metadata
statisticChartSchema.statics.getMetadata = function() {
  return {
    datasets: DATASETS,
    metrics: METRICS,
    chartTypes: CHART_TYPES,
    aggregations: AGGREGATIONS,
    viewByOptions: VIEW_BY_OPTIONS,
    filterOperators: FILTER_OPERATORS
  };
};

// Export constants for use in other files
module.exports = mongoose.model('StatisticChart', statisticChartSchema);
module.exports.DATASETS = DATASETS;
module.exports.METRICS = METRICS;
module.exports.CHART_TYPES = CHART_TYPES;
module.exports.AGGREGATIONS = AGGREGATIONS;
module.exports.VIEW_BY_OPTIONS = VIEW_BY_OPTIONS;
module.exports.FILTER_OPERATORS = FILTER_OPERATORS;
