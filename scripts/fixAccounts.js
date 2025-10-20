/**
 * Fix locked developer account and reset Milan's password
 * Run: node scripts/fixAccounts.js
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const User = require('../models/User');

console.log('🔍 Environment check:');
console.log('   MONGODB_URI exists:', !!process.env.MONGODB_URI);
console.log('   NODE_ENV:', process.env.NODE_ENV);

const DEVELOPER_ID = '68f61b5de45333b7d94cccd7'; // filipkozomara@mebit.io
const MILAN_ID = '68f61b5ce45333b7d94cccb5'; // m***@mebit.io
const NEW_PASSWORD = 'Mebit2025!Dev';

async function fixAccounts() {
  try {
    // Connect to MongoDB
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // 1. Unlock developer account
    console.log('\n📝 Unlocking developer account...');
    const developer = await User.findByIdAndUpdate(
      DEVELOPER_ID,
      {
        $set: { loginAttempts: 0 },
        $unset: { lockUntil: 1 }
      },
      { new: true }
    );

    if (developer) {
      console.log('✅ Developer account unlocked:', developer.email);
      console.log('   Login attempts reset to:', developer.loginAttempts);
    } else {
      console.error('❌ Developer account not found');
    }

    // 2. Reset Milan's password
    console.log('\n🔑 Resetting Milan\'s password...');
    const milan = await User.findById(MILAN_ID);

    if (milan) {
      console.log('📧 Found user:', milan.email);

      // Set new password (will be hashed by pre-save hook)
      milan.password = NEW_PASSWORD;
      await milan.save();

      // Reset login attempts too
      await User.findByIdAndUpdate(
        MILAN_ID,
        {
          $set: { loginAttempts: 0 },
          $unset: { lockUntil: 1 }
        }
      );

      console.log('✅ Password updated successfully');
      console.log('   New password:', NEW_PASSWORD);
      console.log('   Login attempts reset');
    } else {
      console.error('❌ Milan\'s account not found');
    }

    console.log('\n✅ All accounts fixed!');
    console.log('\nYou can now login with:');
    console.log('- Developer:', developer?.email, '(existing password)');
    console.log('- Milan:', milan?.email, '/', NEW_PASSWORD);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

fixAccounts();
