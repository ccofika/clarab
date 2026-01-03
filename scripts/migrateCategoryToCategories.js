/**
 * Migration script to copy category field values to categories array
 * This preserves old category data when migrating from single to multi-select
 *
 * Run with: node scripts/migrateCategoryToCategories.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

const run = async () => {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected!\n');

    const db = mongoose.connection.db;
    const collection = db.collection('tickets');

    // First, let's see what we're working with
    const totalTickets = await collection.countDocuments({});
    console.log(`Total tickets in database: ${totalTickets}`);

    // Find tickets that have a category field but empty/missing categories array
    const ticketsWithOldCategory = await collection.countDocuments({
      category: { $exists: true, $ne: null, $ne: '' }
    });
    console.log(`Tickets with old 'category' field: ${ticketsWithOldCategory}`);

    const ticketsWithNewCategories = await collection.countDocuments({
      categories: { $exists: true, $ne: [], $type: 'array' }
    });
    console.log(`Tickets with new 'categories' array: ${ticketsWithNewCategories}`);

    // Find tickets that need migration (have category but empty/no categories)
    const ticketsNeedingMigration = await collection.find({
      category: { $exists: true, $ne: null, $ne: '' },
      $or: [
        { categories: { $exists: false } },
        { categories: { $eq: [] } },
        { categories: { $eq: null } }
      ]
    }).toArray();

    console.log(`\nTickets needing migration: ${ticketsNeedingMigration.length}\n`);

    if (ticketsNeedingMigration.length === 0) {
      console.log('No tickets need migration!');
      await mongoose.disconnect();
      process.exit(0);
      return;
    }

    // Show sample of what we'll migrate
    console.log('Sample of tickets to migrate:');
    ticketsNeedingMigration.slice(0, 5).forEach(t => {
      console.log(`  - Ticket ${t.ticketId}: category="${t.category}" -> categories=["${t.category}"]`);
    });
    console.log('');

    // Perform the migration
    console.log('Migrating tickets...');

    let migratedCount = 0;
    let errorCount = 0;

    for (const ticket of ticketsNeedingMigration) {
      try {
        await collection.updateOne(
          { _id: ticket._id },
          { $set: { categories: [ticket.category] } }
        );
        migratedCount++;
      } catch (err) {
        console.error(`  Error migrating ticket ${ticket.ticketId}:`, err.message);
        errorCount++;
      }
    }

    console.log(`\nMigration complete!`);
    console.log(`  - Successfully migrated: ${migratedCount}`);
    console.log(`  - Errors: ${errorCount}`);

    // Verify migration
    const ticketsWithCategoriesAfter = await collection.countDocuments({
      categories: { $exists: true, $ne: [], $type: 'array' }
    });
    console.log(`\nTickets with 'categories' array after migration: ${ticketsWithCategoriesAfter}`);

    await mongoose.disconnect();
    process.exit(0);

  } catch (error) {
    console.error('Migration error:', error);
    process.exit(1);
  }
};

run();
