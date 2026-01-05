const OpenAI = require('openai');
const TicketEvaluation = require('../models/TicketEvaluation');
const retrievalService = require('./retrievalService');
const guardrailService = require('./guardrailService');

/**
 * AI Evaluator Service - Evaluacija tiketa koristeći gpt-5-mini
 * Prema specifikaciji: Section 8
 */

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Model configuration
const EVALUATOR_MODEL = 'gpt-5-mini-2025-08-07';

/**
 * Normalize speaker value to valid enum
 * @param {string} speaker - Raw speaker value from AI
 * @returns {string} - Normalized speaker value ('user', 'agent', or 'system')
 */
function normalizeSpeaker(speaker) {
  if (!speaker || typeof speaker !== 'string') {
    return 'user';
  }

  const lowerSpeaker = speaker.toLowerCase().trim();

  // Check for agent indicators
  if (
    lowerSpeaker === 'agent' ||
    lowerSpeaker.includes('agent') ||
    lowerSpeaker.includes('support') ||
    lowerSpeaker.includes('from stake') ||
    lowerSpeaker.includes('stake.com') ||
    lowerSpeaker.includes('representative') ||
    lowerSpeaker.includes('operator')
  ) {
    return 'agent';
  }

  // Check for system indicators
  if (
    lowerSpeaker === 'system' ||
    lowerSpeaker.includes('system') ||
    lowerSpeaker.includes('bot') ||
    lowerSpeaker.includes('automated')
  ) {
    return 'system';
  }

  // Default to user for everything else (usernames like "ote02", etc.)
  return 'user';
}

/**
 * Sanitize AI findings to ensure valid enum values
 * @param {Object[]} findings - AI findings array
 * @returns {Object[]} - Sanitized findings
 */
function sanitizeFindings(findings) {
  if (!findings || !Array.isArray(findings)) {
    return [];
  }

  return findings.map(finding => {
    // Sanitize ticket_evidence speakers
    if (finding.ticket_evidence && Array.isArray(finding.ticket_evidence)) {
      finding.ticket_evidence = finding.ticket_evidence.map(evidence => ({
        ...evidence,
        speaker: normalizeSpeaker(evidence.speaker)
      }));
    }

    // Ensure valid type enum
    const validTypes = ['violation', 'potential_violation', 'improvement', 'note', 'positive'];
    if (!validTypes.includes(finding.type)) {
      finding.type = 'note';
    }

    // Ensure valid severity enum
    const validSeverities = ['critical', 'high', 'medium', 'low'];
    if (!validSeverities.includes(finding.severity)) {
      finding.severity = 'medium';
    }

    return finding;
  });
}

/**
 * Sanitize transcript - filter out image-only messages and replace image content
 * @param {Object[]} transcript - Lista poruka
 * @returns {Object[]} - Sanitized transcript
 */
function sanitizeTranscript(transcript) {
  if (!transcript || !Array.isArray(transcript)) {
    return [];
  }

  return transcript
    .map(m => {
      // If message has no text or only whitespace, skip it (likely image-only)
      if (!m.text || m.text.trim() === '') {
        return null;
      }

      // Clean the text - replace base64 image data with placeholder
      let cleanText = m.text;

      // Replace base64 image data (data:image/...)
      cleanText = cleanText.replace(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/gi, '[Image]');

      // Replace common image URL patterns
      cleanText = cleanText.replace(/https?:\/\/[^\s]+\.(png|jpg|jpeg|gif|webp|svg)(\?[^\s]*)?/gi, '[Image: $&]');

      // Replace Zendesk/Intercom attachment patterns
      cleanText = cleanText.replace(/\[attachment[^\]]*\]/gi, '[Image Attachment]');

      // If after cleaning, the message is empty or just whitespace/placeholders
      const textWithoutPlaceholders = cleanText.replace(/\[Image[^\]]*\]/g, '').trim();
      if (textWithoutPlaceholders === '') {
        // Return a simplified version so we know there was an image
        return {
          ...m,
          text: '[User sent an image]'
        };
      }

      return {
        ...m,
        text: cleanText
      };
    })
    .filter(m => m !== null);
}

// Compact system prompt (~500 tokens instead of ~2200)
const SYSTEM_PROMPT = `QA auditor evaluating support tickets against rules. Return JSON only.

RULES:
- Only use evidence from transcript and TicketFacts
- If uncertain, use "potential_violation" with verification_needed=true
- Cite specific quotes from transcript

OUTPUT JSON:
{"overall_status":"pass|fail|needs_review","confidence":0.0-1.0,"findings":[{"type":"violation|potential_violation|improvement|positive","severity":"critical|high|medium|low","rule_id":"ID","rule_title":"title","explanation":"what happened","ticket_evidence":[{"speaker":"agent|user","excerpt":"quote"}],"verification_needed":false}]}

SEVERITY: critical=regulatory/harm, high=clear violation, medium=suboptimal, low=minor`;

/**
 * Klasifikuj tiket (kategorija, rizik)
 * @param {string} ticketSummary - Sažetak tiketa
 * @param {Object} ticketFacts - TicketFacts
 * @returns {Promise<Object>} - Klasifikacija
 */
function classifyTicket(ticketSummary, ticketFacts) {
  // Keyword matching + facts-based classification
  const summaryLower = (ticketSummary || '').toLowerCase();
  let detectedCategory = 'General Support';
  let subcategory = null;
  let riskLevel = 'medium';
  const mandatoryTags = [];

  // === RESPONSIBLE GAMBLING (highest priority - check first) ===
  if (summaryLower.includes('self-exclu') || summaryLower.includes('self exclu') ||
      summaryLower.includes('exclusion') || summaryLower.includes('return to play') ||
      summaryLower.includes('reactivate') || summaryLower.includes('cool off') ||
      summaryLower.includes('cooloff') || summaryLower.includes('timeout') ||
      summaryLower.includes('gambling problem') || summaryLower.includes('addiction') ||
      summaryLower.includes('deposit limit') || summaryLower.includes('loss limit') ||
      summaryLower.includes('wager limit') || summaryLower.includes('session limit')) {
    detectedCategory = 'Responsible Gambling';
    riskLevel = 'critical';
    mandatoryTags.push('responsible_gambling');

    // Specific RG subtypes
    if (summaryLower.includes('self-exclu') || summaryLower.includes('self exclu') || summaryLower.includes('exclusion')) {
      subcategory = 'Self-Exclusion';
      mandatoryTags.push('rg_self_exclusion');
    }
    if (summaryLower.includes('return to play') || summaryLower.includes('reactivate') || summaryLower.includes('lift')) {
      mandatoryTags.push('rg_return_to_play', 'account_reactivation');
    }
    if (summaryLower.includes('cool') || summaryLower.includes('timeout')) {
      subcategory = 'Cooling Off';
      mandatoryTags.push('rg_cooling_off');
    }
    if (summaryLower.includes('limit')) {
      subcategory = 'Limits';
      mandatoryTags.push('rg_limits');
    }
  }
  // === PAYMENTS ===
  else if (summaryLower.includes('withdraw') || summaryLower.includes('deposit') ||
           summaryLower.includes('payment') || summaryLower.includes('transaction') ||
           summaryLower.includes('crypto') || summaryLower.includes('bitcoin') ||
           summaryLower.includes('balance') || summaryLower.includes('transfer') ||
           summaryLower.includes('interac') || summaryLower.includes('gigadat') ||
           summaryLower.includes('e-transfer') || summaryLower.includes('etransfer')) {
    detectedCategory = 'Payments';
    mandatoryTags.push('payments');
    riskLevel = 'high';

    if (summaryLower.includes('withdraw')) {
      subcategory = 'Withdrawals';
      mandatoryTags.push('withdrawals');
    }
    if (summaryLower.includes('deposit') || summaryLower.includes('not reflected') ||
        summaryLower.includes('missing') || summaryLower.includes('didn\'t receive')) {
      subcategory = 'Deposits';
      mandatoryTags.push('deposits', 'deposit_issues');
    }
    if (summaryLower.includes('interac') || summaryLower.includes('gigadat') || summaryLower.includes('e-transfer')) {
      mandatoryTags.push('interac', 'cad_payments');
    }
  }
  // === ACCOUNT ACCESS ===
  else if (summaryLower.includes('password') || summaryLower.includes('login') ||
           summaryLower.includes('access') || summaryLower.includes('recover') ||
           summaryLower.includes('activate') || summaryLower.includes('2fa') ||
           summaryLower.includes('authenticat') || summaryLower.includes('locked out') ||
           summaryLower.includes('can\'t log') || summaryLower.includes('cannot log')) {
    detectedCategory = 'Account Access';
    mandatoryTags.push('account_access');

    if (summaryLower.includes('recover') || summaryLower.includes('lost')) {
      subcategory = 'Account Recovery';
      mandatoryTags.push('account_recovery');
    }
    if (summaryLower.includes('2fa') || summaryLower.includes('authenticat') || summaryLower.includes('google auth')) {
      subcategory = '2FA';
      mandatoryTags.push('two_factor_auth');
    }
    if (summaryLower.includes('password')) {
      subcategory = 'Password';
      mandatoryTags.push('password_reset');
    }
  }
  // === KYC ===
  else if (summaryLower.includes('kyc') || summaryLower.includes('verification') ||
           summaryLower.includes('document') || summaryLower.includes('identity') ||
           summaryLower.includes('selfie') || summaryLower.includes('passport') ||
           summaryLower.includes('id card') || summaryLower.includes('proof of')) {
    detectedCategory = 'KYC';
    mandatoryTags.push('kyc', 'verification');
    riskLevel = 'high';
  }
  // === BONUSES ===
  else if (summaryLower.includes('bonus') || summaryLower.includes('promotion') ||
           summaryLower.includes('reward') || summaryLower.includes('rakeback') ||
           summaryLower.includes('vip') || summaryLower.includes('cashback') ||
           summaryLower.includes('free spin') || summaryLower.includes('code')) {
    detectedCategory = 'Bonuses';
    mandatoryTags.push('bonuses');
  }
  // === BETTING ===
  else if (summaryLower.includes('bet') || summaryLower.includes('casino') ||
           summaryLower.includes('slot') || summaryLower.includes('game') ||
           summaryLower.includes('wager') || summaryLower.includes('odds') ||
           summaryLower.includes('sports') || summaryLower.includes('live dealer')) {
    detectedCategory = 'Betting';
    mandatoryTags.push('betting');
  }

  // === CHECK TICKET FACTS FOR ADDITIONAL MANDATORY TAGS ===
  if (ticketFacts) {
    // Account restriction state
    if (ticketFacts.account_restriction_state === 'self_excluded' ||
        ticketFacts.account_restriction_state === 'cooling_off') {
      mandatoryTags.push('rg_self_exclusion', 'responsible_gambling');
      riskLevel = 'critical';
    }

    // Auth method
    if (ticketFacts.account_auth_method === 'google' || ticketFacts.account_auth_method === 'social') {
      mandatoryTags.push('social_login');
    }

    // Region-specific
    if (ticketFacts.region_flags?.includes('ON')) {
      mandatoryTags.push('ontario', 'regulated_jurisdiction');
      riskLevel = 'high';
    }
  }

  // Dedupe mandatory tags
  const uniqueTags = [...new Set(mandatoryTags)];

  console.log(`[Classify] category="${detectedCategory}", subcategory="${subcategory}", tags=[${uniqueTags.join(',')}]`);

  return {
    category: detectedCategory,
    subcategory: subcategory,
    risk_level: riskLevel,
    key_entities: [],
    mandatory_tags: uniqueTags
  };
}

/**
 * Generiši sažetak tiketa
 * @param {Object[]} transcript - Lista poruka
 * @returns {Promise<string>} - Sažetak
 */
async function generateTicketSummary(transcript) {
  try {
    let messagesText = '';

    // Handle full conversation format (single message with raw text)
    if (transcript.length === 1 && transcript[0].message_id === 'full_conversation') {
      messagesText = transcript[0].text || '';
      // Clean up image URLs
      messagesText = messagesText.replace(/\[Image "[^"]+"\]/g, '[Image]');
    } else {
      // Handle individual messages format
      const cleanTranscript = sanitizeTranscript(transcript);
      if (cleanTranscript.length === 0) {
        return 'Ticket contains only images or no text content.';
      }
      messagesText = cleanTranscript
        .map(m => `[${m.speaker}]: ${m.text}`)
        .join('\n');
    }

    if (!messagesText || messagesText.trim().length < 50) {
      return 'Ticket contains minimal or no text content.';
    }

    // If transcript is very short, just use it directly
    if (messagesText.length < 500) {
      return messagesText;
    }

    // Truncate input to avoid overwhelming the model
    const truncatedText = messagesText.substring(0, 4000);
    console.log(`[Summary] Sending ${truncatedText.length} chars to AI`);

    const response = await openai.chat.completions.create({
      model: EVALUATOR_MODEL,
      messages: [
        {
          role: 'system',
          content: 'Summarize this support ticket in 2-3 sentences. Focus on: what the user asked about, what the agent did, and the outcome.'
        },
        {
          role: 'user',
          content: truncatedText
        }
      ],
      max_completion_tokens: 500
    });

    const summary = response.choices[0]?.message?.content;
    const finishReason = response.choices[0]?.finish_reason;
    console.log(`[Summary] Response: finish_reason=${finishReason}, length=${summary?.length || 0}`);

    // If AI returns empty, use first 500 chars of transcript as summary
    if (!summary || summary.trim() === '') {
      console.warn(`[Summary] AI returned empty (finish_reason=${finishReason}), using transcript excerpt`);
      return messagesText.substring(0, 500) + '...';
    }

    return summary;
  } catch (error) {
    console.error('Error generating summary:', error.message);
    // Fallback: use first 500 chars of transcript
    const cleanTranscript = sanitizeTranscript(transcript);
    const fallbackText = cleanTranscript
      .map(m => `[${m.speaker}]: ${m.text}`)
      .join('\n')
      .substring(0, 500);
    return fallbackText || 'Unable to generate summary';
  }
}

/**
 * Formatiraj transcript za prompt
 * @param {Object[]} transcript - Lista poruka
 * @returns {string} - Formatiran tekst
 */
function formatTranscriptForPrompt(transcript) {
  // If transcript is a single message with full conversation text, just return it
  if (transcript.length === 1 && transcript[0].message_id === 'full_conversation') {
    // Clean up image URLs but keep the structure
    let text = transcript[0].text || '';
    // Replace long image URLs with placeholder
    text = text.replace(/\[Image "[^"]+"\]/g, '[Image attachment]');
    // Truncate if too long to leave room for output
    const MAX_TRANSCRIPT_CHARS = 15000;
    if (text.length > MAX_TRANSCRIPT_CHARS) {
      console.log(`[Transcript] Truncating from ${text.length} to ${MAX_TRANSCRIPT_CHARS} chars`);
      text = text.substring(0, MAX_TRANSCRIPT_CHARS) + '\n\n[...transcript truncated for length...]';
    }
    return text;
  }

  // Otherwise, sanitize and format individual messages
  const cleanTranscript = sanitizeTranscript(transcript);

  return cleanTranscript
    .map((m, i) => {
      const speaker = m.speaker === 'agent' ? '🎧 AGENT' : m.speaker === 'user' ? '👤 USER' : '⚙️ SYSTEM';
      const msgId = m.message_id || `msg_${i}`;
      return `[${msgId}] ${speaker}:\n${m.text}`;
    })
    .join('\n\n---\n\n');
}

/**
 * Formatiraj TicketFacts za prompt
 * @param {Object} facts - TicketFacts
 * @returns {string} - Formatiran tekst
 */
function formatFactsForPrompt(facts) {
  const lines = [];

  for (const [key, value] of Object.entries(facts || {})) {
    if (value && value !== 'unknown' && !Array.isArray(value)) {
      lines.push(`- ${key}: ${value}`);
    } else if (Array.isArray(value) && value.length > 0) {
      lines.push(`- ${key}: [${value.join(', ')}]`);
    }
  }

  if (lines.length === 0) {
    return 'No specific facts available.';
  }

  return lines.join('\n');
}

/**
 * Glavna evaluacija tiketa
 * @param {Object} params - Parametri evaluacije
 * @returns {Promise<Object>} - TicketEvaluation dokument
 */
async function evaluateTicket(params) {
  const {
    ticketId,
    transcript,
    ticketFacts = {},
    agentActions = {},
    conversationId = null,
    scrapeSessionId = null,
    agentId = null,
    agentName = null,
    createdBy = null
  } = params;

  const startTime = Date.now();

  try {
    // 1. Generiši sažetak tiketa
    const ticketSummary = await generateTicketSummary(transcript);
    console.log(`[Evaluator] Ticket ${ticketId}: Summary length=${ticketSummary?.length || 0}, first 100 chars: "${ticketSummary?.substring(0, 100)}..."`);

    // 2. Klasifikuj tiket
    const classification = await classifyTicket(ticketSummary, ticketFacts);
    console.log(`[Evaluator] Ticket ${ticketId}: Classification category="${classification.category}", entities=[${classification.key_entities?.join(', ')}]`);

    // 3. Pokreni guardrail checks
    const guardrailFindings = guardrailService.quickGuardrailCheck(
      ticketFacts,
      transcript,
      agentActions
    );

    // 4. Hybrid retrieval - dobij relevantna pravila
    const retrievalResult = await retrievalService.hybridRetrieval({
      ticketSummary,
      ticketEntities: classification.key_entities,
      ticketFacts,
      agentActions,
      category: classification.category
    });

    // DEBUG: Log retrieval results
    console.log(`[Retrieval] Ticket ${ticketId}: semantic=${retrievalResult.stats.semantic_count}, mandatory=${retrievalResult.stats.mandatory_count}, final=${retrievalResult.stats.final_count}`);
    if (retrievalResult.chunks.length === 0) {
      console.warn(`[Retrieval] WARNING: No rules retrieved for ticket ${ticketId}! Check if RuleChunks exist.`);
    }

    // 5. Fetch full rules
    const chunksWithRules = await retrievalService.fetchFullRules(retrievalResult.chunks);

    // DEBUG: Log how many rules have full data
    const rulesWithData = chunksWithRules.filter(c => c.rule);
    console.log(`[Retrieval] Ticket ${ticketId}: ${rulesWithData.length}/${chunksWithRules.length} chunks have full rule data`);

    // 6. Format za AI prompt - use THIN rules to reduce tokens
    const rulesText = retrievalService.formatThinRulesForPrompt(chunksWithRules);
    const finalRulesText = rulesText || 'No rules retrieved.';

    // Get condensed transcript - limit to 1500 chars for token savings
    const transcriptText = formatTranscriptForPrompt(transcript);
    const condensedTranscript = transcriptText.length > 1500
      ? transcriptText.substring(0, 1500) + '\n[...]'
      : transcriptText;

    // 7. Build COMPACT AI prompt
    const userPrompt = `TICKET: ${ticketSummary}

TRANSCRIPT:
${condensedTranscript}

RULES:
${finalRulesText}
${guardrailFindings.length > 0 ? '\nPRE-FLAGGED: ' + guardrailFindings.map(f => `${f.rule_title}`).join(', ') : ''}

Evaluate and return JSON.`;

    // Debug: Log prompt sizes
    console.log(`[Evaluation] Prompt sizes: system=${SYSTEM_PROMPT.length}, user=${userPrompt.length}, total=${SYSTEM_PROMPT.length + userPrompt.length}`);
    console.log(`[Evaluation] Transcript size: ${transcriptText.length}, Rules size: ${finalRulesText.length}`);

    // 8. Call AI with retry logic
    let aiResult = null;
    let lastError = null;
    let tokenUsage = null;
    const MAX_RETRIES = 2;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        // On retry, use even shorter prompt
        let currentPrompt = userPrompt;
        if (attempt > 0) {
          console.log(`[Evaluation] Retry attempt ${attempt} with shorter prompt`);
          const shorterTranscript = condensedTranscript.substring(0, 1000);
          const shorterRules = finalRulesText.substring(0, 2000);
          currentPrompt = `TICKET: ${ticketSummary}\n\nTRANSCRIPT:\n${shorterTranscript}\n\nRULES:\n${shorterRules}\n\nReturn JSON.`;
        }

        const aiResponse = await openai.chat.completions.create({
          model: EVALUATOR_MODEL,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: currentPrompt }
          ],
          max_completion_tokens: 3000
        });

        // Capture token usage from this attempt
        tokenUsage = aiResponse.usage || null;

        const aiContent = aiResponse.choices[0]?.message?.content;
        const aiFinishReason = aiResponse.choices[0]?.finish_reason;

        console.log(`[Evaluation] Attempt ${attempt}: finish_reason=${aiFinishReason}, content_length=${aiContent?.length || 0}, tokens=${tokenUsage?.total_tokens || 0}`);

        if (!aiContent || aiContent.trim() === '') {
          lastError = `Empty response (finish_reason=${aiFinishReason})`;
          continue; // Try again
        }

        // Try to parse JSON
        let jsonContent = aiContent;
        const jsonMatch = aiContent.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) {
          jsonContent = jsonMatch[1].trim();
        }
        const jsonObjMatch = jsonContent.match(/\{[\s\S]*\}/);
        if (jsonObjMatch) {
          jsonContent = jsonObjMatch[0];
        }

        aiResult = JSON.parse(jsonContent);
        console.log(`[Evaluation] Successfully parsed AI response with ${aiResult.findings?.length || 0} findings`);
        break; // Success, exit retry loop

      } catch (error) {
        lastError = error.message;
        console.warn(`[Evaluation] Attempt ${attempt} failed: ${error.message}`);
      }
    }

    // If all retries failed, use defaults
    if (!aiResult) {
      console.warn(`[Evaluation] All attempts failed: ${lastError}, using defaults`);
      aiResult = {
        overall_status: 'needs_review',
        confidence: 0.5,
        category: classification.category,
        subcategory: classification.subcategory,
        findings: [{
          type: 'note',
          severity: 'low',
          rule_id: 'SYSTEM',
          rule_title: 'AI Evaluation Unavailable',
          explanation: `AI evaluation failed after ${MAX_RETRIES + 1} attempts. Manual review required.`,
          ticket_evidence: [],
          verification_needed: true,
          what_to_verify: 'Full manual review of ticket'
        }]
      };
    } else if (!aiResult.findings) {
      // Ensure findings array exists
      aiResult.findings = [];
    }

    // Default token usage if not captured
    if (!tokenUsage) {
      tokenUsage = { total_tokens: 0, prompt_tokens: 0, completion_tokens: 0 };
    }

    // 9. Merge guardrail findings sa AI findings
    let allFindings = [...(aiResult.findings || [])];

    // Dodaj guardrail findings koji nisu već uključeni
    for (const gf of guardrailFindings) {
      const alreadyIncluded = allFindings.some(f =>
        f.rule_id === gf.rule_id || f.explanation?.includes(gf.explanation?.substring(0, 50))
      );

      if (!alreadyIncluded) {
        allFindings.push(gf);
      }
    }

    // Sanitize findings to ensure valid enum values (speaker, type, severity)
    allFindings = sanitizeFindings(allFindings);

    // 10. Odredi overall_status
    let overallStatus = aiResult.overall_status || 'pass';

    // Override ako ima critical/high violations
    const hasCritical = allFindings.some(f => f.type === 'violation' && f.severity === 'critical');
    const hasHigh = allFindings.some(f => f.type === 'violation' && f.severity === 'high');
    const hasPotential = allFindings.some(f => f.type === 'potential_violation');

    if (hasCritical || (hasHigh && allFindings.filter(f => f.type === 'violation').length > 1)) {
      overallStatus = 'fail';
    } else if (hasPotential && !hasCritical && !hasHigh) {
      overallStatus = 'needs_review';
    }

    // 11. Kreiraj TicketEvaluation
    const evaluation = await TicketEvaluation.create({
      ticket_id: ticketId,
      conversation: conversationId,
      scrapeSession: scrapeSessionId,
      agent: agentId,
      agent_name: agentName,
      category: aiResult.category || classification.category,
      subcategory: aiResult.subcategory || classification.subcategory,
      risk_level: classification.risk_level,
      overall_status: overallStatus,
      confidence: aiResult.confidence || 0.7,
      findings: allFindings,
      ticket_facts: ticketFacts,
      agent_actions: agentActions,
      retrieved_rules: chunksWithRules.map(c => ({
        rule_id: c.rule_id,
        title: c.rule?.title || 'Unknown',
        similarity: c.similarity,
        source: c.source
      })),
      guardrail_findings: guardrailFindings.map(gf => ({
        type: gf.type,
        rule_triggered: gf.rule_id,
        description: gf.explanation
      })),
      model_used: EVALUATOR_MODEL,
      token_usage: {
        prompt_tokens: tokenUsage?.prompt_tokens || 0,
        completion_tokens: tokenUsage?.completion_tokens || 0,
        total_tokens: tokenUsage?.total_tokens || 0,
        estimated_cost: calculateCost(tokenUsage)
      },
      evaluation_started_at: new Date(startTime),
      evaluation_completed_at: new Date(),
      evaluation_duration_ms: Date.now() - startTime,
      created_by: createdBy
    });

    return evaluation;

  } catch (error) {
    console.error('Error evaluating ticket:', error);
    throw error;
  }
}

/**
 * Izračunaj procenjeni cost
 * @param {Object} usage - Token usage
 * @returns {number} - Cost u USD
 */
function calculateCost(usage) {
  if (!usage) return 0;

  // gpt-5-mini pricing (estimated):
  // Input: $0.15/1M tokens = $0.00000015 per token
  // Cached input: $0.015/1M tokens = $0.000000015 per token
  // Output: $1.20/1M tokens = $0.0000012 per token

  const promptTokens = usage.prompt_tokens || 0;
  const cachedTokens = usage.cached_tokens || 0;
  const completionTokens = usage.completion_tokens || 0;

  // Regular input tokens (not cached)
  const regularInputTokens = promptTokens - cachedTokens;

  const regularInputCost = regularInputTokens * 0.00000015;
  const cachedInputCost = cachedTokens * 0.000000015;
  const outputCost = completionTokens * 0.0000012;

  return regularInputCost + cachedInputCost + outputCost;
}

/**
 * Batch evaluacija više tiketa
 * @param {Object[]} tickets - Lista tiketa za evaluaciju
 * @param {Object} options - Opcije
 * @returns {Promise<Object>} - Rezultati
 */
async function evaluateTicketBatch(tickets, options = {}) {
  const { concurrency = 3, onProgress = null } = options;

  const results = {
    total: tickets.length,
    completed: 0,
    failed: 0,
    evaluations: [],
    errors: []
  };

  // Process in batches
  for (let i = 0; i < tickets.length; i += concurrency) {
    const batch = tickets.slice(i, i + concurrency);

    const batchPromises = batch.map(async (ticket) => {
      try {
        const evaluation = await evaluateTicket(ticket);
        results.completed++;
        results.evaluations.push(evaluation);

        if (onProgress) {
          onProgress({
            completed: results.completed,
            total: results.total,
            current: ticket.ticketId
          });
        }

        return { success: true, evaluation };
      } catch (error) {
        results.failed++;
        results.errors.push({
          ticketId: ticket.ticketId,
          error: error.message
        });
        return { success: false, error: error.message };
      }
    });

    await Promise.all(batchPromises);
  }

  return results;
}

/**
 * Re-evaluacija sa dodatnim kontekstom
 * @param {string} evaluationId - ID postojeće evaluacije
 * @param {Object} additionalContext - Dodatni kontekst
 * @returns {Promise<Object>} - Nova evaluacija
 */
async function reEvaluateWithContext(evaluationId, additionalContext) {
  const existing = await TicketEvaluation.findById(evaluationId);
  if (!existing) {
    throw new Error('Evaluation not found');
  }

  // Merge dodatni kontekst
  const updatedFacts = {
    ...existing.ticket_facts?.toObject(),
    ...additionalContext.ticketFacts
  };

  const updatedActions = {
    ...existing.agent_actions?.toObject(),
    ...additionalContext.agentActions
  };

  // Re-run evaluation
  // Napomena: transcript bi trebalo ponovo učitati iz ScrapedConversation
  throw new Error('Re-evaluation requires original transcript - implement transcript fetch');
}

module.exports = {
  evaluateTicket,
  evaluateTicketBatch,
  classifyTicket,
  generateTicketSummary,
  reEvaluateWithContext,
  calculateCost,
  EVALUATOR_MODEL
};
