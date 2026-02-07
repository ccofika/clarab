/**
 * Backup script for Tamara Bortnik's non-archived tickets.
 * Run: node scripts/backupTamaraTickets.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const TAMARA_EMAIL = 'tamarabortnik@mebit.io';

async function main() {
  try {
    console.log('[BACKUP] Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('[BACKUP] Connected.');

    const User = require('../models/User');
    const Ticket = require('../models/Ticket');
    const Agent = require('../models/Agent');

    // Find Tamara's user account
    const tamara = await User.findOne({ email: TAMARA_EMAIL }).select('_id name email');
    if (!tamara) {
      console.error(`[BACKUP] User not found with email: ${TAMARA_EMAIL}`);
      process.exit(1);
    }
    console.log(`[BACKUP] Found grader: ${tamara.name} (${tamara.email}) - ID: ${tamara._id}`);

    // Find all her non-archived tickets
    const tickets = await Ticket.find({
      createdBy: tamara._id,
      isArchived: false
    })
      .populate('agent', 'name team position maestroName activeForUsers')
      .lean();

    console.log(`[BACKUP] Found ${tickets.length} non-archived tickets for ${tamara.name}`);

    if (tickets.length === 0) {
      console.log('[BACKUP] No tickets to backup. Exiting.');
      await mongoose.disconnect();
      process.exit(0);
    }

    // Log ticket summary
    const graded = tickets.filter(t => t.status === 'Graded').length;
    const selected = tickets.filter(t => t.status === 'Selected').length;
    const draft = tickets.filter(t => t.status === 'Draft').length;
    const waiting = tickets.filter(t => t.status === 'Waiting on your input').length;
    console.log(`[BACKUP] Status breakdown: Graded=${graded}, Selected=${selected}, Draft=${draft}, Waiting=${waiting}`);

    // Unique agents
    const uniqueAgents = {};
    tickets.forEach(t => {
      if (t.agent?._id) {
        uniqueAgents[t.agent._id.toString()] = t.agent.name;
      }
    });
    console.log(`[BACKUP] Unique agents (${Object.keys(uniqueAgents).length}):`);
    Object.entries(uniqueAgents).forEach(([id, name]) => {
      const agentTickets = tickets.filter(t => t.agent?._id?.toString() === id);
      console.log(`  - ${name}: ${agentTickets.length} tickets`);
    });

    // Also find agents assigned to Tamara (activeForUsers)
    const assignedAgents = await Agent.find({
      activeForUsers: tamara._id,
      isRemoved: { $ne: true }
    }).select('_id name team position maestroName activeForUsers').lean();

    console.log(`[BACKUP] Agents assigned to Tamara (activeForUsers): ${assignedAgents.length}`);
    assignedAgents.forEach(a => {
      console.log(`  - ${a.name} (ID: ${a._id})`);
    });

    // Create backup directory
    const backupDir = path.join(__dirname, '..', 'backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    // Create backup file
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFileName = `backup_Tamara_Bortnik_${timestamp}.json`;
    const backupPath = path.join(backupDir, backupFileName);

    const backupData = {
      grader: {
        _id: tamara._id,
        name: tamara.name,
        email: tamara.email
      },
      backupDate: new Date().toISOString(),
      ticketCount: tickets.length,
      statusBreakdown: { graded, selected, draft, waiting },
      assignedAgents: assignedAgents.map(a => ({
        _id: a._id,
        name: a.name,
        team: a.team,
        position: a.position,
        maestroName: a.maestroName,
        activeForUsers: a.activeForUsers
      })),
      tickets: tickets.map(t => ({
        _id: t._id,
        ticketId: t.ticketId,
        agent: {
          _id: t.agent?._id,
          name: t.agent?.name,
          team: t.agent?.team,
          position: t.agent?.position,
          maestroName: t.agent?.maestroName
        },
        shortDescription: t.shortDescription,
        status: t.status,
        dateEntered: t.dateEntered,
        notes: t.notes,
        feedback: t.feedback,
        qualityScorePercent: t.qualityScorePercent,
        lastModified: t.lastModified,
        gradedDate: t.gradedDate,
        createdBy: t.createdBy,
        categories: t.categories,
        priority: t.priority,
        tags: t.tags,
        weekNumber: t.weekNumber,
        weekYear: t.weekYear,
        scorecardVariant: t.scorecardVariant,
        scorecardValues: t.scorecardValues,
        additionalNote: t.additionalNote,
        reviewHistory: t.reviewHistory,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt
      }))
    };

    fs.writeFileSync(backupPath, JSON.stringify(backupData, null, 2));

    const fileSizeKB = (fs.statSync(backupPath).size / 1024).toFixed(1);
    console.log(`\n[BACKUP] SUCCESS!`);
    console.log(`[BACKUP] File: ${backupPath}`);
    console.log(`[BACKUP] Size: ${fileSizeKB} KB`);
    console.log(`[BACKUP] Tickets: ${tickets.length}`);
    console.log(`[BACKUP] Agents: ${assignedAgents.length}`);

    await mongoose.disconnect();
    console.log('[BACKUP] Done.');
    process.exit(0);
  } catch (error) {
    console.error('[BACKUP] FATAL ERROR:', error);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  }
}

main();
