const mongoose = require('mongoose');
require('dotenv').config();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/clara')
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

const Workspace = require('../models/Workspace');

async function migrateWorkspaceMembers() {
  try {
    console.log('Starting workspace members migration...');

    // Find all workspaces
    const workspaces = await Workspace.find({});

    console.log(`Found ${workspaces.length} workspaces to migrate`);

    let migratedCount = 0;
    let skippedCount = 0;

    for (const workspace of workspaces) {
      let needsUpdate = false;

      // Check if members need migration (old format: array of ObjectIds)
      if (workspace.members && workspace.members.length > 0) {
        const firstMember = workspace.members[0];

        // If the first member doesn't have a 'user' property, it's old format
        if (!firstMember.user) {
          console.log(`Migrating workspace: ${workspace.name} (${workspace._id})`);

          // Convert old members to new format
          workspace.members = workspace.members.map(memberId => ({
            user: memberId,
            permission: 'edit' // Default to edit permission
          }));

          needsUpdate = true;
        }
      }

      if (needsUpdate) {
        await workspace.save();
        migratedCount++;
        console.log(`  ✓ Migrated ${workspace.members.length} members`);
      } else {
        skippedCount++;
        console.log(`  - Skipped "${workspace.name}" (already migrated)`);
      }
    }

    console.log('\n=== Migration Complete ===');
    console.log(`Migrated: ${migratedCount} workspaces`);
    console.log(`Skipped: ${skippedCount} workspaces`);

  } catch (error) {
    console.error('Migration error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\nDatabase connection closed');
  }
}

migrateWorkspaceMembers();
