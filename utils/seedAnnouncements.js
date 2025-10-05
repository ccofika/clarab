const Workspace = require('../models/Workspace');
const Canvas = require('../models/Canvas');

const seedAnnouncementsWorkspace = async () => {
  try {
    // Check if announcements workspace already exists
    const existingAnnouncements = await Workspace.findOne({ type: 'announcements' });

    if (existingAnnouncements) {
      console.log('✅ Announcements workspace already exists');
      return existingAnnouncements;
    }

    // Create announcements workspace
    const announcementsWorkspace = await Workspace.create({
      name: 'Announcements',
      type: 'announcements',
      isPublic: true,
      settings: {
        backgroundColor: '#f8fafc',
        gridEnabled: true,
        snapToGrid: false
      }
    });

    // Create canvas for announcements workspace
    await Canvas.create({
      workspace: announcementsWorkspace._id,
      dimensions: {
        width: 5000,
        height: 5000
      }
    });

    console.log('✅ Announcements workspace created successfully');
    return announcementsWorkspace;
  } catch (error) {
    console.error('❌ Error creating announcements workspace:', error);
    throw error;
  }
};

module.exports = seedAnnouncementsWorkspace;
