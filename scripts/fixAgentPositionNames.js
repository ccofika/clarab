/**
 * Script to fix agent position names
 * Changes "Scoreboard" to "Scorecard" in position field
 *
 * Run with: node scripts/fixAgentPositionNames.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Agent = require('../models/Agent');

const MONGODB_URI = process.env.MONGODB_URI;

async function fixAgentPositionNames() {
  try {
    // Connect to MongoDB
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    // Find all agents with "Scoreboard" in position
    const agentsToFix = await Agent.find({
      position: { $regex: /Scoreboard/i }
    });

    console.log(`Found ${agentsToFix.length} agents with "Scoreboard" in position:`);

    if (agentsToFix.length === 0) {
      console.log('No agents to fix. Exiting.');
      await mongoose.disconnect();
      return;
    }

    // Show what will be changed
    agentsToFix.forEach(agent => {
      const newPosition = agent.position.replace(/Scoreboard/gi, 'Scorecard');
      console.log(`  - "${agent.name}": "${agent.position}" -> "${newPosition}"`);
    });

    // Perform the update
    const result = await Agent.updateMany(
      { position: { $regex: /Scoreboard/i } },
      [
        {
          $set: {
            position: {
              $replaceAll: {
                input: "$position",
                find: "Scoreboard",
                replacement: "Scorecard"
              }
            }
          }
        }
      ]
    );

    console.log(`\nUpdated ${result.modifiedCount} agents successfully!`);

    // Verify the changes
    const verifyAgents = await Agent.find({
      position: { $regex: /Scorecard/i }
    }).select('name position');

    console.log('\nVerification - Agents with "Scorecard" position:');
    verifyAgents.forEach(agent => {
      console.log(`  - "${agent.name}": "${agent.position}"`);
    });

    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB. Done!');

  } catch (error) {
    console.error('Error:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

fixAgentPositionNames();
