const OpenAI = require('openai');
const Rule = require('../models/Rule');
const RuleChunk = require('../models/RuleChunk');

/**
 * Embeddings Service - Generiše i upravlja vector embeddings
 * Koristi text-embedding-3-small model za embeddings
 */

// OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Model configuration
// text-embedding-3-small je ispravan model za embeddings (gpt-5-nano ne podržava embeddings)
const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 1536;  // Default za text-embedding-3-small

/**
 * Generiši embedding za tekst
 * @param {string} text - Tekst za embedding
 * @returns {Promise<number[]>} - Vector embedding
 */
async function generateEmbedding(text) {
  try {
    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: text,
      encoding_format: 'float'
    });

    return response.data[0].embedding;
  } catch (error) {
    console.error('Error generating embedding:', error);
    throw error;
  }
}

/**
 * Generiši embeddings za više tekstova (batch)
 * @param {string[]} texts - Niz tekstova
 * @returns {Promise<number[][]>} - Niz embeddings
 */
async function generateEmbeddingsBatch(texts) {
  try {
    // OpenAI podržava batch do 2048 tekstova
    const batchSize = 100;
    const allEmbeddings = [];

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);

      const response = await openai.embeddings.create({
        model: EMBEDDING_MODEL,
        input: batch,
        encoding_format: 'float'
      });

      const embeddings = response.data
        .sort((a, b) => a.index - b.index)
        .map(item => item.embedding);

      allEmbeddings.push(...embeddings);
    }

    return allEmbeddings;
  } catch (error) {
    console.error('Error generating batch embeddings:', error);
    throw error;
  }
}

/**
 * Kreiraj chunk za Rule i sačuvaj embedding
 * @param {Object} rule - Rule dokument
 * @returns {Promise<Object>} - Kreiran RuleChunk
 */
async function createRuleChunk(rule) {
  try {
    // Generiši embedding input
    const embeddingInput = rule.getEmbeddingInput();

    // Generiši embedding
    const embedding = await generateEmbedding(embeddingInput);

    // Proceni broj tokena (gruba procena: ~4 karaktera po tokenu)
    const tokenCount = Math.ceil(embeddingInput.length / 4);

    // Kreiraj chunk
    const chunk = await RuleChunk.create({
      chunk_id: RuleChunk.generateChunkId(rule.rule_id),
      rule: rule._id,
      rule_id: rule.rule_id,
      embedding_input: embeddingInput,
      embedding: embedding,
      embedding_model: EMBEDDING_MODEL,
      embedding_dimensions: EMBEDDING_DIMENSIONS,
      metadata: {
        category: rule.category,
        category_name: rule.category_name,
        subcategory: rule.subcategory,
        tags: rule.tags,
        severity: rule.severity_default,
        source_location: rule.source_location
      },
      token_count: tokenCount
    });

    return chunk;
  } catch (error) {
    console.error('Error creating rule chunk:', error);
    throw error;
  }
}

/**
 * Ažuriraj embedding za postojeći chunk
 * @param {string} chunkId - ID chunka
 * @returns {Promise<Object>} - Ažurirani chunk
 */
async function updateChunkEmbedding(chunkId) {
  try {
    const chunk = await RuleChunk.findOne({ chunk_id: chunkId });
    if (!chunk) {
      throw new Error(`Chunk not found: ${chunkId}`);
    }

    // Generiši novi embedding
    const embedding = await generateEmbedding(chunk.embedding_input);

    chunk.embedding = embedding;
    chunk.embedding_model = EMBEDDING_MODEL;
    await chunk.save();

    return chunk;
  } catch (error) {
    console.error('Error updating chunk embedding:', error);
    throw error;
  }
}

/**
 * Regeneriši sve embeddings za kategoriju
 * @param {string} categoryId - ID kategorije
 * @returns {Promise<Object>} - Statistika
 */
async function regenerateCategoryEmbeddings(categoryId) {
  try {
    const chunks = await RuleChunk.find({
      'metadata.category': categoryId,
      isActive: true
    });

    const texts = chunks.map(c => c.embedding_input);
    const embeddings = await generateEmbeddingsBatch(texts);

    let updated = 0;
    for (let i = 0; i < chunks.length; i++) {
      chunks[i].embedding = embeddings[i];
      chunks[i].embedding_model = EMBEDDING_MODEL;
      await chunks[i].save();
      updated++;
    }

    return { updated, total: chunks.length };
  } catch (error) {
    console.error('Error regenerating category embeddings:', error);
    throw error;
  }
}

/**
 * Sinhronizuj chunks sa Rules (dodaj nove, obriši stare)
 * @returns {Promise<Object>} - Statistika
 */
async function syncAllChunks() {
  try {
    const stats = {
      created: 0,
      updated: 0,
      deleted: 0,
      errors: []
    };

    // Nađi sve aktivne rules
    const rules = await Rule.find({ isActive: true });
    const existingChunks = await RuleChunk.find({ isActive: true });

    // Map postojećih chunks po rule_id
    const chunksByRuleId = new Map();
    existingChunks.forEach(c => chunksByRuleId.set(c.rule_id, c));

    // Kreiraj/ažuriraj chunks za svaki rule
    for (const rule of rules) {
      try {
        const existingChunk = chunksByRuleId.get(rule.rule_id);

        if (existingChunk) {
          // Proveri da li treba update
          const newInput = rule.getEmbeddingInput();
          if (existingChunk.embedding_input !== newInput) {
            existingChunk.embedding_input = newInput;
            existingChunk.embedding = await generateEmbedding(newInput);
            existingChunk.metadata = {
              category: rule.category,
              category_name: rule.category_name,
              subcategory: rule.subcategory,
              tags: rule.tags,
              severity: rule.severity_default,
              source_location: rule.source_location
            };
            existingChunk.token_count = Math.ceil(newInput.length / 4);
            await existingChunk.save();
            stats.updated++;
          }
          chunksByRuleId.delete(rule.rule_id);
        } else {
          // Kreiraj novi chunk
          await createRuleChunk(rule);
          stats.created++;
        }
      } catch (error) {
        stats.errors.push({ rule_id: rule.rule_id, error: error.message });
      }
    }

    // Obriši orphan chunks (rules koji više ne postoje)
    for (const [ruleId, chunk] of chunksByRuleId) {
      chunk.isActive = false;
      await chunk.save();
      stats.deleted++;
    }

    return stats;
  } catch (error) {
    console.error('Error syncing chunks:', error);
    throw error;
  }
}

/**
 * Generiši query embedding za ticket search
 * @param {Object} ticketData - Podaci o tiketu
 * @returns {Promise<number[]>} - Query embedding
 */
async function generateTicketQueryEmbedding(ticketData) {
  const {
    summary,
    entities = [],
    facts = {},
    agentActions = {}
  } = ticketData;

  // Kreiraj query tekst prema specifikaciji
  const parts = [];

  if (summary) {
    parts.push(summary);
  }

  if (entities.length > 0) {
    parts.push(`Key entities: ${entities.join(', ')}`);
  }

  // Dodaj relevantne facts
  const factsText = Object.entries(facts)
    .filter(([key, value]) => value && value !== 'unknown')
    .map(([key, value]) => `${key}: ${value}`)
    .join(', ');

  if (factsText) {
    parts.push(`Facts: ${factsText}`);
  }

  // Dodaj agent actions
  if (agentActions.macros_used?.length > 0) {
    parts.push(`Macros: ${agentActions.macros_used.join(', ')}`);
  }
  if (agentActions.links_sent?.length > 0) {
    parts.push(`Links sent: ${agentActions.links_sent.length}`);
  }

  const queryText = parts.join('\n');

  // Debug log
  console.log(`[Embedding] Query text (${queryText.length} chars): "${queryText.substring(0, 150)}..."`);

  if (!queryText || queryText.trim().length < 10) {
    console.warn('[Embedding] WARNING: Query text is very short or empty!');
  }

  return generateEmbedding(queryText);
}

/**
 * Izračunaj cosine similarity
 */
function cosineSimilarity(vec1, vec2) {
  if (!vec1 || !vec2 || vec1.length !== vec2.length) return 0;

  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;

  for (let i = 0; i < vec1.length; i++) {
    dotProduct += vec1[i] * vec2[i];
    norm1 += vec1[i] * vec1[i];
    norm2 += vec2[i] * vec2[i];
  }

  const magnitude = Math.sqrt(norm1) * Math.sqrt(norm2);
  return magnitude === 0 ? 0 : dotProduct / magnitude;
}

module.exports = {
  generateEmbedding,
  generateEmbeddingsBatch,
  createRuleChunk,
  updateChunkEmbedding,
  regenerateCategoryEmbeddings,
  syncAllChunks,
  generateTicketQueryEmbedding,
  cosineSimilarity,
  EMBEDDING_MODEL,
  EMBEDDING_DIMENSIONS
};
