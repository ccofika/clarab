/**
 * Generate Notes-Only Embeddings for Graded Tickets
 *
 * This script generates separate embeddings for just the notes field
 * to enable better notes-to-notes similarity search for the
 * "Similar Feedbacks" feature.
 *
 * Run: node scripts/generateNotesEmbeddings.js
 *
 * Best Practice (from research):
 * - Store separate embeddings for search vs full content
 * - Notes-to-notes comparison is more accurate than notes-to-(notes+feedback)
 * - This is an "asymmetric search" optimization
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Ticket = require('../models/Ticket');
const Agent = require('../models/Agent');
const { generateEmbedding } = require('../utils/openai');

const mongoUri = process.env.MONGODB_URI;

// Strip HTML tags
const stripHtml = (html) => {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
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

async function generateNotesEmbeddings() {
  await connectDB();

  console.log('=== GENERATING NOTES-ONLY EMBEDDINGS ===\n');

  // Find all graded tickets with notes that don't have notesEmbedding yet
  const query = {
    status: 'Graded',
    notes: { $exists: true, $ne: null, $ne: '' },
    $or: [
      { notesEmbedding: { $exists: false } },
      { notesEmbedding: null },
      { notesEmbedding: { $size: 0 } }
    ]
  };

  const totalCount = await Ticket.countDocuments(query);
  console.log(`Found ${totalCount} graded tickets needing notes embeddings\n`);

  if (totalCount === 0) {
    console.log('✅ All tickets already have notes embeddings!');
    await mongoose.connection.close();
    return;
  }

  // Process in batches
  const batchSize = 10;
  let processed = 0;
  let errors = 0;
  let skipped = 0;

  const cursor = Ticket.find(query)
    .select('_id ticketId notes')
    .cursor();

  let batch = [];

  for await (const ticket of cursor) {
    batch.push(ticket);

    if (batch.length >= batchSize) {
      // Process batch
      await Promise.all(
        batch.map(async (t) => {
          try {
            const cleanNotes = stripHtml(t.notes);

            if (!cleanNotes || cleanNotes.length < 5) {
              skipped++;
              return;
            }

            const notesEmbedding = await generateEmbedding(cleanNotes);

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
          const cleanNotes = stripHtml(t.notes);

          if (!cleanNotes || cleanNotes.length < 5) {
            skipped++;
            return;
          }

          const notesEmbedding = await generateEmbedding(cleanNotes);

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
  console.log(`\nGraded tickets with notes embeddings: ${withEmbeddings}`);

  await mongoose.connection.close();
  console.log('\n✅ Done');
}

generateNotesEmbeddings().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
