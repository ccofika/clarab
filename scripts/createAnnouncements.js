const mongoose = require('mongoose');
const Workspace = require('../models/Workspace');
const Canvas = require('../models/Canvas');
const User = require('../models/User');
require('dotenv').config();

const createAnnouncementsWorkspace = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Check if Announcements workspace already exists
    const existingAnnouncements = await Workspace.findOne({ type: 'announcements' });

    if (existingAnnouncements) {
      console.log('Announcements workspace already exists!');
      console.log(`ID: ${existingAnnouncements._id}`);
      process.exit(0);
    }

    // Find admin user
    const admin = await User.findOne({ role: 'admin' });

    if (!admin) {
      console.error('No admin user found. Please run seedUsers.js first.');
      process.exit(1);
    }

    // Create Announcements workspace
    const announcementsWorkspace = await Workspace.create({
      name: 'Announcements',
      type: 'announcements',
      isPublic: true
    });

    console.log('✓ Created Announcements workspace');

    // Create associated canvas
    await Canvas.create({
      workspace: announcementsWorkspace._id,
      metadata: {
        lastEditedBy: admin._id
      }
    });

    console.log('✓ Created canvas for Announcements');

    console.log('\n=== Setup Complete ===');
    console.log(`Announcements Workspace ID: ${announcementsWorkspace._id}`);
    console.log('All users can view this workspace.');
    console.log('Only admins can edit content.');

    process.exit(0);
  } catch (error) {
    console.error('Error creating Announcements workspace:', error);
    process.exit(1);
  }
};

createAnnouncementsWorkspace();
