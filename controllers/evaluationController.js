const ScrapeSession = require('../models/ScrapeSession');
const ScrapedConversation = require('../models/ScrapedConversation');
const TicketEvaluation = require('../models/TicketEvaluation');
const evaluatorService = require('../services/evaluatorService');

/**
 * Evaluation Controller - Upravljanje AI evaluacijom tiketa
 * Povezuje scrape sessions sa AI evaluatorom
 */

/**
 * Parse exportedText into messages array
 * Format: "HH:MM AM/PM | Sender: Message content"
 */
function parseExportedTextToMessages(exportedText) {
  if (!exportedText) return [];

  const messages = [];
  const lines = exportedText.split('\n');
  let currentMessage = null;

  // Regex to match message header: "12:38 AM | Sender:" or "12:38 AM | Sender from Stake.com:"
  const headerRegex = /^(\d{1,2}:\d{2}\s*(?:AM|PM)?)\s*\|\s*([^:]+):\s*(.*)$/i;

  for (const line of lines) {
    // Skip header lines and dividers
    if (line.includes('Conversation with') ||
        line.includes('Started on') ||
        line.trim() === '---' ||
        line.match(/^---\s*\w+\s+\d+,\s*\d+\s*---$/)) {
      continue;
    }

    const match = line.match(headerRegex);

    if (match) {
      // Save previous message
      if (currentMessage && currentMessage.content.trim()) {
        messages.push(currentMessage);
      }

      const timestamp = match[1];
      const sender = match[2].trim();
      const firstLine = match[3] || '';

      // Determine if agent or customer
      const senderLower = sender.toLowerCase();
      const isAgent = senderLower.includes('stake') ||
                      senderLower.includes('support') ||
                      senderLower.includes('from stake.com');

      currentMessage = {
        role: isAgent ? 'agent' : 'customer',
        sender: sender,
        content: firstLine,
        timestamp: null,
        hasImage: false
      };
    } else if (currentMessage && line.trim()) {
      // Continuation of message
      currentMessage.content += '\n' + line;

      // Check for image reference
      if (line.includes('[Image')) {
        currentMessage.hasImage = true;
      }
    }
  }

  // Add last message
  if (currentMessage && currentMessage.content.trim()) {
    messages.push(currentMessage);
  }

  return messages;
}

// Socket.io instance (set from server.js)
let io = null;

exports.setSocketIO = (socketIO) => {
  io = socketIO;
};

// ============================================
// PRICING CONSTANTS
// ============================================
const PRICING = {
  input: 0.05,          // $0.05 per 1M tokens
  cached_input: 0.005,  // $0.005 per 1M tokens
  output: 0.40          // $0.40 per 1M tokens
};

/**
 * Calculate detailed cost breakdown
 * @param {Object} tokenUsage - Token usage from API
 * @returns {Object} - Detailed cost breakdown
 */
function calculateDetailedCost(tokenUsage) {
  if (!tokenUsage) return { input: 0, output: 0, total: 0 };

  const inputTokens = tokenUsage.prompt_tokens || 0;
  const outputTokens = tokenUsage.completion_tokens || 0;
  const cachedTokens = tokenUsage.cached_tokens || 0;

  // Calculate costs
  const regularInputCost = ((inputTokens - cachedTokens) / 1000000) * PRICING.input;
  const cachedInputCost = (cachedTokens / 1000000) * PRICING.cached_input;
  const outputCost = (outputTokens / 1000000) * PRICING.output;

  return {
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cached_tokens: cachedTokens,
    input_cost: regularInputCost + cachedInputCost,
    output_cost: outputCost,
    total_cost: regularInputCost + cachedInputCost + outputCost,
    breakdown: {
      regular_input: { tokens: inputTokens - cachedTokens, cost: regularInputCost },
      cached_input: { tokens: cachedTokens, cost: cachedInputCost },
      output: { tokens: outputTokens, cost: outputCost }
    }
  };
}

// ============================================
// START EVALUATION
// ============================================

/**
 * @route POST /api/qa/scrape/sessions/:id/evaluate
 * @desc Start AI evaluation for all conversations in a session
 * @access Private (QA users)
 */
exports.startSessionEvaluation = async (req, res) => {
  try {
    const { id: sessionId } = req.params;
    const userId = req.user._id;

    // 1. Get session
    const session = await ScrapeSession.findById(sessionId).populate('agent', 'name');
    if (!session) {
      return res.status(404).json({ message: 'Session not found' });
    }

    // 2. Check if session is completed (scraping done)
    if (session.status !== 'completed') {
      return res.status(400).json({
        message: `Session is not ready for evaluation. Current status: ${session.status}`
      });
    }

    // 3. Check if already evaluating
    const existingEvaluations = await TicketEvaluation.countDocuments({ scrapeSession: sessionId });
    if (existingEvaluations > 0) {
      return res.status(400).json({
        message: 'Evaluation already exists for this session',
        count: existingEvaluations
      });
    }

    // 4. Get all conversations for this session
    const conversations = await ScrapedConversation.find({
      session: sessionId,
      status: 'success'
    }).populate('agent', 'name');

    if (conversations.length === 0) {
      return res.status(400).json({ message: 'No conversations found in this session' });
    }

    // 5. Start evaluation in background
    res.status(202).json({
      message: 'Evaluation started',
      sessionId,
      totalConversations: conversations.length
    });

    // 6. Process evaluations asynchronously
    processEvaluations(sessionId, conversations, userId, session.agent);

  } catch (error) {
    console.error('Error starting evaluation:', error);
    res.status(500).json({ message: 'Failed to start evaluation', error: error.message });
  }
};

/**
 * Process evaluations in background with progress updates
 */
async function processEvaluations(sessionId, conversations, userId, agent) {
  const results = {
    total: conversations.length,
    completed: 0,
    failed: 0,
    pass: 0,
    fail: 0,
    needs_review: 0,
    total_tokens: 0,
    total_cost: 0,
    errors: []
  };

  const startTime = Date.now();

  // Emit start event
  if (io) {
    io.emit(`evaluation:${sessionId}:started`, {
      sessionId,
      total: conversations.length,
      startedAt: new Date()
    });
  }

  // Process in batches of 3 (concurrency limit)
  const batchSize = 3;

  for (let i = 0; i < conversations.length; i += batchSize) {
    const batch = conversations.slice(i, i + batchSize);

    const batchPromises = batch.map(async (conversation) => {
      try {
        // Use raw exportedText/combinedText - AI can understand the format directly
        // Format: "02:32 AM | Triiicky: message content"
        const rawText = conversation.combinedText || conversation.exportedText || '';

        // Create a simple transcript with the full conversation text
        // AI will parse speakers from the text format itself
        const transcript = [{
          message_id: 'full_conversation',
          speaker: 'system',
          text: rawText
        }];

        // Extract ticket facts from conversation (basic extraction)
        // In production, this would come from internal tool
        const ticketFacts = extractTicketFacts(conversation);

        // Extract agent actions
        const agentActions = extractAgentActions(conversation);

        // Call evaluator
        const evaluation = await evaluatorService.evaluateTicket({
          ticketId: conversation.conversationId,
          transcript,
          ticketFacts,
          agentActions,
          conversationId: conversation._id,
          scrapeSessionId: sessionId,
          agentId: conversation.agent._id || conversation.agent,
          agentName: conversation.agentName || agent?.name,
          createdBy: userId
        });

        // Update results
        results.completed++;
        results[evaluation.overall_status]++;
        results.total_tokens += evaluation.token_usage?.total_tokens || 0;
        results.total_cost += evaluation.token_usage?.estimated_cost || 0;

        return { success: true, evaluation };

      } catch (error) {
        console.error(`Error evaluating conversation ${conversation.conversationId}:`, error);
        results.failed++;
        results.errors.push({
          conversationId: conversation.conversationId,
          error: error.message
        });
        return { success: false, error: error.message };
      }
    });

    await Promise.all(batchPromises);

    // Emit progress update
    if (io) {
      io.emit(`evaluation:${sessionId}:progress`, {
        sessionId,
        completed: results.completed,
        failed: results.failed,
        total: results.total,
        pass: results.pass,
        fail: results.fail,
        needs_review: results.needs_review,
        percent: Math.round(((results.completed + results.failed) / results.total) * 100)
      });
    }
  }

  // Emit completion event
  const duration = Date.now() - startTime;
  if (io) {
    io.emit(`evaluation:${sessionId}:completed`, {
      sessionId,
      ...results,
      duration_ms: duration,
      duration_formatted: formatDuration(duration)
    });
  }

  console.log(`Evaluation completed for session ${sessionId}:`, {
    total: results.total,
    completed: results.completed,
    failed: results.failed,
    duration: formatDuration(duration),
    totalCost: `$${results.total_cost.toFixed(4)}`
  });
}

/**
 * Extract ticket facts from conversation (placeholder - will be enhanced)
 */
function extractTicketFacts(conversation) {
  // In production, this would fetch from internal tool
  // For now, return unknown for all fields
  return {
    account_auth_method: 'unknown',
    has_password: 'unknown',
    email_verified: 'unknown',
    phone_verified: 'unknown',
    two_fa_enabled: 'unknown',
    account_restriction_state: 'unknown',
    region_flags: [],
    kyc_state: 'unknown',
    withdrawal_state: 'unknown',
    payment_method_type: 'unknown',
    device_context: 'unknown',
    risk_flags: [],
    internal_checks_available: []
  };
}

/**
 * Extract agent actions from conversation
 */
function extractAgentActions(conversation) {
  const actions = {
    macros_used: [],
    links_sent: [],
    tags_applied: [],
    internal_checks_performed: []
  };

  // Extract links from messages
  const messages = conversation.messages || [];
  for (const msg of messages) {
    if (msg.role === 'agent' && msg.content) {
      // Find URLs
      const urlRegex = /(https?:\/\/[^\s]+)/g;
      const urls = msg.content.match(urlRegex);
      if (urls) {
        actions.links_sent.push(...urls);
      }
    }
  }

  return actions;
}

/**
 * Format duration in human readable format
 */
function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

// ============================================
// GET EVALUATION STATUS
// ============================================

/**
 * @route GET /api/qa/scrape/sessions/:id/evaluation-status
 * @desc Get evaluation status and progress for a session
 * @access Private (QA users)
 */
exports.getEvaluationStatus = async (req, res) => {
  try {
    const { id: sessionId } = req.params;

    // Get session
    const session = await ScrapeSession.findById(sessionId).populate('agent', 'name');
    if (!session) {
      return res.status(404).json({ message: 'Session not found' });
    }

    // Get total conversations
    const totalConversations = await ScrapedConversation.countDocuments({
      session: sessionId,
      status: 'success'
    });

    // Get evaluation stats
    const stats = await TicketEvaluation.getSessionStats(sessionId);

    // Get token usage aggregation
    const tokenStats = await TicketEvaluation.aggregate([
      { $match: { scrapeSession: session._id } },
      {
        $group: {
          _id: null,
          total_prompt_tokens: { $sum: '$token_usage.prompt_tokens' },
          total_completion_tokens: { $sum: '$token_usage.completion_tokens' },
          total_tokens: { $sum: '$token_usage.total_tokens' },
          total_cost: { $sum: '$token_usage.estimated_cost' },
          avg_tokens_per_ticket: { $avg: '$token_usage.total_tokens' },
          avg_duration_ms: { $avg: '$evaluation_duration_ms' }
        }
      }
    ]);

    const tokenData = tokenStats[0] || {
      total_prompt_tokens: 0,
      total_completion_tokens: 0,
      total_tokens: 0,
      total_cost: 0,
      avg_tokens_per_ticket: 0,
      avg_duration_ms: 0
    };

    // Calculate detailed cost breakdown
    const costBreakdown = {
      input_cost: (tokenData.total_prompt_tokens / 1000000) * PRICING.input,
      output_cost: (tokenData.total_completion_tokens / 1000000) * PRICING.output,
      total_cost: tokenData.total_cost
    };

    res.json({
      sessionId,
      session: {
        csvFileName: session.csvFileName,
        agent: session.agent?.name,
        status: session.status
      },
      evaluation: {
        status: stats.total === 0 ? 'not_started' :
                stats.total < totalConversations ? 'in_progress' : 'completed',
        total_conversations: totalConversations,
        evaluated: stats.total,
        pending: totalConversations - stats.total,
        progress_percent: totalConversations > 0 ?
          Math.round((stats.total / totalConversations) * 100) : 0
      },
      results: {
        pass: stats.pass,
        fail: stats.fail,
        needs_review: stats.needs_review,
        imported: stats.imported,
        total_violations: stats.total_violations,
        total_potential: stats.total_potential,
        avg_confidence: stats.avg_confidence
      },
      token_usage: {
        prompt_tokens: tokenData.total_prompt_tokens,
        completion_tokens: tokenData.total_completion_tokens,
        total_tokens: tokenData.total_tokens,
        avg_tokens_per_ticket: Math.round(tokenData.avg_tokens_per_ticket || 0)
      },
      cost: {
        input: `$${costBreakdown.input_cost.toFixed(4)}`,
        output: `$${costBreakdown.output_cost.toFixed(4)}`,
        total: `$${costBreakdown.total_cost.toFixed(4)}`,
        pricing: {
          input_per_1m: `$${PRICING.input}`,
          cached_per_1m: `$${PRICING.cached_input}`,
          output_per_1m: `$${PRICING.output}`
        }
      },
      performance: {
        avg_evaluation_time_ms: Math.round(tokenData.avg_duration_ms || 0),
        avg_evaluation_time: formatDuration(tokenData.avg_duration_ms || 0)
      }
    });

  } catch (error) {
    console.error('Error getting evaluation status:', error);
    res.status(500).json({ message: 'Failed to get evaluation status', error: error.message });
  }
};

// ============================================
// GET SESSION EVALUATIONS (DEBUG PAGE)
// ============================================

/**
 * @route GET /api/qa/scrape/sessions/:id/evaluations
 * @desc Get all evaluations for a session with full debug details
 * @access Private (QA users)
 */
exports.getSessionEvaluations = async (req, res) => {
  try {
    const { id: sessionId } = req.params;
    const { page = 1, limit = 20, status, sort = '-createdAt' } = req.query;

    // Build query
    const query = { scrapeSession: sessionId };
    if (status && status !== 'all') {
      query.overall_status = status;
    }

    // Get evaluations with full details
    const evaluations = await TicketEvaluation.find(query)
      .populate('agent', 'name team')
      .populate('conversation', 'conversationId messageCount agentName')
      .sort(sort)
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit));

    const total = await TicketEvaluation.countDocuments(query);

    // Get session stats for header
    const stats = await TicketEvaluation.getSessionStats(sessionId);

    // Format evaluations with debug info
    const formattedEvaluations = evaluations.map(evaluation => ({
      _id: evaluation._id,
      ticket_id: evaluation.ticket_id,
      conversation_id: evaluation.conversation?.conversationId,
      agent_name: evaluation.agent_name || evaluation.agent?.name,

      // Classification
      category: evaluation.category,
      subcategory: evaluation.subcategory,
      risk_level: evaluation.risk_level,

      // Results
      overall_status: evaluation.overall_status,
      confidence: evaluation.confidence,

      // Findings summary
      findings_summary: evaluation.findings_summary,
      findings: evaluation.findings.map(f => ({
        type: f.type,
        severity: f.severity,
        rule_id: f.rule_id,
        rule_title: f.rule_title,
        rule_text_excerpt: f.rule_text_excerpt,
        explanation: f.explanation,
        recommended_fix: f.recommended_fix,
        ticket_evidence: f.ticket_evidence,
        verification_needed: f.verification_needed,
        what_to_verify: f.what_to_verify,
        why_uncertain: f.why_uncertain
      })),

      // Technical details (DEBUG)
      debug: {
        // Retrieved rules
        retrieved_rules: evaluation.retrieved_rules || [],
        retrieved_rules_count: (evaluation.retrieved_rules || []).length,

        // Guardrail findings
        guardrail_findings: evaluation.guardrail_findings || [],

        // Ticket facts used
        ticket_facts: evaluation.ticket_facts,

        // Agent actions detected
        agent_actions: evaluation.agent_actions,

        // AI model info
        model_used: evaluation.model_used,

        // Token usage
        token_usage: {
          prompt_tokens: evaluation.token_usage?.prompt_tokens || 0,
          completion_tokens: evaluation.token_usage?.completion_tokens || 0,
          total_tokens: evaluation.token_usage?.total_tokens || 0,
          estimated_cost: evaluation.token_usage?.estimated_cost || 0,
          cost_formatted: `$${(evaluation.token_usage?.estimated_cost || 0).toFixed(6)}`
        },

        // Timing
        evaluation_duration_ms: evaluation.evaluation_duration_ms,
        evaluation_duration: formatDuration(evaluation.evaluation_duration_ms || 0),
        started_at: evaluation.evaluation_started_at,
        completed_at: evaluation.evaluation_completed_at
      },

      // QA workflow
      qa_status: evaluation.qa_status,
      imported: evaluation.imported,
      createdAt: evaluation.createdAt
    }));

    // Calculate totals for this page
    const pageTokens = formattedEvaluations.reduce((sum, e) =>
      sum + (e.debug.token_usage.total_tokens || 0), 0);
    const pageCost = formattedEvaluations.reduce((sum, e) =>
      sum + (e.debug.token_usage.estimated_cost || 0), 0);

    res.json({
      evaluations: formattedEvaluations,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      },
      session_stats: stats,
      page_totals: {
        tokens: pageTokens,
        cost: `$${pageCost.toFixed(4)}`
      }
    });

  } catch (error) {
    console.error('Error getting session evaluations:', error);
    res.status(500).json({ message: 'Failed to get evaluations', error: error.message });
  }
};

// ============================================
// GET SINGLE EVALUATION DETAIL
// ============================================

/**
 * @route GET /api/qa/scrape/evaluations/:id
 * @desc Get single evaluation with full details
 * @access Private (QA users)
 */
exports.getEvaluationDetail = async (req, res) => {
  try {
    const { id } = req.params;

    const evaluation = await TicketEvaluation.findById(id)
      .populate('agent', 'name team')
      .populate('conversation')
      .populate('scrapeSession', 'csvFileName');

    if (!evaluation) {
      return res.status(404).json({ message: 'Evaluation not found' });
    }

    // Get conversation messages for context
    const conversation = await ScrapedConversation.findById(evaluation.conversation);

    res.json({
      evaluation: {
        _id: evaluation._id,
        ticket_id: evaluation.ticket_id,
        agent_name: evaluation.agent_name || evaluation.agent?.name,
        session_file: evaluation.scrapeSession?.csvFileName,

        // Classification
        category: evaluation.category,
        subcategory: evaluation.subcategory,
        risk_level: evaluation.risk_level,

        // Results
        overall_status: evaluation.overall_status,
        confidence: evaluation.confidence,
        findings_summary: evaluation.findings_summary,
        findings: evaluation.findings,

        // Full conversation
        conversation: {
          messages: conversation?.messages || [],
          messageCount: conversation?.messageCount || 0
        },

        // Technical details
        debug: {
          retrieved_rules: evaluation.retrieved_rules,
          guardrail_findings: evaluation.guardrail_findings,
          ticket_facts: evaluation.ticket_facts,
          agent_actions: evaluation.agent_actions,
          model_used: evaluation.model_used,
          token_usage: {
            ...evaluation.token_usage?.toObject(),
            cost_formatted: `$${(evaluation.token_usage?.estimated_cost || 0).toFixed(6)}`,
            breakdown: calculateDetailedCost({
              prompt_tokens: evaluation.token_usage?.prompt_tokens,
              completion_tokens: evaluation.token_usage?.completion_tokens
            })
          },
          timing: {
            duration_ms: evaluation.evaluation_duration_ms,
            duration: formatDuration(evaluation.evaluation_duration_ms || 0),
            started_at: evaluation.evaluation_started_at,
            completed_at: evaluation.evaluation_completed_at
          }
        },

        // QA workflow
        qa_status: evaluation.qa_status,
        imported: evaluation.imported,
        qa_notes: evaluation.qa_notes,

        createdAt: evaluation.createdAt,
        updatedAt: evaluation.updatedAt
      }
    });

  } catch (error) {
    console.error('Error getting evaluation detail:', error);
    res.status(500).json({ message: 'Failed to get evaluation', error: error.message });
  }
};

// ============================================
// GET AGGREGATED COST STATS
// ============================================

/**
 * @route GET /api/qa/scrape/evaluations/cost-summary
 * @desc Get aggregated cost statistics across all evaluations
 * @access Private (QA users)
 */
exports.getCostSummary = async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const userId = req.user._id;

    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - parseInt(days));

    // Get aggregated stats
    const stats = await TicketEvaluation.aggregate([
      {
        $match: {
          createdAt: { $gte: sinceDate },
          created_by: userId
        }
      },
      {
        $group: {
          _id: null,
          total_evaluations: { $sum: 1 },
          total_prompt_tokens: { $sum: '$token_usage.prompt_tokens' },
          total_completion_tokens: { $sum: '$token_usage.completion_tokens' },
          total_tokens: { $sum: '$token_usage.total_tokens' },
          total_cost: { $sum: '$token_usage.estimated_cost' },
          avg_tokens_per_eval: { $avg: '$token_usage.total_tokens' },
          avg_cost_per_eval: { $avg: '$token_usage.estimated_cost' }
        }
      }
    ]);

    // Get daily breakdown
    const dailyStats = await TicketEvaluation.aggregate([
      {
        $match: {
          createdAt: { $gte: sinceDate },
          created_by: userId
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          evaluations: { $sum: 1 },
          tokens: { $sum: '$token_usage.total_tokens' },
          cost: { $sum: '$token_usage.estimated_cost' }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    const data = stats[0] || {
      total_evaluations: 0,
      total_prompt_tokens: 0,
      total_completion_tokens: 0,
      total_tokens: 0,
      total_cost: 0,
      avg_tokens_per_eval: 0,
      avg_cost_per_eval: 0
    };

    res.json({
      period: {
        days: parseInt(days),
        since: sinceDate
      },
      totals: {
        evaluations: data.total_evaluations,
        prompt_tokens: data.total_prompt_tokens,
        completion_tokens: data.total_completion_tokens,
        total_tokens: data.total_tokens,
        cost: `$${data.total_cost.toFixed(4)}`
      },
      averages: {
        tokens_per_evaluation: Math.round(data.avg_tokens_per_eval || 0),
        cost_per_evaluation: `$${(data.avg_cost_per_eval || 0).toFixed(6)}`
      },
      pricing: {
        input_per_1m_tokens: `$${PRICING.input}`,
        cached_input_per_1m_tokens: `$${PRICING.cached_input}`,
        output_per_1m_tokens: `$${PRICING.output}`
      },
      daily: dailyStats.map(d => ({
        date: d._id,
        evaluations: d.evaluations,
        tokens: d.tokens,
        cost: `$${d.cost.toFixed(4)}`
      }))
    });

  } catch (error) {
    console.error('Error getting cost summary:', error);
    res.status(500).json({ message: 'Failed to get cost summary', error: error.message });
  }
};

// ============================================
// RE-EVALUATE SINGLE TICKET
// ============================================

/**
 * @route POST /api/qa/scrape/evaluations/:id/re-evaluate
 * @desc Re-evaluate a single ticket
 * @access Private (QA users)
 */
exports.reEvaluateTicket = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    // Get existing evaluation
    const existing = await TicketEvaluation.findById(id);
    if (!existing) {
      return res.status(404).json({ message: 'Evaluation not found' });
    }

    // Get conversation
    const conversation = await ScrapedConversation.findById(existing.conversation)
      .populate('agent', 'name');

    if (!conversation) {
      return res.status(404).json({ message: 'Original conversation not found' });
    }

    // Delete old evaluation
    await TicketEvaluation.findByIdAndDelete(id);

    // Prepare transcript
    const transcript = (conversation.messages || []).map((msg, idx) => ({
      message_id: `msg_${idx}`,
      speaker: msg.role === 'agent' ? 'agent' : msg.role === 'customer' ? 'user' : 'system',
      text: msg.content || '',
      timestamp: msg.timestamp
    }));

    // Re-evaluate
    const newEvaluation = await evaluatorService.evaluateTicket({
      ticketId: conversation.conversationId,
      transcript,
      ticketFacts: existing.ticket_facts?.toObject() || extractTicketFacts(conversation),
      agentActions: existing.agent_actions?.toObject() || extractAgentActions(conversation),
      conversationId: conversation._id,
      scrapeSessionId: existing.scrapeSession,
      agentId: conversation.agent._id || conversation.agent,
      agentName: conversation.agentName || conversation.agent?.name,
      createdBy: userId
    });

    res.json({
      message: 'Re-evaluation completed',
      evaluation: {
        _id: newEvaluation._id,
        overall_status: newEvaluation.overall_status,
        confidence: newEvaluation.confidence,
        findings_count: newEvaluation.findings.length,
        token_usage: newEvaluation.token_usage
      }
    });

  } catch (error) {
    console.error('Error re-evaluating ticket:', error);
    res.status(500).json({ message: 'Failed to re-evaluate', error: error.message });
  }
};

// ============================================
// DELETE EVALUATION
// ============================================

/**
 * @route DELETE /api/qa/scrape/sessions/:id/evaluations
 * @desc Delete all evaluations for a session (for re-running)
 * @access Private (QA users)
 */
exports.deleteSessionEvaluations = async (req, res) => {
  try {
    const { id: sessionId } = req.params;

    const result = await TicketEvaluation.deleteMany({ scrapeSession: sessionId });

    res.json({
      message: 'Evaluations deleted',
      deletedCount: result.deletedCount
    });

  } catch (error) {
    console.error('Error deleting evaluations:', error);
    res.status(500).json({ message: 'Failed to delete evaluations', error: error.message });
  }
};
