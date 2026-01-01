require('dotenv').config();
const mongoose = require('mongoose');
const Agent = require('../models/Agent');

async function check() {
  await mongoose.connect(process.env.MONGODB_URI);

  const agents = await Agent.find({
    'unresolvedIssues.0': { $exists: true }
  }).select('name unresolvedIssues');

  console.log('Agents with issues:', agents.length);

  for (const agent of agents) {
    console.log(`\n${agent.name}:`);
    for (const issue of agent.unresolvedIssues) {
      console.log(`  - ${issue.summary?.substring(0, 60)}...`);
    }
  }

  await mongoose.connection.close();
}

check().catch(console.error);
