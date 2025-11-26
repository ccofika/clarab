/**
 * Script to fix ticket dates for vasilijevitorovic@mebit.io
 * Updates gradedDate based on date_graded from CSV file
 *
 * Usage: node scripts/fixVasilijeTicketDates.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

// Models
const Ticket = require('../models/Ticket');
const User = require('../models/User');

// CSV file path
const CSV_PATH = path.join(__dirname, '../../total_scores (1).csv');

// Parse CSV line (handles quoted fields with commas)
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());

  return result;
}

// Parse date from CSV format: ="2025-10-23 06:56:35.901000"
function parseDateFromCSV(dateStr) {
  if (!dateStr) return null;

  // Remove ="..." wrapper if present
  let cleaned = dateStr.replace(/^="/, '').replace(/"$/, '');

  // Extract just the date part (YYYY-MM-DD HH:MM:SS)
  const match = cleaned.match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/);
  if (!match) return null;

  const [, year, month, day, hour, minute, second] = match;
  return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`);
}

async function main() {
  try {
    // Connect to MongoDB
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Find Vasilije user
    const vasilije = await User.findOne({ email: 'vasilijevitorovic@mebit.io' });
    if (!vasilije) {
      console.error('User vasilijevitorovic@mebit.io not found!');
      process.exit(1);
    }
    console.log(`Found user: ${vasilije.name} (${vasilije._id})`);

    // Read and parse CSV
    console.log('Reading CSV file...');
    const csvContent = fs.readFileSync(CSV_PATH, 'utf-8');
    const lines = csvContent.split('\n');

    // Get header
    const header = parseCSVLine(lines[0]);
    const gradableIdIndex = header.indexOf('gradable_id');
    const dateGradedIndex = header.indexOf('date_graded');
    const graderIndex = header.indexOf('grader');

    console.log(`CSV columns: gradable_id=${gradableIdIndex}, date_graded=${dateGradedIndex}, grader=${graderIndex}`);

    // Build map of ticketId -> date_graded (only for Vasilije's tickets)
    const ticketDates = new Map();
    let vasilijeRecords = 0;

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const fields = parseCSVLine(line);
      const grader = fields[graderIndex];

      // Only process Vasilije's records
      if (grader === 'vasilijevitorovic@mebit.io') {
        const ticketId = fields[gradableIdIndex];
        const dateGraded = parseDateFromCSV(fields[dateGradedIndex]);

        if (ticketId && dateGraded) {
          ticketDates.set(ticketId, dateGraded);
          vasilijeRecords++;
        }
      }
    }

    console.log(`Found ${vasilijeRecords} records for vasilijevitorovic@mebit.io in CSV`);

    // Find all archived tickets created by Vasilije
    const vasilijeTickets = await Ticket.find({
      createdBy: vasilije._id,
      isArchived: true
    });

    console.log(`Found ${vasilijeTickets.length} archived tickets for Vasilije in MongoDB`);

    // Update tickets
    let updated = 0;
    let notFound = 0;
    let noChange = 0;

    for (const ticket of vasilijeTickets) {
      const csvDate = ticketDates.get(ticket.ticketId);

      if (!csvDate) {
        notFound++;
        continue;
      }

      // Check if dates are different (more than 1 minute apart)
      const currentDate = ticket.gradedDate ? new Date(ticket.gradedDate) : null;
      const timeDiff = currentDate ? Math.abs(csvDate - currentDate) : Infinity;

      if (timeDiff > 60000) { // More than 1 minute difference
        console.log(`Updating ticket ${ticket.ticketId}:`);
        console.log(`  Old gradedDate: ${currentDate ? currentDate.toISOString() : 'null'}`);
        console.log(`  New gradedDate: ${csvDate.toISOString()}`);

        await Ticket.findByIdAndUpdate(ticket._id, {
          gradedDate: csvDate
        });
        updated++;
      } else {
        noChange++;
      }
    }

    console.log('\n=== Summary ===');
    console.log(`Total Vasilije archived tickets: ${vasilijeTickets.length}`);
    console.log(`Updated: ${updated}`);
    console.log(`No change needed: ${noChange}`);
    console.log(`Not found in CSV: ${notFound}`);

    console.log('\nDone!');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();
