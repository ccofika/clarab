/**
 * Script to sync all Rules to RuleChunks with embeddings
 * Run with: node scripts/syncEmbeddings.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Rule = require('../models/Rule');
const RuleChunk = require('../models/RuleChunk');
const embeddingsService = require('../services/embeddingsService');

async function syncEmbeddings() {
  try {
    console.log('🔗 Connecting to database...');
    await connectDB();

    // Check current status
    const rulesCount = await Rule.countDocuments({ isActive: true });
    const chunksCount = await RuleChunk.countDocuments({ isActive: true });

    console.log('\n📊 Current Status:');
    console.log(`   Rules: ${rulesCount}`);
    console.log(`   Chunks: ${chunksCount}`);

    if (rulesCount === 0) {
      console.log('\n❌ No rules found! Please seed rules first.');
      process.exit(1);
    }

    // Option 1: Use syncAllChunks (incremental)
    console.log('\n🔄 Starting embeddings sync...');
    console.log('   Model:', embeddingsService.EMBEDDING_MODEL);
    console.log('   Dimensions:', embeddingsService.EMBEDDING_DIMENSIONS);

    const stats = await embeddingsService.syncAllChunks();

    console.log('\n✅ Sync completed!');
    console.log('   Created:', stats.created);
    console.log('   Updated:', stats.updated);
    console.log('   Deleted:', stats.deleted);
    if (stats.errors.length > 0) {
      console.log('   Errors:', stats.errors.length);
      stats.errors.forEach(e => console.log(`     - ${e.rule_id}: ${e.error}`));
    }

    // Verify
    const finalChunksCount = await RuleChunk.countDocuments({ isActive: true });
    const chunksWithEmbeddings = await RuleChunk.countDocuments({
      isActive: true,
      embedding: { $exists: true, $not: { $size: 0 } }
    });

    console.log('\n📊 Final Status:');
    console.log(`   Chunks total: ${finalChunksCount}`);
    console.log(`   Chunks with embeddings: ${chunksWithEmbeddings}`);

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
}

syncEmbeddings();
