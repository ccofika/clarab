/**
 * Migration script to move existing Selected tickets with score < 85% to Draft status
 * This is a one-time migration for the Review feature implementation
 *
 * What it does:
 * - Finds all tickets with status 'Selected', score < 85%, and not archived
 * - Sets their status to 'Draft'
 * - Sets originalReviewScore to current qualityScorePercent
 * - Sets firstReviewDate to current date
 * - Adds entry to reviewHistory
 *
 * Run with: node scripts/migrateSelectedToDraft.js
 *
 * Add --dry-run flag to see what would be changed without making changes:
 *   node scripts/migrateSelectedToDraft.js --dry-run
 */

require('dotenv').config();
const mongoose = require('mongoose');

const isDryRun = process.argv.includes('--dry-run');

const run = async () => {
  try {
    console.log('='.repeat(60));
    console.log('Migration: Selected tickets with score < 85% → Draft');
    console.log('='.repeat(60));

    if (isDryRun) {
      console.log('\n⚠️  DRY RUN MODE - No changes will be made\n');
    }

    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected!\n');

    const db = mongoose.connection.db;
    const collection = db.collection('tickets');

    // Find tickets that need migration
    const query = {
      status: 'Selected',
      qualityScorePercent: { $lt: 85, $ne: null },
      isArchived: { $ne: true }
    };

    const ticketsToMigrate = await collection.find(query).toArray();

    console.log(`Found ${ticketsToMigrate.length} tickets to migrate:\n`);

    if (ticketsToMigrate.length === 0) {
      console.log('No tickets need migration. Exiting.');
      await mongoose.disconnect();
      process.exit(0);
    }

    // Show summary of tickets
    console.log('Tickets to migrate:');
    console.log('-'.repeat(80));
    console.log('Ticket ID'.padEnd(20) + 'Score'.padEnd(10) + 'Agent'.padEnd(30) + 'Created By');
    console.log('-'.repeat(80));

    for (const ticket of ticketsToMigrate) {
      const ticketId = (ticket.ticketId || 'N/A').toString().padEnd(20);
      const score = (ticket.qualityScorePercent?.toFixed(1) + '%').padEnd(10);
      const agent = (ticket.agentName || 'N/A').substring(0, 28).padEnd(30);
      const createdBy = ticket.createdByEmail || 'N/A';
      console.log(`${ticketId}${score}${agent}${createdBy}`);
    }
    console.log('-'.repeat(80));
    console.log(`Total: ${ticketsToMigrate.length} tickets\n`);

    if (isDryRun) {
      console.log('DRY RUN complete. Run without --dry-run to apply changes.');
      await mongoose.disconnect();
      process.exit(0);
    }

    // Perform migration
    console.log('Starting migration...\n');

    const now = new Date();
    let successCount = 0;
    let errorCount = 0;

    for (const ticket of ticketsToMigrate) {
      try {
        await collection.updateOne(
          { _id: ticket._id },
          {
            $set: {
              status: 'Draft',
              originalReviewScore: ticket.qualityScorePercent,
              firstReviewDate: now
            },
            $push: {
              reviewHistory: {
                action: 'sent_to_review',
                date: now,
                scoreAtAction: ticket.qualityScorePercent,
                note: 'Migrated from Selected to Draft (score < 85%)'
              }
            }
          }
        );
        successCount++;
        console.log(`✓ Migrated ticket ${ticket.ticketId} (${ticket.qualityScorePercent}%)`);
      } catch (err) {
        errorCount++;
        console.error(`✗ Failed to migrate ticket ${ticket.ticketId}: ${err.message}`);
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('Migration Summary');
    console.log('='.repeat(60));
    console.log(`Successfully migrated: ${successCount}`);
    console.log(`Failed: ${errorCount}`);
    console.log('='.repeat(60));

    await mongoose.disconnect();
    console.log('\nDone!');
    process.exit(errorCount > 0 ? 1 : 0);

  } catch (error) {
    console.error('Migration error:', error);
    process.exit(1);
  }
};

run();
