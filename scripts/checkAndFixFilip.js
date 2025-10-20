/**
 * Check and fix Filip's account role
 * Run: node scripts/checkAndFixFilip.js
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const User = require('../models/User');

const FILIP_EMAIL = 'filipkozomara@mebit.io';

async function checkAndFix() {
  try {
    // Connect to MongoDB
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Find Filip's account
    const filip = await User.findOne({ email: FILIP_EMAIL });

    if (!filip) {
      console.error('❌ Filip\'s account not found');
      process.exit(1);
    }

    console.log('\n📧 Found account:', filip.email);
    console.log('👤 Name:', filip.name);
    console.log('🎭 Current role:', filip.role);
    console.log('🔑 Has password:', !!filip.password);
    console.log('🔐 Has googleId:', !!filip.googleId);
    console.log('🚪 Is first login:', filip.isFirstLogin);

    // Check if needs role update
    if (filip.role !== 'developer' && filip.role !== 'admin') {
      console.log('\n⚠️  Role is not developer or admin, updating to developer...');
      filip.role = 'developer';
      await filip.save();
      console.log('✅ Role updated to developer');
    } else {
      console.log('\n✅ Role is already', filip.role);
    }

    // Check if Google user needs password
    if (filip.googleId && !filip.password) {
      console.log('\n💡 This is a Google OAuth user without password');
      console.log('   Change password will fail - this is expected');
    }

    console.log('\n✅ All checks complete!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkAndFix();
