const mongoose = require('mongoose');
require('dotenv').config(); // Load environment variables

// SECURITY: Use MongoDB URI from environment variables
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not found in environment variables');
  process.exit(1);
}

/**
 * Drop the unique index on slackThreadTs field
 * This allows multiple messages to exist in the same Slack thread
 */
async function dropUniqueIndex() {
  try {
    console.log('🔌 Connecting to MongoDB...');

    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });

    console.log('✅ Connected to MongoDB');

    // Get the KYCMessage collection
    const collection = mongoose.connection.collection('kycmessages');

    // List all indexes
    console.log('\n📊 Current indexes on kycmessages collection:');
    const indexes = await collection.indexes();
    indexes.forEach((idx, i) => {
      console.log(`  ${i + 1}. ${idx.name}:`, JSON.stringify(idx.key), idx.unique ? '(UNIQUE)' : '');
    });

    // Check if unique index exists
    const uniqueIndex = indexes.find(idx =>
      idx.key.slackThreadTs === 1 && idx.unique === true
    );

    if (uniqueIndex) {
      console.log('\n⚠️  Found unique index on slackThreadTs:', uniqueIndex.name);
      console.log('🗑️  Dropping unique index...');

      await collection.dropIndex(uniqueIndex.name);

      console.log('✅ Unique index dropped successfully!');
    } else {
      console.log('\n✅ No unique index found on slackThreadTs. Index already correct!');
    }

    // Verify final state
    console.log('\n📊 Final indexes after cleanup:');
    const finalIndexes = await collection.indexes();
    finalIndexes.forEach((idx, i) => {
      console.log(`  ${i + 1}. ${idx.name}:`, JSON.stringify(idx.key), idx.unique ? '(UNIQUE)' : '');
    });

    // Disconnect
    console.log('\n🔌 Disconnecting from MongoDB...');
    await mongoose.disconnect();
    console.log('✅ Disconnected. Index cleanup complete!');

  } catch (error) {
    console.error('❌ Error during index cleanup:', error);
    process.exit(1);
  }
}

// Run the script
dropUniqueIndex();
