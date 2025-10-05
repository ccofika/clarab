const mongoose = require('mongoose');
const User = require('../models/User');
require('dotenv').config();

const users = [
  {
    name: 'Admin User',
    email: 'admin@mebit.io',
    password: 'admin123',
    role: 'admin'
  },
  {
    name: 'John Doe',
    email: 'john@mebit.io',
    password: 'john123',
    role: 'user'
  },
  {
    name: 'Jane Smith',
    email: 'jane@mebit.io',
    password: 'jane123',
    role: 'user'
  }
];

const seedUsers = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Check if users already exist
    for (const userData of users) {
      const existingUser = await User.findOne({ email: userData.email });

      if (existingUser) {
        console.log(`User ${userData.email} already exists. Skipping...`);
        continue;
      }

      const user = await User.create(userData);
      console.log(`✓ Created ${user.role}: ${user.name} (${user.email})`);
    }

    console.log('\n=== Seed Complete ===');
    console.log('\nLogin Credentials:');
    console.log('\nADMIN:');
    console.log('  Email: admin@mebit.io');
    console.log('  Password: admin123');
    console.log('\nUSER 1:');
    console.log('  Email: john@mebit.io');
    console.log('  Password: john123');
    console.log('\nUSER 2:');
    console.log('  Email: jane@mebit.io');
    console.log('  Password: jane123');

    process.exit(0);
  } catch (error) {
    console.error('Error seeding users:', error);
    process.exit(1);
  }
};

seedUsers();
