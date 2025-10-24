const mongoose = require('mongoose');
require('dotenv').config(); // Load environment variables

// SECURITY: Use MongoDB URI from environment variables
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not found in environment variables');
  process.exit(1);
}

// Connect to MongoDB
async function cleanupLegacyMessages() {
  try {
    console.log('🔌 Connecting to MongoDB...');

    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });

    console.log('✅ Connected to MongoDB');

    // Get the KYCMessage model
    const KYCMessage = mongoose.connection.collection('kycmessages');

    // Find all messages without username field
    console.log('🔍 Finding legacy messages without username...');

    const legacyMessages = await KYCMessage.find({
      username: { $exists: false }
    }).toArray();

    console.log(`📊 Found ${legacyMessages.length} legacy messages without username:`);

    // Display info about messages to be deleted
    legacyMessages.forEach((msg, index) => {
      console.log(`  ${index + 1}. ID: ${msg._id}, Status: ${msg.status}, Sent: ${msg.sentAt}`);
    });

    if (legacyMessages.length === 0) {
      console.log('✅ No legacy messages found. Database is clean!');
      await mongoose.disconnect();
      return;
    }

    // Delete them
    console.log('\n🗑️  Deleting legacy messages...');

    const result = await KYCMessage.deleteMany({
      username: { $exists: false }
    });

    console.log(`✅ Successfully deleted ${result.deletedCount} legacy messages`);

    // Verify deletion
    const remainingLegacy = await KYCMessage.find({
      username: { $exists: false }
    }).toArray();

    if (remainingLegacy.length === 0) {
      console.log('✅ Verification: All legacy messages have been removed!');
    } else {
      console.warn(`⚠️  Warning: ${remainingLegacy.length} legacy messages still remain`);
    }

    // Disconnect
    console.log('\n🔌 Disconnecting from MongoDB...');
    await mongoose.disconnect();
    console.log('✅ Disconnected. Cleanup complete!');

  } catch (error) {
    console.error('❌ Error during cleanup:', error);
    process.exit(1);
  }
}

// Run the cleanup
cleanupLegacyMessages();
