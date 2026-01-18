/**
 * Seed Script: QA Assignments for Current Week
 *
 * This script creates assignments for agents so the extension uses flow 2
 * (existing assignments) instead of creating new ones.
 *
 * Run with: node seeds/seedQAAssignments.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const QAAssignment = require('../models/QAAssignment');
const Agent = require('../models/Agent');

// Agents that need assignments created
const AGENTS_TO_ASSIGN = [
  'Aleksandar Milosavljevic',
  'Aleksandra Jevtovic',
  'Bekir Lacin',
  'Danilo Karanovic',
  'Dimitrije Jovanovic',
  'Dusan Melentijevic',
  'Ivan Rankovic',
  'Jelena Stosic',
  'Marko Krsticic',
  'Mehmet Fazil Kulakoglu',
  'Michael Philips',
  'Stefan Minasevic',
  'Stefan Ristic',
  'Aleksa Stojkovic',
  'Dijana Stanojevic',
  'Elsayed Abdelkader',
  'Hari',
  'Luka Sitarica',
  'Milica Jovicic',
  'Nikola Anicic',
  'Nikola Kuneski',
  'Noman Emini',
  'Rabeb Hammami'
];

// Helper function to get current week ID
function getCurrentWeekId() {
  const now = new Date();
  const year = now.getFullYear();
  const startOfYear = new Date(year, 0, 1);
  const days = Math.floor((now - startOfYear) / (24 * 60 * 60 * 1000));
  const weekNumber = Math.ceil((days + startOfYear.getDay() + 1) / 7);
  return `${year}-W${String(weekNumber).padStart(2, '0')}`;
}

// Helper function to generate assignment name
function generateAssignmentName(agentName) {
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay()); // Sunday
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6); // Saturday

  const formatDate = (d) => `${d.getMonth() + 1}/${d.getDate()}`;
  return `${agentName} ${formatDate(startOfWeek)}-${formatDate(endOfWeek)}`;
}

async function seedQAAssignments() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/clara';
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    const weekId = getCurrentWeekId();
    console.log(`\nCreating assignments for week: ${weekId}`);
    console.log('='.repeat(60));

    let created = 0;
    let skipped = 0;
    let notFound = 0;

    for (const agentName of AGENTS_TO_ASSIGN) {
      // Find agent by name (case-insensitive)
      const agent = await Agent.findOne({
        name: { $regex: new RegExp(`^${agentName}$`, 'i') }
      });

      if (!agent) {
        console.log(`   [NOT FOUND] ${agentName}`);
        notFound++;
        continue;
      }

      // Check if assignment already exists for this week
      const existingAssignment = await QAAssignment.findOne({
        agentId: agent._id,
        weekId: weekId
      });

      if (existingAssignment) {
        console.log(`   [SKIPPED] ${agentName} - assignment already exists`);
        skipped++;
        continue;
      }

      // Create new assignment
      const assignmentName = generateAssignmentName(agent.maestroName || agent.name);

      const assignment = await QAAssignment.create({
        agentId: agent._id,
        assignmentName: assignmentName,
        weekId: weekId,
        status: 'created',
        ticketIds: [],
        gradedTicketIds: [],
        ticketObjectIds: []
      });

      console.log(`   [CREATED] ${agentName} -> "${assignmentName}"`);
      created++;
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('SEED COMPLETED');
    console.log('='.repeat(60));
    console.log(`Created: ${created}`);
    console.log(`Skipped (already exists): ${skipped}`);
    console.log(`Not found: ${notFound}`);

    // Disconnect
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');

  } catch (error) {
    console.error('Seed failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  seedQAAssignments();
}

module.exports = { seedQAAssignments, AGENTS_TO_ASSIGN };
