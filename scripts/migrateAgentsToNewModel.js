const mongoose = require('mongoose');
require('dotenv').config();

const Agent = require('../models/Agent');

// Migration script to add activeForUsers field to existing agents
const migrateAgents = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Find all agents that don't have activeForUsers field
    const agents = await Agent.find({});

    console.log(`Found ${agents.length} agents to migrate`);

    for (const agent of agents) {
      if (!agent.activeForUsers || agent.activeForUsers.length === 0) {
        // Set activeForUsers to contain only the createdBy user
        agent.activeForUsers = [agent.createdBy];
        await agent.save();
        console.log(`Migrated agent: ${agent.name} - added createdBy user to activeForUsers`);
      }
    }

    console.log('Migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
};

migrateAgents();
