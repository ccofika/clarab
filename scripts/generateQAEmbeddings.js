/**
 * Migration Script: Generate AI Embeddings for Existing QA Tickets
 *
 * This script generates embeddings for all existing tickets in the database.
 * Run this once after deploying the new QA Manager features.
 *
 * Usage: node backend/scripts/generateQAEmbeddings.js
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const Ticket = require('../models/Ticket');
const Agent = require('../models/Agent');
const { generateEmbedding } = require('../utils/openai');

// Connect to MongoDB
const connectDB = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!mongoUri) {
      throw new Error('MongoDB URI not found in environment variables');
    }
    await mongoose.connect(mongoUri);
    console.log('✅ MongoDB Connected');
  } catch (error) {
    console.error('❌ MongoDB Connection Error:', error.message);
    process.exit(1);
  }
};

// Helper function to generate ticket embedding
const generateTicketEmbedding = async (ticket) => {
  try {
    const textParts = [];

    if (ticket.ticketId) textParts.push(`Ticket ID: ${ticket.ticketId}`);
    if (ticket.shortDescription) textParts.push(`Description: ${ticket.shortDescription}`);
    if (ticket.notes) textParts.push(`Notes: ${ticket.notes}`);
    if (ticket.feedback) textParts.push(`Feedback: ${ticket.feedback}`);
    if (ticket.category) textParts.push(`Category: ${ticket.category}`);
    if (ticket.priority) textParts.push(`Priority: ${ticket.priority}`);
    if (ticket.tags && ticket.tags.length > 0) textParts.push(`Tags: ${ticket.tags.join(', ')}`);
    if (ticket.status) textParts.push(`Status: ${ticket.status}`);

    // Get agent info if populated
    if (ticket.agent) {
      if (typeof ticket.agent === 'object' && ticket.agent.name) {
        textParts.push(`Agent: ${ticket.agent.name}`);
        if (ticket.agent.team) textParts.push(`Team: ${ticket.agent.team}`);
      }
    }

    const combinedText = textParts.join(' | ');

    if (!combinedText.trim()) {
      return null;
    }

    const embedding = await generateEmbedding(combinedText);
    return embedding;
  } catch (error) {
    console.error('Error generating ticket embedding:', error);
    return null;
  }
};

// Main migration function
const migrateTickets = async () => {
  console.log('\n🚀 Starting QA Ticket Embedding Migration...\n');

  try {
    // Get all tickets without embeddings or with outdated embeddings
    const tickets = await Ticket.find({
      $or: [
        { embedding: null },
        { embedding: { $exists: false } },
        { embeddingOutdated: true }
      ]
    }).populate('agent', 'name team position');

    console.log(`📊 Found ${tickets.length} ticket(s) needing embeddings\n`);

    if (tickets.length === 0) {
      console.log('✅ No tickets need embedding generation. All done!');
      return;
    }

    let processed = 0;
    let skipped = 0;
    let errors = 0;

    // Process in batches to avoid rate limits
    const batchSize = 20;
    const totalBatches = Math.ceil(tickets.length / batchSize);

    for (let i = 0; i < tickets.length; i += batchSize) {
      const batchNumber = Math.floor(i / batchSize) + 1;
      const batch = tickets.slice(i, i + batchSize);

      console.log(`📦 Processing Batch ${batchNumber}/${totalBatches} (${batch.length} tickets)...`);

      await Promise.all(
        batch.map(async (ticket) => {
          try {
            const embedding = await generateTicketEmbedding(ticket);

            if (embedding) {
              ticket.embedding = embedding;
              ticket.embeddingOutdated = false;
              await ticket.save();
              processed++;
              console.log(`  ✓ Generated embedding for ticket: ${ticket.ticketId || ticket._id}`);
            } else {
              skipped++;
              console.log(`  ⊘ Skipped ticket (no content): ${ticket.ticketId || ticket._id}`);
            }
          } catch (error) {
            errors++;
            console.error(`  ✗ Error processing ticket ${ticket.ticketId || ticket._id}:`, error.message);
          }
        })
      );

      // Delay between batches to respect OpenAI rate limits
      if (i + batchSize < tickets.length) {
        console.log('  ⏳ Waiting 1 second before next batch...\n');
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('📈 Migration Summary:');
    console.log('='.repeat(60));
    console.log(`Total Tickets:     ${tickets.length}`);
    console.log(`✅ Processed:      ${processed}`);
    console.log(`⊘ Skipped:         ${skipped}`);
    console.log(`✗ Errors:          ${errors}`);
    console.log('='.repeat(60));

    if (processed > 0) {
      console.log('\n✨ Migration completed successfully!');
      console.log('🔍 You can now use AI-powered semantic search for QA tickets.');
    } else {
      console.log('\n⚠️  No embeddings were generated. Check if tickets have content.');
    }

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    throw error;
  }
};

// Run migration
const run = async () => {
  try {
    await connectDB();
    await migrateTickets();
    console.log('\n👋 Closing database connection...');
    await mongoose.connection.close();
    console.log('✅ Done!\n');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  }
};

// Execute
run();
