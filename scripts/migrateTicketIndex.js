/**
 * Migration script to change ticketId unique index to compound index (ticketId + agent)
 * This allows the same ticketId to exist for different agents
 *
 * Run with: node scripts/migrateTicketIndex.js
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

    // List current indexes
    console.log('Current indexes:');
    const indexes = await collection.indexes();
    indexes.forEach(idx => {
      console.log(`  - ${idx.name}: ${JSON.stringify(idx.key)}${idx.unique ? ' (UNIQUE)' : ''}`);
    });
    console.log('');

    // Check if old ticketId_1 unique index exists
    const oldIndex = indexes.find(idx => idx.name === 'ticketId_1' && idx.unique);

    if (oldIndex) {
      console.log('Dropping old ticketId_1 unique index...');
      await collection.dropIndex('ticketId_1');
      console.log('Old index dropped!\n');
    } else {
      console.log('Old ticketId_1 unique index not found (already removed or never existed)\n');
    }

    // Check if compound index already exists
    const compoundIndex = indexes.find(idx =>
      idx.key && idx.key.ticketId === 1 && idx.key.agent === 1 && idx.unique
    );

    if (compoundIndex) {
      console.log('Compound index (ticketId + agent) already exists!\n');
    } else {
      console.log('Creating compound unique index (ticketId + agent)...');
      await collection.createIndex(
        { ticketId: 1, agent: 1 },
        { unique: true, name: 'ticketId_1_agent_1' }
      );
      console.log('Compound index created!\n');
    }

    // List final indexes
    console.log('Final indexes:');
    const finalIndexes = await collection.indexes();
    finalIndexes.forEach(idx => {
      console.log(`  - ${idx.name}: ${JSON.stringify(idx.key)}${idx.unique ? ' (UNIQUE)' : ''}`);
    });

    console.log('\nMigration complete!');

    await mongoose.disconnect();
    process.exit(0);

  } catch (error) {
    console.error('Migration error:', error);
    process.exit(1);
  }
};

run();
