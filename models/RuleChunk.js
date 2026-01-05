const mongoose = require('mongoose');

/**
 * RuleChunk Schema - Embedding chunks za vector search
 * Svaki chunk je deo Rule objekta optimizovan za retrieval
 */

const ruleChunkSchema = new mongoose.Schema({
  // Identifikacija
  chunk_id: {
    type: String,
    required: true,
    unique: true,
    index: true
  },

  // Referenca na originalni Rule
  rule: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Rule',
    required: true,
    index: true
  },
  rule_id: {
    type: String,
    required: true,
    index: true
  },

  // Embedding input (tekst koji je embedovan)
  embedding_input: {
    type: String,
    required: true
  },

  // Vector embedding (generisan od gpt-5-nano)
  embedding: {
    type: [Number],
    required: true,
    index: '2dsphere'  // Za vector similarity search
  },

  // Embedding metadata
  embedding_model: {
    type: String,
    default: 'gpt-5-nano'
  },
  embedding_dimensions: {
    type: Number,
    default: 1536
  },

  // Metadata za filtering
  metadata: {
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'QACategory'
    },
    category_name: String,
    subcategory: String,
    tags: [String],
    severity: {
      type: String,
      enum: ['critical', 'high', 'medium', 'low']
    },
    source_location: {
      source_name: String,
      page: Number,
      section: String
    }
  },

  // Token count za budžetiranje
  token_count: {
    type: Number,
    default: 0
  },

  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Indexes za efikasan retrieval
ruleChunkSchema.index({ 'metadata.category': 1 });
ruleChunkSchema.index({ 'metadata.tags': 1 });
ruleChunkSchema.index({ 'metadata.severity': 1 });
ruleChunkSchema.index({ isActive: 1 });

// Compound index za filtering + vector search
ruleChunkSchema.index({
  isActive: 1,
  'metadata.category': 1,
  'metadata.tags': 1
});

// Static: Nađi chunks po tagovima
ruleChunkSchema.statics.findByTags = function(tags, limit = 10) {
  return this.find({
    'metadata.tags': { $in: tags },
    isActive: true
  })
  .limit(limit)
  .select('chunk_id rule_id embedding_input metadata token_count');
};

// Static: Nađi chunks po kategoriji
ruleChunkSchema.statics.findByCategory = function(categoryId, limit = 20) {
  return this.find({
    'metadata.category': categoryId,
    isActive: true
  })
  .limit(limit)
  .select('chunk_id rule_id embedding_input metadata token_count');
};

// Static: Cosine similarity search (za MongoDB bez Atlas Vector Search)
// Ovo je fallback - idealno koristiti Atlas Vector Search ili Pinecone
ruleChunkSchema.statics.cosineSimilarity = function(vec1, vec2) {
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
};

// Static: Semantic search sa filterima
ruleChunkSchema.statics.semanticSearch = async function(queryEmbedding, options = {}) {
  const {
    limit = 10,
    categoryId = null,
    tags = [],
    minSeverity = null,
    excludeRuleIds = []
  } = options;

  // Build filter query
  const filter = { isActive: true };

  if (categoryId) {
    filter['metadata.category'] = categoryId;
  }

  if (tags.length > 0) {
    filter['metadata.tags'] = { $in: tags };
  }

  if (excludeRuleIds.length > 0) {
    filter.rule_id = { $nin: excludeRuleIds };
  }

  // Fetch all matching chunks (ovo je brute force - za produkciju koristiti Atlas Vector Search)
  const chunks = await this.find(filter)
    .select('chunk_id rule_id embedding_input embedding metadata token_count')
    .lean();

  // Calculate similarities
  const results = chunks.map(chunk => ({
    ...chunk,
    similarity: this.cosineSimilarity(queryEmbedding, chunk.embedding)
  }));

  // Sort by similarity and limit
  results.sort((a, b) => b.similarity - a.similarity);

  return results.slice(0, limit);
};

// Static: Hybrid search (semantic + tag mandatory)
ruleChunkSchema.statics.hybridSearch = async function(queryEmbedding, mandatoryTags, options = {}) {
  const { semanticLimit = 8, tagLimit = 10, totalLimit = 15 } = options;

  // 1. Semantic search
  const semanticResults = await this.semanticSearch(queryEmbedding, {
    ...options,
    limit: semanticLimit
  });

  // 2. Mandatory tag include
  const tagResults = await this.findByTags(mandatoryTags, tagLimit);

  // 3. Merge and deduplicate
  const seenRuleIds = new Set();
  const merged = [];

  // Add semantic results first (higher priority)
  for (const result of semanticResults) {
    if (!seenRuleIds.has(result.rule_id)) {
      seenRuleIds.add(result.rule_id);
      merged.push({ ...result, source: 'semantic' });
    }
  }

  // Add mandatory tag results
  for (const result of tagResults) {
    if (!seenRuleIds.has(result.rule_id)) {
      seenRuleIds.add(result.rule_id);
      merged.push({ ...result.toObject(), similarity: 0.5, source: 'mandatory_tag' });
    }
  }

  return merged.slice(0, totalLimit);
};

// Generiši chunk_id
ruleChunkSchema.statics.generateChunkId = function(ruleId) {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `${ruleId}_${timestamp}_${random}`;
};

module.exports = mongoose.model('RuleChunk', ruleChunkSchema);
