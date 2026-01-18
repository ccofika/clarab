/**
 * Analyze Agent Issues - Weekly AI Analysis
 *
 * This script analyzes all agents' recent bad grades (< 90%) and:
 * 1. Generates AI summaries for each issue
 * 2. Checks if the issue has been resolved (agent got good grade for similar ticket)
 * 3. Updates agent's unresolvedIssues array
 *
 * Run manually: node scripts/analyzeAgentIssues.js
 * Scheduled: Every Monday at 6 AM via cron job
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Agent = require('../models/Agent');
const Ticket = require('../models/Ticket');
const { summarizeTicketIssue, generateEmbedding, cosineSimilarity } = require('../utils/openai');

const mongoUri = process.env.MONGODB_URI;
const BAD_GRADE_THRESHOLD = 90; // Below this is considered bad
const WEEKS_TO_ANALYZE = 3;
const SIMILARITY_THRESHOLD = 0.7; // 70% similarity to consider tickets as same type

async function connectDB() {
  try {
    await mongoose.connect(mongoUri);
    console.log('✅ MongoDB Connected\n');
  } catch (error) {
    console.error('❌ MongoDB Connection Error:', error.message);
    process.exit(1);
  }
}

// Strip HTML tags
const stripHtml = (html) => {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
};

/**
 * Create combined text from notes and feedback for embedding
 * This provides richer semantic context for similarity matching
 */
const createCombinedText = (ticket) => {
  const notes = stripHtml(ticket.notes);
  const feedback = stripHtml(ticket.feedback);
  if (!notes || notes.length < 10) return null;
  return feedback ? `${notes} | ${feedback}` : notes;
};

/**
 * Check if agent has a good grade for a similar ticket
 * Uses category matching first, then embedding similarity as fallback
 */
async function findResolvingTicket(badTicket, goodTickets) {
  // First check: Same category with good score
  const sameCategoryGood = goodTickets.find(t =>
    t.category === badTicket.category &&
    t.gradedDate > badTicket.gradedDate
  );

  if (sameCategoryGood) {
    return sameCategoryGood;
  }

  // Second check: Embedding similarity using notes + feedback
  const badCombinedText = createCombinedText(badTicket);
  if (!badCombinedText) return null;

  // Use stored notesEmbedding if available (now contains notes+feedback), otherwise generate
  let badEmbedding = badTicket.notesEmbedding;
  if (!badEmbedding || badEmbedding.length === 0) {
    badEmbedding = await generateEmbedding(badCombinedText);
  }
  if (!badEmbedding) return null;

  // Find good tickets with embeddings that are similar
  for (const goodTicket of goodTickets) {
    if (goodTicket.gradedDate <= badTicket.gradedDate) continue;

    let goodEmbedding = goodTicket.notesEmbedding;
    if (!goodEmbedding || goodEmbedding.length === 0) {
      const goodCombinedText = createCombinedText(goodTicket);
      if (goodCombinedText) {
        goodEmbedding = await generateEmbedding(goodCombinedText);
      }
    }

    if (goodEmbedding) {
      const similarity = cosineSimilarity(badEmbedding, goodEmbedding);
      if (similarity >= SIMILARITY_THRESHOLD) {
        return goodTicket;
      }
    }
  }

  return null;
}

/**
 * Analyze a single agent's issues
 */
async function analyzeAgent(agent) {
  console.log(`\n📊 Analyzing: ${agent.name}`);

  // Calculate date range (last 3 weeks)
  const threeWeeksAgo = new Date();
  threeWeeksAgo.setDate(threeWeeksAgo.getDate() - (WEEKS_TO_ANALYZE * 7));

  // Find all graded tickets for this agent in the last 3 weeks
  const recentTickets = await Ticket.find({
    agent: agent._id,
    status: 'Graded',
    gradedDate: { $gte: threeWeeksAgo }
  })
    .select('+notesEmbedding')
    .sort({ gradedDate: -1 })
    .lean();

  console.log(`   Found ${recentTickets.length} graded tickets in last ${WEEKS_TO_ANALYZE} weeks`);

  // Separate good and bad tickets
  const badTickets = recentTickets.filter(t =>
    t.qualityScorePercent !== undefined &&
    t.qualityScorePercent < BAD_GRADE_THRESHOLD
  );
  const goodTickets = recentTickets.filter(t =>
    t.qualityScorePercent !== undefined &&
    t.qualityScorePercent >= BAD_GRADE_THRESHOLD
  );

  console.log(`   Bad grades (<${BAD_GRADE_THRESHOLD}%): ${badTickets.length}`);
  console.log(`   Good grades (≥${BAD_GRADE_THRESHOLD}%): ${goodTickets.length}`);

  if (badTickets.length === 0) {
    // No bad grades - clear unresolved issues
    await Agent.findByIdAndUpdate(agent._id, {
      unresolvedIssues: [],
      issuesLastAnalyzed: new Date()
    });
    console.log(`   ✅ No bad grades - cleared issues`);
    return { agent: agent.name, badGrades: 0, unresolvedCount: 0 };
  }

  // Analyze each bad ticket
  const unresolvedIssues = [];

  for (const badTicket of badTickets) {
    console.log(`   Checking ticket ${badTicket.ticketId} (${badTicket.qualityScorePercent}%)...`);

    // Check if this issue was resolved
    const resolvingTicket = await findResolvingTicket(badTicket, goodTickets);

    if (resolvingTicket) {
      console.log(`      ✅ Resolved by ticket ${resolvingTicket.ticketId} (${resolvingTicket.qualityScorePercent}%)`);
      continue; // Skip - issue was resolved
    }

    // Generate AI summary for this issue
    console.log(`      🤖 Generating AI summary...`);
    const summary = await summarizeTicketIssue(badTicket);

    unresolvedIssues.push({
      ticketId: badTicket._id,
      ticketNumber: badTicket.ticketId,
      category: badTicket.category,
      qualityScore: badTicket.qualityScorePercent,
      gradedDate: badTicket.gradedDate,
      summary: summary,
      feedback: stripHtml(badTicket.feedback)?.substring(0, 500), // Limit feedback length
      isResolved: false,
      createdAt: new Date()
    });

    console.log(`      ❌ Unresolved: "${summary}"`);

    // Rate limiting - wait a bit between AI calls
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  // Update agent with unresolved issues
  await Agent.findByIdAndUpdate(agent._id, {
    unresolvedIssues: unresolvedIssues,
    issuesLastAnalyzed: new Date()
  });

  console.log(`   📝 ${unresolvedIssues.length} unresolved issues saved`);

  return {
    agent: agent.name,
    badGrades: badTickets.length,
    unresolvedCount: unresolvedIssues.length
  };
}

/**
 * Main function - analyze all agents
 * @param {boolean} standalone - If true, connects to DB and closes when done
 */
async function analyzeAllAgents(standalone = false) {
  if (standalone) {
    await connectDB();
  }

  console.log('='.repeat(60));
  console.log('🔍 AGENT ISSUES ANALYSIS');
  console.log(`   Threshold: < ${BAD_GRADE_THRESHOLD}%`);
  console.log(`   Period: Last ${WEEKS_TO_ANALYZE} weeks`);
  console.log('='.repeat(60));

  // Get all active agents
  const agents = await Agent.find({ isRemoved: { $ne: true } }).lean();
  console.log(`\nFound ${agents.length} active agents to analyze\n`);

  const results = [];

  for (const agent of agents) {
    try {
      const result = await analyzeAgent(agent);
      results.push(result);
    } catch (error) {
      console.error(`   ❌ Error analyzing ${agent.name}:`, error.message);
      results.push({ agent: agent.name, error: error.message });
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 SUMMARY');
  console.log('='.repeat(60));

  const totalUnresolved = results.reduce((sum, r) => sum + (r.unresolvedCount || 0), 0);
  const totalBadGrades = results.reduce((sum, r) => sum + (r.badGrades || 0), 0);

  console.log(`Total agents analyzed: ${results.length}`);
  console.log(`Total bad grades found: ${totalBadGrades}`);
  console.log(`Total unresolved issues: ${totalUnresolved}`);

  console.log('\nPer agent:');
  results.forEach(r => {
    if (r.error) {
      console.log(`  ❌ ${r.agent}: ERROR - ${r.error}`);
    } else if (r.unresolvedCount > 0) {
      console.log(`  ⚠️  ${r.agent}: ${r.unresolvedCount} unresolved (${r.badGrades} bad grades)`);
    } else {
      console.log(`  ✅ ${r.agent}: No unresolved issues`);
    }
  });

  if (standalone) {
    await mongoose.connection.close();
  }
  console.log('\n✅ Analysis complete');

  return results;
}

// Run if called directly
if (require.main === module) {
  analyzeAllAgents(true)
    .then(() => process.exit(0))
    .catch(err => {
      console.error('Fatal error:', err);
      process.exit(1);
    });
}

module.exports = { analyzeAllAgents, analyzeAgent };
