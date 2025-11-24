/**
 * Script to import archived tickets from CSV for Filip Kozomara
 * Run with: node scripts/importArchivedTicketsFilip.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

// Models
const Agent = require('../models/Agent');
const Ticket = require('../models/Ticket');

// Config
const CSV_PATH = path.join(__dirname, '../../total_scores_filipkozomara.csv');
const FILIP_USER_ID = '68df7898fcb47c0f336adc8e';

// Stats
let stats = {
  totalRows: 0,
  skippedNoFeedback: 0,
  skippedDuplicate: 0,
  agentsCreated: 0,
  agentsExisting: 0,
  ticketsImported: 0,
  errors: 0
};

// Parse date from CSV format "2025-07-07 08:52:26.115000" -> Date
const parseDate = (dateStr) => {
  if (!dateStr) return new Date();
  // Remove quotes and extra characters, take only date part
  const cleaned = dateStr.replace(/[="]/g, '').trim();
  const datePart = cleaned.split(' ')[0]; // Get just "2025-07-07"
  return new Date(datePart);
};

// Get or create agent by name
const agentCache = new Map();
const getOrCreateAgent = async (agentName) => {
  if (agentCache.has(agentName)) {
    return agentCache.get(agentName);
  }

  // Check if agent exists (by name, globally)
  let agent = await Agent.findOne({ name: agentName });

  if (agent) {
    stats.agentsExisting++;
    console.log(`  Agent exists: ${agentName}`);
  } else {
    // Create new agent
    agent = await Agent.create({
      name: agentName,
      createdBy: new mongoose.Types.ObjectId(FILIP_USER_ID),
      activeForUsers: [], // Not active for anyone currently
      isRemoved: false
    });
    stats.agentsCreated++;
    console.log(`  Created agent: ${agentName}`);
  }

  agentCache.set(agentName, agent);
  return agent;
};

// Main import function
const importTickets = async () => {
  console.log('Starting import for Filip Kozomara...\n');

  const rows = [];

  // Read CSV
  await new Promise((resolve, reject) => {
    fs.createReadStream(CSV_PATH)
      .pipe(csv())
      .on('data', (row) => rows.push(row))
      .on('end', resolve)
      .on('error', reject);
  });

  console.log(`Read ${rows.length} rows from CSV\n`);
  stats.totalRows = rows.length;

  // Process each row
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    try {
      // Skip if no feedback (comment)
      const feedback = row.comment?.trim();
      if (!feedback) {
        stats.skippedNoFeedback++;
        continue;
      }

      const ticketId = row.gradable_id?.trim();
      const agentName = row.agent_name?.trim();
      const rubricScore = parseFloat(row.rubric_score);
      const ticketCreatedAt = parseDate(row.ticket_created_at);

      // Validate required fields
      if (!ticketId || !agentName || isNaN(rubricScore)) {
        console.log(`  Skipping row ${i + 1}: missing required fields`);
        stats.errors++;
        continue;
      }

      // Get or create agent first (needed for duplicate check)
      const agent = await getOrCreateAgent(agentName);

      // Check for duplicate ticket (same ticketId + same agent)
      const existingTicket = await Ticket.findOne({ ticketId: ticketId, agent: agent._id });
      if (existingTicket) {
        stats.skippedDuplicate++;
        continue;
      }

      // Create ticket
      await Ticket.create({
        ticketId: ticketId,
        agent: agent._id,
        createdBy: new mongoose.Types.ObjectId(FILIP_USER_ID),
        status: 'Graded',
        qualityScorePercent: rubricScore,
        feedback: feedback,
        notes: '', // Empty as requested
        dateEntered: ticketCreatedAt,
        gradedDate: ticketCreatedAt,
        isArchived: true,
        archivedDate: new Date(),
        embeddingOutdated: true // Will need embedding generation
      });

      stats.ticketsImported++;

      // Progress log every 100 tickets
      if (stats.ticketsImported % 100 === 0) {
        console.log(`  Imported ${stats.ticketsImported} tickets...`);
      }

    } catch (error) {
      console.error(`  Error on row ${i + 1}:`, error.message);
      stats.errors++;
    }
  }

  console.log('\n========== IMPORT COMPLETE ==========');
  console.log(`Total rows in CSV:      ${stats.totalRows}`);
  console.log(`Skipped (no feedback):  ${stats.skippedNoFeedback}`);
  console.log(`Skipped (duplicate):    ${stats.skippedDuplicate}`);
  console.log(`Agents created (new):   ${stats.agentsCreated}`);
  console.log(`Agents existing:        ${stats.agentsExisting}`);
  console.log(`Tickets imported:       ${stats.ticketsImported}`);
  console.log(`Errors:                 ${stats.errors}`);
  console.log('======================================\n');
};

// Connect to DB and run
const run = async () => {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected!\n');

    await importTickets();

    console.log('Disconnecting...');
    await mongoose.disconnect();
    console.log('Done!');
    process.exit(0);

  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
};

run();
