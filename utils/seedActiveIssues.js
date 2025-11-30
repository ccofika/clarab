const Workspace = require('../models/Workspace');

const seedActiveIssuesWorkspace = async () => {
  try {
    // Check if active-issues workspace already exists
    const existingActiveIssues = await Workspace.findOne({ type: 'active-issues' });

    if (existingActiveIssues) {
      console.log('✅ Active Issues workspace already exists');
      return existingActiveIssues;
    }

    // Create active-issues workspace
    // Note: This workspace doesn't use Canvas - it has its own custom UI
    const activeIssuesWorkspace = await Workspace.create({
      name: 'Active Issues',
      type: 'active-issues',
      isPublic: true,
      settings: {
        backgroundColor: '#0a0a0a',
        gridEnabled: false,
        snapToGrid: false
      }
    });

    console.log('✅ Active Issues workspace created successfully');
    return activeIssuesWorkspace;
  } catch (error) {
    console.error('❌ Error creating Active Issues workspace:', error);
    throw error;
  }
};

module.exports = seedActiveIssuesWorkspace;
