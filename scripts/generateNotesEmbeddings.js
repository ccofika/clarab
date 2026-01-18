/**
 * Generate Combined Embeddings for Graded Tickets
 *
 * This script generates embeddings combining notes + feedback
 * for better similarity search in the "Similar Feedbacks" feature.
 *
 * The combined approach provides richer semantic context:
 * - Notes (usually in Serbian) describe the situation
 * - Feedback (in English) provides detailed explanation
 * - Together they create a more accurate semantic representation
 *
 * Run: node scripts/generateNotesEmbeddings.js
 * Run with --force to regenerate ALL embeddings (ignoring existing ones)
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Ticket = require('../models/Ticket');
const { generateEmbedding } = require('../utils/openai');

const mongoUri = process.env.MONGODB_URI;

// Check for --force flag to regenerate all embeddings
const forceRegenerate = process.argv.includes('--force');

// Strip HTML tags
const stripHtml = (html) => {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
};

// Create combined text from notes and feedback
const createCombinedText = (ticket) => {
  const notes = stripHtml(ticket.notes);
  const feedback = stripHtml(ticket.feedback);
  if (!notes || notes.length < 10) return null;
  return feedback ? `${notes} | ${feedback}` : notes;
};

async function connectDB() {
  try {
    await mongoose.connect(mongoUri);
    console.log('✅ MongoDB Connected\n');
  } catch (error) {
    console.error('❌ MongoDB Connection Error:', error.message);
    process.exit(1);
  }
}

async function generateCombinedEmbeddings() {
  await connectDB();

  console.log('=== GENERATING COMBINED (NOTES + FEEDBACK) EMBEDDINGS ===\n');
  console.log(`Mode: ${forceRegenerate ? 'FORCE REGENERATE ALL' : 'Only missing embeddings'}\n`);

  // Build query based on mode
  let query = {
    status: 'Graded',
    notes: { $exists: true, $ne: null, $ne: '' }
  };

  if (!forceRegenerate) {
    // Only tickets without embeddings
    query.$or = [
      { notesEmbedding: { $exists: false } },
      { notesEmbedding: null },
      { notesEmbedding: { $size: 0 } }
    ];
  }

  const totalCount = await Ticket.countDocuments(query);
  console.log(`Found ${totalCount} graded tickets to process\n`);

  if (totalCount === 0) {
    console.log('✅ No tickets need processing!');
    await mongoose.connection.close();
    return;
  }

  // Process in batches
  const batchSize = 20;
  let processed = 0;
  let errors = 0;
  let skipped = 0;

  const cursor = Ticket.find(query)
    .select('_id ticketId notes feedback')
    .cursor();

  let batch = [];

  for await (const ticket of cursor) {
    batch.push(ticket);

    if (batch.length >= batchSize) {
      // Process batch
      await Promise.all(
        batch.map(async (t) => {
          try {
            const combinedText = createCombinedText(t);

            if (!combinedText) {
              skipped++;
              return;
            }

            const notesEmbedding = await generateEmbedding(combinedText);

            if (notesEmbedding) {
              await Ticket.findByIdAndUpdate(t._id, {
                notesEmbedding: notesEmbedding
              });
              processed++;
            } else {
              skipped++;
            }
          } catch (error) {
            console.error(`Error processing ticket ${t.ticketId}:`, error.message);
            errors++;
          }
        })
      );

      console.log(`Progress: ${processed + skipped + errors}/${totalCount} (${processed} processed, ${skipped} skipped, ${errors} errors)`);

      // Clear batch and wait to respect rate limits
      batch = [];
      await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay between batches
    }
  }

  // Process remaining tickets in batch
  if (batch.length > 0) {
    await Promise.all(
      batch.map(async (t) => {
        try {
          const combinedText = createCombinedText(t);

          if (!combinedText) {
            skipped++;
            return;
          }

          const notesEmbedding = await generateEmbedding(combinedText);

          if (notesEmbedding) {
            await Ticket.findByIdAndUpdate(t._id, {
              notesEmbedding: notesEmbedding
            });
            processed++;
          } else {
            skipped++;
          }
        } catch (error) {
          console.error(`Error processing ticket ${t.ticketId}:`, error.message);
          errors++;
        }
      })
    );
  }

  console.log('\n=== SUMMARY ===');
  console.log(`Total: ${totalCount}`);
  console.log(`Processed: ${processed}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Errors: ${errors}`);

  // Verify
  const withEmbeddings = await Ticket.countDocuments({
    status: 'Graded',
    notesEmbedding: { $exists: true, $type: 'array' },
    $expr: { $gt: [{ $size: '$notesEmbedding' }, 0] }
  });
  const totalGraded = await Ticket.countDocuments({ status: 'Graded' });
  console.log(`\nGraded tickets with embeddings: ${withEmbeddings}/${totalGraded}`);

  await mongoose.connection.close();
  console.log('\n✅ Done');
}

generateCombinedEmbeddings().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
