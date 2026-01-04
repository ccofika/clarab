/**
 * Script to fix ticket dates where year is incorrectly set to 2026 instead of 2025
 * Run with: node scripts/fix-ticket-dates.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

const run = async () => {
  try {
    // Connect to MongoDB
    if (!process.env.MONGODB_URI) {
      throw new Error('MONGODB_URI is not defined in environment variables');
    }

    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Get the Ticket collection directly
    const db = mongoose.connection.db;
    const ticketsCollection = db.collection('tickets');

    // Find all tickets with dateEntered > Jan 5, 2026
    const cutoffDate = new Date('2026-01-05T00:00:00.000Z');

    // First, let's see what we're dealing with
    const ticketsToFix = await ticketsCollection.find({
      dateEntered: { $gt: cutoffDate }
    }).toArray();

    console.log(`\nFound ${ticketsToFix.length} tickets with dateEntered > Jan 5, 2026:`);

    ticketsToFix.forEach(ticket => {
      console.log(`  - Ticket ID: ${ticket.ticketId || ticket._id}, Date: ${ticket.dateEntered}`);
    });

    if (ticketsToFix.length === 0) {
      console.log('\nNo tickets to fix.');
      await mongoose.disconnect();
      return;
    }

    // Ask for confirmation
    console.log('\nUpdating dates from 2026 to 2025...\n');

    // Update each ticket - subtract 1 year from dateEntered
    let updatedCount = 0;
    for (const ticket of ticketsToFix) {
      const oldDate = new Date(ticket.dateEntered);
      const newDate = new Date(oldDate);
      newDate.setFullYear(oldDate.getFullYear() - 1); // 2026 -> 2025

      await ticketsCollection.updateOne(
        { _id: ticket._id },
        { $set: { dateEntered: newDate } }
      );

      console.log(`  Updated: ${ticket.ticketId || ticket._id}`);
      console.log(`    Old date: ${oldDate.toISOString()}`);
      console.log(`    New date: ${newDate.toISOString()}`);
      updatedCount++;
    }

    console.log(`\n✓ Successfully updated ${updatedCount} tickets.`);

    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
};

run();
