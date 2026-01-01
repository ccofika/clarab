require('dotenv').config();
const mongoose = require('mongoose');
const Agent = require('../models/Agent');

async function check() {
  await mongoose.connect(process.env.MONGODB_URI);

  const agent = await Agent.findOne({ 'unresolvedIssues.0': { $exists: true } })
    .select('name unresolvedIssues issuesLastAnalyzed');

  if (agent) {
    const unresolvedIssues = (agent.unresolvedIssues || [])
      .filter(issue => !issue.isResolved)
      .sort((a, b) => new Date(b.gradedDate) - new Date(a.gradedDate));

    console.log('Agent:', agent.name);
    console.log('Issues count:', unresolvedIssues.length);
    console.log('\nFirst issue object:');

    // Check if it's a mongoose document
    const firstIssue = unresolvedIssues[0];
    if (firstIssue) {
      const plainObj = firstIssue.toObject ? firstIssue.toObject() : firstIssue;
      console.log('Keys:', Object.keys(plainObj));
      console.log('summary field:', plainObj.summary);
      console.log('\nFull JSON:');
      console.log(JSON.stringify(plainObj, null, 2));
    }
  }

  await mongoose.connection.close();
}

check().catch(console.error);
