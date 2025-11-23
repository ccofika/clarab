const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const Ticket = require('../models/Ticket');
const Agent = require('../models/Agent');
const User = require('../models/User');

// Parse date from CSV format (MM/DD/YYYY)
function parseCSVDate(dateStr) {
  if (!dateStr) return new Date();

  // Format: 10/9/2025 or similar
  const parts = dateStr.split('/');
  if (parts.length === 3) {
    const month = parseInt(parts[0]) - 1; // Month is 0-indexed
    const day = parseInt(parts[1]);
    const year = parseInt(parts[2]);
    return new Date(year, month, day);
  }

  return new Date();
}

async function importTickets() {
  try {
    // Connect to MongoDB
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✓ Connected to MongoDB');

    // Find the user by email
    const userEmail = 'vasilijevitorovic@mebit.io';
    console.log(`\nLooking for user: ${userEmail}`);
    const user = await User.findOne({ email: userEmail });

    if (!user) {
      console.error(`✗ User with email ${userEmail} not found!`);
      console.log('Please create this user first or update the email in the script.');
      process.exit(1);
    }
    console.log(`✓ Found user: ${user.name} (${user.email})`);

    // Get all agents for this user (or create them if needed)
    const agentMap = new Map();

    // Read CSV file
    const csvPath = path.join(__dirname, '../../QA Workspace - istorija tiketa.csv');
    console.log(`\nReading CSV file: ${csvPath}`);

    if (!fs.existsSync(csvPath)) {
      console.error(`✗ CSV file not found at: ${csvPath}`);
      process.exit(1);
    }

    const tickets = [];
    const uniqueAgents = new Set();

    // First pass: collect all unique agent names
    await new Promise((resolve, reject) => {
      fs.createReadStream(csvPath)
        .pipe(csv())
        .on('data', (row) => {
          const agentName = row['Agent'];
          if (agentName && agentName.trim()) {
            uniqueAgents.add(agentName.trim());
          }
        })
        .on('end', resolve)
        .on('error', reject);
    });

    console.log(`\n✓ Found ${uniqueAgents.size} unique agents in CSV`);

    // Create or find all agents
    console.log('\nCreating/finding agents...');
    for (const agentName of uniqueAgents) {
      let agent = await Agent.findOne({ name: agentName, createdBy: user._id });

      if (!agent) {
        agent = await Agent.create({
          name: agentName,
          position: 'Support Agent',
          team: 'QA Team',
          createdBy: user._id
        });
        console.log(`  ✓ Created agent: ${agentName}`);
      } else {
        console.log(`  ✓ Found existing agent: ${agentName}`);
      }

      agentMap.set(agentName, agent._id);
    }

    // Second pass: read and process tickets
    console.log('\nProcessing tickets from CSV...');
    let rowCount = 0;
    let successCount = 0;
    let errorCount = 0;

    await new Promise((resolve, reject) => {
      fs.createReadStream(csvPath)
        .pipe(csv())
        .on('data', (row) => {
          rowCount++;

          const agentName = row['Agent'];
          const ticketId = row['Ticket ID'];
          const shortDescription = row['Kratak opis (pre-eval)'];
          const statusFromCSV = row['Status'] || row[''];  // Empty column might be status
          const dateEntered = parseCSVDate(row['Datum unosa']);
          const feedback = row['Napomena'];

          // Validate required fields
          if (!agentName || !ticketId) {
            console.log(`  ⚠ Row ${rowCount}: Missing agent or ticket ID, skipping...`);
            errorCount++;
            return;
          }

          const agentId = agentMap.get(agentName.trim());
          if (!agentId) {
            console.log(`  ⚠ Row ${rowCount}: Agent not found: ${agentName}, skipping...`);
            errorCount++;
            return;
          }

          // Determine status - if CSV says "Ocenjen", it means "Graded"
          const status = statusFromCSV && statusFromCSV.trim().toLowerCase() === 'ocenjen'
            ? 'Graded'
            : 'Selected';

          tickets.push({
            agent: agentId,
            ticketId: ticketId.trim(),
            shortDescription: shortDescription ? shortDescription.trim() : '',
            status: status,
            dateEntered: dateEntered,
            notes: shortDescription ? shortDescription.trim() : '',
            feedback: feedback ? feedback.trim() : '',
            createdBy: user._id,
            isArchived: true,  // Mark as archived as per user request
            archivedDate: new Date(),
            qualityScorePercent: null,  // No scores in CSV
            category: 'General',
            priority: 'Medium'
          });
        })
        .on('end', resolve)
        .on('error', reject);
    });

    console.log(`\n✓ Processed ${rowCount} rows from CSV`);
    console.log(`✓ Prepared ${tickets.length} tickets for import`);

    // Insert tickets into database
    if (tickets.length > 0) {
      console.log('\nInserting tickets into database...');

      for (let i = 0; i < tickets.length; i++) {
        try {
          // Check if ticket already exists
          const existing = await Ticket.findOne({ ticketId: tickets[i].ticketId });
          if (existing) {
            console.log(`  ⚠ Ticket ${tickets[i].ticketId} already exists, skipping...`);
            errorCount++;
            continue;
          }

          await Ticket.create(tickets[i]);
          successCount++;

          if ((i + 1) % 10 === 0) {
            console.log(`  ✓ Inserted ${i + 1}/${tickets.length} tickets...`);
          }
        } catch (error) {
          console.error(`  ✗ Error inserting ticket ${tickets[i].ticketId}:`, error.message);
          errorCount++;
        }
      }

      console.log(`\n✓ Successfully imported ${successCount} tickets`);
      if (errorCount > 0) {
        console.log(`⚠ ${errorCount} tickets failed or were skipped`);
      }
    }

    console.log('\n=== Import Summary ===');
    console.log(`Total rows in CSV: ${rowCount}`);
    console.log(`Agents created/found: ${uniqueAgents.size}`);
    console.log(`Tickets imported: ${successCount}`);
    console.log(`Errors/Skipped: ${errorCount}`);
    console.log(`All tickets marked as: ARCHIVED`);
    console.log(`Created by: ${user.name} (${user.email})`);

  } catch (error) {
    console.error('\n✗ Fatal error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n✓ Database connection closed');
  }
}

// Run the import
importTickets();
