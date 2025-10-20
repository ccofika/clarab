require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const { createDefaultQuickLinks } = require('../utils/createDefaultQuickLinks');

const createMebitAccounts = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Define Mebit accounts
    const mebitAccounts = [
      {
        name: 'Milan Đorđević',
        email: 'milan@mebit.io',
        password: 'Mebit2024!Admin', // Strong default password - should be changed on first login
        role: 'admin'
      },
      {
        name: 'Andrija Trošić',
        email: 'andrijatrosic@mebit.io',
        password: 'Mebit2024!Dev', // Strong default password - should be changed on first login
        role: 'developer'
      }
    ];

    console.log('\n🚀 Creating Mebit accounts...\n');

    for (const accountData of mebitAccounts) {
      // Check if user already exists
      const existingUser = await User.findOne({ email: accountData.email });

      if (existingUser) {
        console.log(`⚠️  User ${accountData.email} already exists. Skipping...`);
        continue;
      }

      // Create user
      const user = await User.create({
        name: accountData.name,
        email: accountData.email,
        password: accountData.password,
        role: accountData.role,
        isFirstLogin: false // Set to false since we're providing initial password
      });

      // Create default quick links for the user
      await createDefaultQuickLinks(user._id);

      console.log(`✅ Created ${accountData.role} account for ${accountData.name} (${accountData.email})`);
      console.log(`   Default password: ${accountData.password}`);
      console.log(`   ⚠️  Please change the password on first login!\n`);
    }

    console.log('✨ Mebit accounts created successfully!\n');
    console.log('📋 Account Summary:');
    console.log('   1. milan@mebit.io - ADMIN role');
    console.log('   2. andrijatrosic@mebit.io - DEVELOPER role\n');
    console.log('🔒 IMPORTANT: Please change default passwords immediately!\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating Mebit accounts:', error.message);
    process.exit(1);
  }
};

// Run the script
createMebitAccounts();
