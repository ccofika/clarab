/**
 * Test script for Similar Feedbacks functionality with notesEmbedding
 * Run: node scripts/testSimilarFeedbacks.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Ticket = require('../models/Ticket');
const Agent = require('../models/Agent');
const { generateEmbedding, cosineSimilarity } = require('../utils/openai');

const mongoUri = process.env.MONGODB_URI;

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

// Simulate the getSimilarFeedbacks function with notesEmbedding
async function getSimilarFeedbacks(notes, excludeTicketId = null, limit = 10) {
  const cleanNotes = stripHtml(notes);

  if (!cleanNotes || cleanNotes.length < 10) {
    return { results: [], message: 'Notes too short' };
  }

  // Build base filter
  const baseFilter = {
    status: 'Graded',
    feedback: { $exists: true, $ne: null, $ne: '' },
    notes: { $exists: true, $ne: null, $ne: '' }
  };

  if (excludeTicketId) {
    try {
      baseFilter._id = { $ne: new mongoose.Types.ObjectId(excludeTicketId) };
    } catch (e) {}
  }

  // ========================================
  // STEP 1: KEYWORD MATCHING
  // ========================================
  console.log('=== STEP 1: KEYWORD MATCHING ===\n');

  const stopwords = new Set(['the', 'and', 'for', 'that', 'this', 'with', 'from', 'have', 'was', 'were', 'are', 'been', 'being', 'has', 'had', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare', 'ought', 'used', 'also', 'just', 'only', 'even', 'more', 'most', 'other', 'some', 'such', 'than', 'too', 'very', 'own', 'same', 'into', 'over', 'after', 'before', 'between', 'under', 'again', 'further', 'then', 'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'each', 'few', 'many', 'much', 'both', 'any', 'these', 'those', 'what', 'which', 'who', 'whom', 'but', 'not', 'out', 'about', 'because', 'while', 'during', 'through', 'lepo', 'dobro', 'smo', 'mogli', 'nakon', 'koji', 'koja', 'koje', 'tako', 'sto', 'ali', 'vec', 'jos', 'biti', 'bio', 'bila', 'bilo', 'bice']);

  const keywords = cleanNotes
    .toLowerCase()
    .replace(/[^\w\sčćžšđ]/gi, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 3 && !stopwords.has(w))
    .slice(0, 15);

  console.log(`Keywords: ${keywords.join(', ')}\n`);

  let keywordResults = [];

  if (keywords.length > 0) {
    const keywordPatterns = keywords.map(k => new RegExp(k, 'i'));

    const keywordCandidates = await Ticket.find({
      ...baseFilter,
      $or: keywordPatterns.map(pattern => ({ notes: pattern }))
    })
      .select('ticketId notes feedback qualityScorePercent agent')
      .populate('agent', 'name')
      .limit(100)
      .lean();

    console.log(`Found ${keywordCandidates.length} keyword candidates\n`);

    keywordResults = keywordCandidates.map(ticket => {
      const ticketNotesLower = stripHtml(ticket.notes).toLowerCase();
      let matchCount = 0;
      const matchedKeywords = [];

      keywords.forEach(keyword => {
        if (ticketNotesLower.includes(keyword)) {
          matchCount++;
          matchedKeywords.push(keyword);
        }
      });

      const matchScore = keywords.length > 0 ? Math.round((matchCount / keywords.length) * 100) : 0;

      return {
        ticketId: ticket.ticketId,
        notes: ticket.notes,
        feedback: ticket.feedback,
        agentName: ticket.agent?.name,
        similarityScore: matchScore,
        matchType: 'keyword',
        matchedKeywords
      };
    })
      .filter(t => t.similarityScore >= 20)
      .sort((a, b) => b.similarityScore - a.similarityScore)
      .slice(0, 5);

    console.log('Top 5 KEYWORD matches:');
    keywordResults.forEach((r, i) => {
      console.log(`${i + 1}. ${r.similarityScore}% [${r.matchedKeywords.join(', ')}] - "${stripHtml(r.notes).substring(0, 60)}..."`);
    });
  }

  // ========================================
  // STEP 2: NOTES-TO-NOTES EMBEDDING (Using stored notesEmbedding)
  // ========================================
  console.log('\n=== STEP 2: NOTES EMBEDDING (stored notesEmbedding) ===\n');

  let embeddingResults = [];

  console.log('Generating embedding for input notes...');
  const queryEmbedding = await generateEmbedding(cleanNotes);

  if (queryEmbedding) {
    console.log(`✅ Generated (length: ${queryEmbedding.length})\n`);

    const keywordTicketIds = new Set(keywordResults.map(r => r.ticketId));

    // Find tickets with stored notesEmbedding
    const embeddingCandidates = await Ticket.find({
      ...baseFilter,
      ticketId: { $nin: Array.from(keywordTicketIds) },
      notesEmbedding: { $exists: true, $type: 'array', $ne: [] }
    })
      .select('+notesEmbedding ticketId notes feedback qualityScorePercent agent')
      .populate('agent', 'name')
      .limit(200)
      .lean();

    console.log(`Found ${embeddingCandidates.length} tickets with notesEmbedding\n`);

    embeddingResults = embeddingCandidates
      .map(ticket => {
        if (!ticket.notesEmbedding || ticket.notesEmbedding.length === 0) return null;

        const similarity = cosineSimilarity(queryEmbedding, ticket.notesEmbedding) * 100;

        return {
          ticketId: ticket.ticketId,
          notes: ticket.notes,
          feedback: ticket.feedback,
          agentName: ticket.agent?.name,
          similarityScore: Math.round(similarity),
          matchType: 'embedding'
        };
      })
      .filter(r => r !== null && r.similarityScore >= 25)
      .sort((a, b) => b.similarityScore - a.similarityScore)
      .slice(0, 5);

    console.log('Top 5 EMBEDDING matches:');
    embeddingResults.forEach((r, i) => {
      console.log(`${i + 1}. ${r.similarityScore}% - "${stripHtml(r.notes).substring(0, 60)}..."`);
    });
  }

  // ========================================
  // STEP 3: COMBINED RESULTS
  // ========================================
  console.log('\n=== COMBINED RESULTS ===\n');

  const allResults = [...keywordResults, ...embeddingResults];

  const seen = new Map();
  allResults.forEach(r => {
    const key = r.ticketId;
    if (!seen.has(key) || seen.get(key).similarityScore < r.similarityScore) {
      seen.set(key, r);
    }
  });

  const finalResults = Array.from(seen.values())
    .sort((a, b) => b.similarityScore - a.similarityScore)
    .slice(0, limit);

  console.log(`Final ${finalResults.length} results:`);
  finalResults.forEach((r, i) => {
    console.log(`\n${i + 1}. ${r.similarityScore}% [${r.matchType}]`);
    console.log(`   Notes: "${stripHtml(r.notes).substring(0, 80)}..."`);
    console.log(`   Feedback: "${stripHtml(r.feedback).substring(0, 100)}..."`);
  });

  return { results: finalResults };
}

async function main() {
  await connectDB();

  // Check how many tickets have notesEmbedding
  const withNotesEmbed = await Ticket.countDocuments({
    status: 'Graded',
    notesEmbedding: { $exists: true, $type: 'array', $not: { $size: 0 } }
  });
  const totalGraded = await Ticket.countDocuments({ status: 'Graded' });
  console.log(`Tickets with notesEmbedding: ${withNotesEmbed}/${totalGraded}\n`);

  // Test cases
  const testCases = [
    'close-ovao tiket nakon rg1 macro-a :/'
  ];

  for (const testNotes of testCases) {
    console.log('='.repeat(80));
    console.log(`TESTING: "${testNotes}"`);
    console.log('='.repeat(80) + '\n');

    await getSimilarFeedbacks(testNotes);
  }

  await mongoose.connection.close();
  console.log('\n✅ Done');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
