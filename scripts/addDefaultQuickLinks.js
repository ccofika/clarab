require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const { createDefaultQuickLinks } = require('../utils/createDefaultQuickLinks');

const addDefaultQuickLinks = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Get all users
    const users = await User.find({});
    console.log(`📊 Found ${users.length} users`);

    let successCount = 0;
    let skippedCount = 0;

    // Add default quick links for each user
    for (const user of users) {
      try {
        await createDefaultQuickLinks(user._id);
        successCount++;
      } catch (error) {
        if (error.code === 11000) {
          // Duplicate key error - user already has these categories
          console.log(`⏭️  User ${user.email} already has default categories, skipping...`);
          skippedCount++;
        } else {
          console.error(`❌ Error for user ${user.email}:`, error.message);
        }
      }
    }

    console.log('\n📊 Summary:');
    console.log(`   ✅ Successfully added: ${successCount}`);
    console.log(`   ⏭️  Skipped (already exists): ${skippedCount}`);
    console.log(`   ❌ Failed: ${users.length - successCount - skippedCount}`);

    // Disconnect
    await mongoose.disconnect();
    console.log('\n✅ Done! Disconnected from MongoDB');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
};

addDefaultQuickLinks();
