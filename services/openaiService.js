const OpenAI = require('openai');
const logger = require('../utils/logger');

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Validate API key on initialization
if (!process.env.OPENAI_API_KEY) {
  logger.warn('OPENAI_API_KEY is not set in environment variables');
}

/**
 * Generate feedback suggestions based on historical ticket data
 * @param {Object} ticketData - Current ticket information
 * @param {Array} historicalFeedbacks - Array of past tickets with feedback
 * @returns {Promise<Object>} AI-generated suggestions
 */
const generateFeedbackSuggestions = async (ticketData, historicalFeedbacks) => {
  try {
    // Build context from historical feedbacks
    const context = historicalFeedbacks
      .filter(ticket => ticket.feedback && ticket.feedback.trim())
      .map(ticket => ({
        agent: ticket.agent?.name || 'Unknown',
        ticketId: ticket.ticketId,
        description: ticket.shortDescription,
        qualityScore: ticket.qualityScorePercent,
        feedback: ticket.feedback,
        status: ticket.status
      }))
      .slice(0, 10); // Limit to 10 most relevant examples

    // Create the prompt
    const systemPrompt = `You are an AI assistant helping QA managers evaluate customer support tickets.
Based on historical feedback patterns, you provide suggestions for:
1. Quality score predictions
2. Feedback suggestions
3. Areas of improvement

Analyze the provided ticket and historical data to give helpful insights.`;

    const userPrompt = `Current Ticket:
- Ticket ID: ${ticketData.ticketId}
- Agent: ${ticketData.agent?.name || 'Unknown'}
- Description: ${ticketData.shortDescription || 'No description'}
- Notes: ${ticketData.notes || 'No notes'}

Historical Similar Tickets (with feedback):
${JSON.stringify(context, null, 2)}

Based on this data, please provide:
1. Suggested quality score (0-100) with reasoning
2. Suggested feedback for this ticket
3. Key areas to focus on during evaluation

Respond in JSON format:
{
  "suggestedScore": number,
  "scoreReasoning": "string",
  "suggestedFeedback": "string",
  "focusAreas": ["area1", "area2", "area3"]
}`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-5-nano-2025-08-07',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      max_completion_tokens: 1000,
      response_format: { type: 'json_object' }
    });

    const response = JSON.parse(completion.choices[0].message.content);

    logger.info(`AI feedback generated for ticket ${ticketData.ticketId}`);

    return {
      success: true,
      suggestions: response,
      tokensUsed: completion.usage.total_tokens
    };
  } catch (error) {
    logger.error('Error generating AI feedback:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Analyze feedback patterns for an agent
 * @param {Array} agentTickets - All tickets for a specific agent
 * @returns {Promise<Object>} Analysis results
 */
const analyzeAgentPerformance = async (agentTickets) => {
  try {
    const ticketsWithFeedback = agentTickets.filter(t => t.feedback && t.feedback.trim());

    if (ticketsWithFeedback.length === 0) {
      return {
        success: false,
        message: 'No feedback data available for analysis'
      };
    }

    const feedbackSummary = ticketsWithFeedback.map(t => ({
      ticketId: t.ticketId,
      score: t.qualityScorePercent,
      feedback: t.feedback
    }));

    const systemPrompt = `You are an AI assistant analyzing customer support agent performance based on QA feedback.
Provide actionable insights and recommendations.`;

    const userPrompt = `Agent Performance Data:
Total tickets analyzed: ${ticketsWithFeedback.length}
Average score: ${(ticketsWithFeedback.reduce((sum, t) => sum + (t.qualityScorePercent || 0), 0) / ticketsWithFeedback.length).toFixed(2)}

Feedback history:
${JSON.stringify(feedbackSummary, null, 2)}

Please analyze and provide:
1. Common strengths
2. Common weaknesses
3. Specific improvement recommendations
4. Training needs

Respond in JSON format:
{
  "strengths": ["strength1", "strength2"],
  "weaknesses": ["weakness1", "weakness2"],
  "recommendations": ["recommendation1", "recommendation2"],
  "trainingNeeds": ["training1", "training2"]
}`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-5-nano-2025-08-07',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      max_completion_tokens: 1200,
      response_format: { type: 'json_object' }
    });

    const response = JSON.parse(completion.choices[0].message.content);

    return {
      success: true,
      analysis: response,
      tokensUsed: completion.usage.total_tokens
    };
  } catch (error) {
    logger.error('Error analyzing agent performance:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

module.exports = {
  generateFeedbackSuggestions,
  analyzeAgentPerformance
};
