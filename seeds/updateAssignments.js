require('dotenv').config();
const mongoose = require('mongoose');
const QAAssignment = require('../models/QAAssignment');
const Agent = require('../models/Agent');

async function updateAssignments() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  const weekId = '2026-W04';

  // 1. Update all assignment names to '1/12-1/18'
  const updateResult = await QAAssignment.updateMany(
    { weekId: weekId },
    { $set: { assignmentName: '1/12-1/18' } }
  );
  console.log('Updated assignment names:', updateResult.modifiedCount);

  // 2. Delete assignments for Luka Sitarica and Elsayed Abdelkader
  const luka = await Agent.findOne({ name: /luka sitarica/i });
  const elsayed = await Agent.findOne({ name: /elsayed abdelkader/i });

  let deleted = 0;
  if (luka) {
    const r = await QAAssignment.deleteOne({ agentId: luka._id, weekId: weekId });
    if (r.deletedCount) {
      console.log('Deleted assignment for Luka Sitarica');
      deleted++;
    }
  }
  if (elsayed) {
    const r = await QAAssignment.deleteOne({ agentId: elsayed._id, weekId: weekId });
    if (r.deletedCount) {
      console.log('Deleted assignment for Elsayed Abdelkader');
      deleted++;
    }
  }

  console.log('Total deleted:', deleted);

  // Show remaining assignments
  const remaining = await QAAssignment.find({ weekId: weekId }).populate('agentId', 'name');
  console.log('\nRemaining assignments (' + remaining.length + '):');
  remaining.forEach(a => {
    console.log('  -', a.agentId?.name || 'Unknown', '->', a.assignmentName);
  });

  await mongoose.disconnect();
}

updateAssignments().catch(console.error);
