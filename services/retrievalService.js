const Rule = require('../models/Rule');
const RuleChunk = require('../models/RuleChunk');
const embeddingsService = require('./embeddingsService');

/**
 * Retrieval Service - Hibridni retrieval (semantic + tag-based mandatory include)
 * Prema specifikaciji: Section 6
 */

// Coverage guardrails - core procedure chunks po temama
const COVERAGE_GUARDRAILS = {
  login: ['auth_prerequisites', 'social_login_exceptions', 'password_reset_prerequisites'],
  password_reset: ['password_reset_prerequisites', 'auth_google', 'auth_apple', 'social_login'],
  withdrawal: ['withdrawal_procedures', 'kyc_requirements', 'payment_verification'],
  kyc: ['kyc_requirements', 'document_verification', 'identity_check'],
  deposit: ['deposit_procedures', 'payment_methods', 'bonus_terms'],
  self_exclusion: ['self_exclusion_rules', 'responsible_gambling', 'account_restrictions'],
  account_access: ['auth_prerequisites', 'account_recovery', 'security_verification']
};

// Mandatory tags based on TicketFacts
const FACT_TO_TAGS_MAP = {
  'account_auth_method:google': ['auth_google', 'social_login', 'no_password'],
  'account_auth_method:apple': ['auth_apple', 'social_login', 'no_password'],
  'account_auth_method:facebook': ['auth_facebook', 'social_login'],
  'has_password:false': ['no_password', 'social_login'],
  'account_restriction_state:self_excluded': ['self_exclusion', 'responsible_gambling'],
  'account_restriction_state:cooling_off': ['cooling_off', 'responsible_gambling'],
  'region_flags:ON': ['region_ON', 'ontario_regulations'],
  'kyc_state:pending': ['kyc_pending', 'document_verification'],
  'kyc_state:rejected': ['kyc_rejected', 'document_resubmission'],
  'withdrawal_state:pending': ['withdrawal_pending', 'payment_processing'],
  'withdrawal_state:reversed': ['withdrawal_reversed', 'reversal_procedures']
};

/**
 * Generiši mandatory tags iz TicketFacts
 * @param {Object} ticketFacts - TicketFacts objekat
 * @returns {string[]} - Lista mandatory tags
 */
function getMandatoryTagsFromFacts(ticketFacts) {
  const tags = new Set();

  for (const [factKey, factValue] of Object.entries(ticketFacts || {})) {
    if (!factValue || factValue === 'unknown') continue;

    const key = `${factKey}:${factValue}`;
    const mappedTags = FACT_TO_TAGS_MAP[key];

    if (mappedTags) {
      mappedTags.forEach(tag => tags.add(tag));
    }
  }

  return Array.from(tags);
}

/**
 * Generiši mandatory tags iz klasifikacije tiketa
 * @param {string} category - Kategorija tiketa
 * @param {string[]} entities - Ključni entiteti iz transkripta
 * @returns {string[]} - Lista mandatory tags
 */
function getMandatoryTagsFromCategory(category, entities = []) {
  const tags = new Set();

  // Coverage guardrails po kategoriji
  const categoryLower = (category || '').toLowerCase();
  for (const [key, coverageTags] of Object.entries(COVERAGE_GUARDRAILS)) {
    if (categoryLower.includes(key)) {
      coverageTags.forEach(tag => tags.add(tag));
    }
  }

  // Tagovi iz entiteta
  const entityKeywords = {
    'forgot password': ['password_reset', 'password_reset_prerequisites'],
    'reset password': ['password_reset', 'password_reset_prerequisites'],
    'cannot login': ['login_issues', 'auth_prerequisites'],
    'google': ['auth_google', 'social_login'],
    'apple': ['auth_apple', 'social_login'],
    'withdraw': ['withdrawal_procedures', 'payment_verification'],
    'deposit': ['deposit_procedures', 'payment_methods'],
    'kyc': ['kyc_requirements', 'document_verification'],
    'verification': ['identity_check', 'document_verification'],
    'self-exclu': ['self_exclusion', 'responsible_gambling'],
    'limit': ['betting_limits', 'responsible_gambling']
  };

  for (const entity of entities) {
    const entityLower = entity.toLowerCase();
    for (const [keyword, keywordTags] of Object.entries(entityKeywords)) {
      if (entityLower.includes(keyword)) {
        keywordTags.forEach(tag => tags.add(tag));
      }
    }
  }

  return Array.from(tags);
}

/**
 * Hybrid retrieval - kombinuje semantic search i mandatory tag include
 * @param {Object} params - Parametri pretrage
 * @returns {Promise<Object[]>} - Retrived chunks sa metadata
 */
async function hybridRetrieval(params) {
  const {
    ticketSummary,
    ticketEntities = [],
    ticketFacts = {},
    agentActions = {},
    category = null,
    categoryId = null,
    options = {}
  } = params;

  const {
    semanticLimit = 5,      // Reduced from 8 to save tokens
    mandatoryLimit = 5,     // Reduced from 10
    totalLimit = 8,         // Reduced from 15
    minSimilarity = 0.40    // Increased from 0.3 to filter weak matches
  } = options;

  // 1. Generiši query embedding
  const queryEmbedding = await embeddingsService.generateTicketQueryEmbedding({
    summary: ticketSummary,
    entities: ticketEntities,
    facts: ticketFacts,
    agentActions
  });

  // 2. Semantic retrieval
  const semanticResults = await RuleChunk.semanticSearch(queryEmbedding, {
    limit: semanticLimit,
    categoryId,
    minSeverity: null
  });

  // Filter po minSimilarity
  const filteredSemantic = semanticResults.filter(r => r.similarity >= minSimilarity);

  // 3. Mandatory tag include
  const factTags = getMandatoryTagsFromFacts(ticketFacts);
  const categoryTags = getMandatoryTagsFromCategory(category, ticketEntities);
  const allMandatoryTags = [...new Set([...factTags, ...categoryTags])];

  let mandatoryResults = [];
  if (allMandatoryTags.length > 0) {
    mandatoryResults = await RuleChunk.findByTags(allMandatoryTags, mandatoryLimit);
  }

  // 4. Merge and deduplicate
  const seenRuleIds = new Set();
  const merged = [];

  // Dodaj semantic results (veći prioritet)
  for (const result of filteredSemantic) {
    if (!seenRuleIds.has(result.rule_id)) {
      seenRuleIds.add(result.rule_id);
      merged.push({
        chunk_id: result.chunk_id,
        rule_id: result.rule_id,
        embedding_input: result.embedding_input,
        metadata: result.metadata,
        token_count: result.token_count,
        similarity: result.similarity,
        source: 'semantic'
      });
    }
  }

  // Dodaj mandatory tag results
  for (const result of mandatoryResults) {
    if (!seenRuleIds.has(result.rule_id)) {
      seenRuleIds.add(result.rule_id);
      merged.push({
        chunk_id: result.chunk_id,
        rule_id: result.rule_id,
        embedding_input: result.embedding_input,
        metadata: result.metadata,
        token_count: result.token_count,
        similarity: 0.5, // Default za mandatory
        source: 'mandatory_tag'
      });
    }
  }

  // 5. Sortiraj po relevantnosti (semantic first, then by severity)
  const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
  merged.sort((a, b) => {
    // Prvo po source (semantic > mandatory)
    if (a.source !== b.source) {
      return a.source === 'semantic' ? -1 : 1;
    }
    // Zatim po similarity
    if (a.similarity !== b.similarity) {
      return b.similarity - a.similarity;
    }
    // Na kraju po severity
    return (severityOrder[b.metadata?.severity] || 0) - (severityOrder[a.metadata?.severity] || 0);
  });

  // 6. Limit rezultata
  const finalResults = merged.slice(0, totalLimit);

  // 7. Izračunaj token budget
  const totalTokens = finalResults.reduce((sum, r) => sum + (r.token_count || 0), 0);

  return {
    chunks: finalResults,
    stats: {
      semantic_count: filteredSemantic.length,
      mandatory_count: mandatoryResults.length,
      final_count: finalResults.length,
      total_tokens: totalTokens,
      mandatory_tags_used: allMandatoryTags
    }
  };
}

/**
 * Fetch full Rule objects za retrieved chunks
 * @param {Object[]} chunks - Retrieved chunks
 * @returns {Promise<Object[]>} - Full Rule objekti
 */
async function fetchFullRules(chunks) {
  const ruleIds = chunks.map(c => c.rule_id);

  const rules = await Rule.find({
    rule_id: { $in: ruleIds },
    isActive: true
  }).lean();

  // Map po rule_id za brz lookup
  const ruleMap = new Map(rules.map(r => [r.rule_id, r]));

  // Vrati rules u istom redosledu kao chunks
  return chunks.map(chunk => ({
    ...chunk,
    rule: ruleMap.get(chunk.rule_id) || null
  }));
}

/**
 * Format ULTRA-THIN rules za AI prompt - maksimalno kompaktno (~100-200 tokena po pravilu)
 * @param {Object[]} chunksWithRules - Chunks sa full rule objektima
 * @returns {string} - Kompaktni tekst za prompt
 */
function formatThinRulesForPrompt(chunksWithRules) {
  return chunksWithRules
    .filter(c => c.rule)
    .map((c, index) => {
      const rule = c.rule;

      // Truncate rule_text to max 150 chars
      let ruleText = rule.rule_text || '';
      if (ruleText.length > 150) {
        ruleText = ruleText.substring(0, 150) + '...';
      }

      // Ultra-compact format
      let compact = `${index + 1}. ${rule.rule_id}: ${rule.title} [${rule.severity_default}]\n${ruleText}`;

      // Only add disallowed if present (most critical info)
      if (rule.disallowed_actions && rule.disallowed_actions.length > 0) {
        compact += `\nNO: ${rule.disallowed_actions.slice(0, 2).join(', ')}`;
      }

      return compact;
    })
    .join('\n\n');
}

/**
 * Format FULL rules za expanded retrieval (kad treba detalji za violation)
 * @param {Object[]} chunksWithRules - Chunks sa full rule objektima
 * @returns {string} - Formatirani tekst za prompt
 */
function formatRulesForPrompt(chunksWithRules) {
  return chunksWithRules
    .filter(c => c.rule)
    .map((c, index) => {
      const rule = c.rule;
      const parts = [
        `[RULE ${index + 1}]`,
        `ID: ${rule.rule_id}`,
        `Title: ${rule.title}`,
        `Severity: ${rule.severity_default}`,
        '',
        `Rule: ${rule.rule_text}`
      ];

      if (rule.steps && rule.steps.length > 0) {
        parts.push('');
        parts.push('Steps:');
        rule.steps.forEach(s => {
          parts.push(`  ${s.step_number}. ${s.action}`);
        });
      }

      if (rule.disallowed_actions && rule.disallowed_actions.length > 0) {
        parts.push('');
        parts.push(`Disallowed: ${rule.disallowed_actions.join(', ')}`);
      }

      parts.push('---');
      return parts.join('\n');
    })
    .join('\n\n');
}

/**
 * Quick retrieval za poznatu kategoriju (keširano)
 * @param {string} categoryId - ID kategorije
 * @param {number} limit - Maksimalan broj rezultata
 * @returns {Promise<Object[]>} - Rules za kategoriju
 */
async function retrieveByCategory(categoryId, limit = 20) {
  const chunks = await RuleChunk.findByCategory(categoryId, limit);
  return fetchFullRules(chunks);
}

/**
 * Retrieve po tagovima (za guardrails)
 * @param {string[]} tags - Lista tagova
 * @param {number} limit - Maksimalan broj rezultata
 * @returns {Promise<Object[]>} - Rules sa tim tagovima
 */
async function retrieveByTags(tags, limit = 10) {
  const chunks = await RuleChunk.findByTags(tags, limit);
  return fetchFullRules(chunks);
}

module.exports = {
  hybridRetrieval,
  fetchFullRules,
  formatRulesForPrompt,
  formatThinRulesForPrompt,
  retrieveByCategory,
  retrieveByTags,
  getMandatoryTagsFromFacts,
  getMandatoryTagsFromCategory,
  COVERAGE_GUARDRAILS,
  FACT_TO_TAGS_MAP
};
