/**
 * Script: Add Promotions Knowledge Base
 *
 * Dodaje knowledge za Promotions kategoriju (Pragmatic Drops & Wins, Bonus Drops)
 *
 * Usage: node scripts/addPromotionsKnowledge.js
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const QACategory = require('../models/QACategory');
const Rule = require('../models/Rule');

// Connect to MongoDB
const connectDB = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!mongoUri) {
      throw new Error('MongoDB URI not found in environment variables');
    }
    await mongoose.connect(mongoUri);
    console.log('MongoDB Connected');
  } catch (error) {
    console.error('MongoDB Connection Error:', error.message);
    process.exit(1);
  }
};

// ============================================================================
// CATEGORY DATA
// ============================================================================

const CATEGORY_DATA = {
  name: 'Promotions',
  description: 'Knowledge base for handling promotion-related inquiries including Pragmatic Drops & Wins prizes and Bonus Drops claiming issues.',
  knowledge: `Promotions category covers promotional features and prize-related inquiries.

KEY PROMOTIONS:
1. PRAGMATIC DROPS & WINS - Daily/weekly cash prizes through leaderboard tournaments
2. BONUS DROPS - Promotional bonus codes that users can claim

For both types, proper information gathering is essential before creating Jira cases.`,
  keywords: [
    'promotion', 'drops', 'wins', 'pragmatic', 'bonus', 'prize', 'leaderboard',
    'tournament', 'bonus code', 'claim', 'wagering', 'vip'
  ],
  evaluationCriteria: `When evaluating promotion tickets:
1. Agent gathers all required information before escalating
2. Agent collects screenshots of notifications/errors
3. Agent includes date/time in UTC
4. Agent includes coin pair
5. Agent creates Jira case with complete information`,
  subcategories: [
    {
      name: 'Pragmatic Drops & Wins',
      description: 'Handling inquiries about Pragmatic Drops & Wins prizes',
      knowledge: `Pragmatic's Drops & Wins is a promotion offering daily and weekly cash prizes through leaderboard-style tournaments.

REQUIRED INFORMATION:
1. Screenshot of prize drop notification
2. Date and time (UTC) of prize notification
3. Prize amount (if no screenshot available)
4. Coin pair

After gathering info, open Jira case for Tech Support investigation.`,
      keywords: ['pragmatic', 'drops', 'wins', 'prize', 'leaderboard', 'tournament', 'notification', 'daily', 'weekly'],
      evaluationCriteria: 'Agent collects screenshot, date/time UTC, prize amount, and coin pair before creating Jira case.'
    },
    {
      name: 'Bonus Drops',
      description: 'Handling issues with claiming bonus drop codes',
      knowledge: `Bonus drops are promotional codes users can claim for bonuses.

PROCESS:
1. Verify the bonus code is correct and valid
2. Check if code has been fully claimed or still available
3. Request screenshot of error message
4. Create Jira case if issue persists

VIP HOST ADDITIONAL REQUIREMENTS:
- Bonus drop code
- Screenshot of error message
- Exact time in UTC when user reached out

EXCEPTION: Senior Support may credit bonus for high rollers even if wagering requirements not met.`,
      keywords: ['bonus', 'drop', 'code', 'claim', 'error', 'wagering', 'vip', 'high roller'],
      evaluationCriteria: 'Agent verifies code, checks claim status, requests error screenshot, creates Jira with complete info.'
    }
  ]
};

// ============================================================================
// RULES DATA
// ============================================================================

const RULES_DATA = [
  {
    subcategory: 'Pragmatic Drops & Wins',
    title: 'Pragmatic Drops & Wins - Information Gathering',
    intent: 'Ensure agents collect all required information for Drops & Wins prize inquiries.',
    rule_text: `Pragmatic's Drops & Wins is a promotion feature offering daily and weekly cash prizes through leaderboard-style tournaments.

When a user reaches out regarding these prizes, gather the following BEFORE opening Jira:

REQUIRED INFORMATION:
1. Screenshot of the notification about the prize drop they won
2. Date and time (UTC) they received the prize notification
3. Prize amount (if users cannot provide a screenshot)
4. Coin pair

Once gathered, open Jira case and Tech Support Team will investigate.`,
    steps: [
      { step_number: 1, action: 'Ask for screenshot of prize drop notification' },
      { step_number: 2, action: 'Ask for date and time in UTC when notification was received' },
      { step_number: 3, action: 'If no screenshot, ask for prize amount' },
      { step_number: 4, action: 'Ask for coin pair' },
      { step_number: 5, action: 'Open Jira case with all gathered information' }
    ],
    allowed_actions: ['Request screenshot', 'Request date/time UTC', 'Request prize amount', 'Request coin pair', 'Open Jira'],
    disallowed_actions: ['Open Jira without required information', 'Promise immediate prize credit'],
    tags: ['pragmatic', 'drops_wins', 'prize', 'leaderboard', 'screenshot', 'utc', 'coin_pair', 'jira'],
    severity_default: 'medium',
    evidence_requirements: 'Agent collects: screenshot (or prize amount), date/time UTC, coin pair before Jira case.',
    verification_checks: [
      { check_id: 'SCREENSHOT_REQUESTED', description: 'Agent requested screenshot of notification', required_when: 'Drops & Wins prize inquiry' },
      { check_id: 'UTC_TIME_COLLECTED', description: 'Agent collected date/time in UTC', required_when: 'Drops & Wins prize inquiry' },
      { check_id: 'COIN_PAIR_COLLECTED', description: 'Agent collected coin pair', required_when: 'Drops & Wins prize inquiry' }
    ],
    examples_good: [
      'To investigate your Pragmatic Drops & Wins prize, I\'ll need: a screenshot of the notification you received, the date and time in UTC, and which coin pair you were playing with.',
      'Could you please share: 1) Screenshot of the prize drop notification, 2) When did you receive it (date and time in UTC), 3) Which currency were you playing with?'
    ],
    examples_bad: [
      'Let me check on that prize for you.',
      'I\'ll create a ticket right away.'
    ],
    source_location: { source_name: 'CS-Customer Support x Tech support - Process-050126-012722.pdf', page: 8, section: 'Pragmatic Drops & Wins' }
  },
  {
    subcategory: 'Bonus Drops',
    title: 'Bonus Drops - Verification and Error Handling',
    intent: 'Guide agents through bonus drop verification and error handling process.',
    rule_text: `When a user contacts about issues claiming their bonus drop:

STEP-BY-STEP PROCESS:
1. Verify the Bonus Code - Confirm code is correct and valid
2. Check Claim Status - Determine if code has been fully claimed or still available
3. Request Error Documentation - Ask for full-page screenshot of error message
4. Create Jira Case - If issue persists, include bonus drop code and error screenshot

This ensures proper documentation for investigation.`,
    steps: [
      { step_number: 1, action: 'Verify the bonus code is correct and valid' },
      { step_number: 2, action: 'Check if bonus code has been fully claimed or still available' },
      { step_number: 3, action: 'Request full-page screenshot of error message' },
      { step_number: 4, action: 'If issue persists, create Jira case with code and screenshot' }
    ],
    allowed_actions: ['Verify bonus code', 'Check claim status', 'Request error screenshot', 'Create Jira case'],
    disallowed_actions: ['Skip verification steps', 'Create Jira without error screenshot'],
    tags: ['bonus_drop', 'code', 'verification', 'error', 'screenshot', 'claim', 'jira'],
    severity_default: 'medium',
    evidence_requirements: 'Agent verifies code, checks claim status, requests error screenshot before Jira.',
    verification_checks: [
      { check_id: 'CODE_VERIFIED', description: 'Agent verified bonus code is correct', required_when: 'Bonus drop claim issue' },
      { check_id: 'STATUS_CHECKED', description: 'Agent checked if code is still available', required_when: 'Bonus drop claim issue' },
      { check_id: 'ERROR_SCREENSHOT', description: 'Agent requested error screenshot', required_when: 'Bonus drop claim error' }
    ],
    examples_good: [
      'Let me verify that bonus code for you. Could you confirm the exact code you\'re trying to use? I\'ll also check if it\'s still available.',
      'I\'ve checked and the code is valid and available. Could you please share a full-page screenshot of the error message you\'re receiving when trying to claim it?'
    ],
    examples_bad: [
      'I\'ll report this bonus issue.',
      'The code must be expired.'
    ],
    source_location: { source_name: 'CS-Customer Support x Tech support - Process-050126-012722.pdf', page: 9, section: 'Bonus drops' }
  },
  {
    subcategory: 'Bonus Drops',
    title: 'Bonus Drops - VIP Host Requirements',
    intent: 'Specify additional requirements when VIP Hosts handle bonus drop issues.',
    rule_text: `VIP Hosts handling bonus drop issues must gather additional information BEFORE creating Jira case:

REQUIRED FROM VIP HOSTS:
1. Bonus drop code
2. Screenshot of the error message
3. Exact time in UTC when user reached out via Telegram or email

This additional context helps Tech Support resolve VIP cases more efficiently.`,
    steps: [
      { step_number: 1, action: 'Collect bonus drop code' },
      { step_number: 2, action: 'Collect screenshot of error message' },
      { step_number: 3, action: 'Record exact time in UTC when user contacted (Telegram/email)' },
      { step_number: 4, action: 'Include all information in Jira case' }
    ],
    conditions: [
      {
        if: [{ field: 'agent_type', operator: 'equals', value: 'vip_host' }],
        then: 'Collect bonus code, error screenshot, and exact UTC contact time',
        certainty: 'hard'
      }
    ],
    allowed_actions: ['Collect code', 'Collect screenshot', 'Record UTC contact time', 'Create detailed Jira'],
    disallowed_actions: ['Skip UTC timestamp', 'Create Jira without all VIP requirements'],
    tags: ['bonus_drop', 'vip_host', 'telegram', 'email', 'utc', 'timestamp'],
    severity_default: 'medium',
    evidence_requirements: 'VIP Host collects code, error screenshot, and exact UTC contact time.',
    examples_good: [
      'As a VIP Host, I\'ll need: the bonus code, a screenshot of the error, and the exact time in UTC when you reached out to me about this.',
      'To expedite this, please provide: 1) The bonus code, 2) Error screenshot, 3) What time did you message me about this (I need UTC time)?'
    ],
    examples_bad: [
      'Let me just report this for you.',
      'I\'ll handle it.'
    ],
    source_location: { source_name: 'CS-Customer Support x Tech support - Process-050126-012722.pdf', page: 9, section: 'Bonus drops - VIP Hosts' }
  },
  {
    subcategory: 'Bonus Drops',
    title: 'Bonus Drops - High Roller Exception Handling',
    intent: 'Guide on exceptions for high rollers who didn\'t meet wagering requirements.',
    rule_text: `EXCEPTION CASE:

Even if tech team update indicates user didn't meet wagering requirements for bonus drop:

→ Consult with Senior Support agent
→ Senior Support can consider making exceptions for HIGH ROLLERS
→ Bonus may be credited on a case-by-case basis

This exception process exists to maintain good relations with high-value players.

Note: This is at Senior Support discretion, not automatic.`,
    conditions: [
      {
        if: [
          { field: 'tech_response', operator: 'equals', value: 'wagering_not_met' },
          { field: 'user_type', operator: 'equals', value: 'high_roller' }
        ],
        then: 'Consult Senior Support for possible exception',
        certainty: 'soft'
      }
    ],
    allowed_actions: ['Consult Senior Support', 'Consider exception for high rollers', 'Credit bonus case-by-case'],
    disallowed_actions: ['Automatically deny all cases', 'Credit bonus without Senior approval'],
    tags: ['bonus_drop', 'exception', 'high_roller', 'senior_support', 'wagering', 'case_by_case'],
    severity_default: 'low',
    evidence_requirements: 'Agent consults Senior Support for high roller exceptions when wagering not met.',
    examples_good: [
      'I see the tech team noted wagering wasn\'t met, but let me consult with our senior team given your account status. Please allow me a moment.',
      'While the standard requirement wasn\'t met, I\'m checking with my senior team to see if we can make an exception in your case.'
    ],
    examples_bad: [
      'Sorry, you didn\'t meet requirements, nothing we can do.',
      'I\'ll just credit the bonus for you.'
    ],
    source_location: { source_name: 'CS-Customer Support x Tech support - Process-050126-012722.pdf', page: 9, section: 'Bonus drops - Exception' }
  }
];

// ============================================================================
// MAIN SCRIPT
// ============================================================================

async function addPromotionsKnowledge() {
  console.log('\n==========================================');
  console.log('     PROMOTIONS KNOWLEDGE BUILDER');
  console.log('==========================================\n');

  try {
    // Step 1: Create or update the main category
    console.log('Step 1: Creating/Updating Promotions category...');

    let category = await QACategory.findOne({ name: CATEGORY_DATA.name });

    if (category) {
      console.log('  Category exists, updating...');
      category.description = CATEGORY_DATA.description;
      category.knowledge = CATEGORY_DATA.knowledge;
      category.keywords = CATEGORY_DATA.keywords;
      category.evaluationCriteria = CATEGORY_DATA.evaluationCriteria;
      category.subcategories = CATEGORY_DATA.subcategories;
      category.isActive = true;
      await category.save();
    } else {
      console.log('  Creating new category...');
      category = await QACategory.create({
        name: CATEGORY_DATA.name,
        description: CATEGORY_DATA.description,
        knowledge: CATEGORY_DATA.knowledge,
        keywords: CATEGORY_DATA.keywords,
        evaluationCriteria: CATEGORY_DATA.evaluationCriteria,
        subcategories: CATEGORY_DATA.subcategories,
        isActive: true
      });
    }

    console.log(`  Category "${category.name}" ready with ${category.subcategories.length} subcategories`);

    // Step 2: Create rules
    console.log('\nStep 2: Creating rules...');

    let rulesCreated = 0;
    let rulesUpdated = 0;
    let rulesErrors = [];

    for (const ruleData of RULES_DATA) {
      try {
        const rule_id = Rule.generateRuleId(CATEGORY_DATA.name, ruleData.title);
        let rule = await Rule.findOne({ rule_id });

        const ruleDoc = {
          rule_id,
          category: category._id,
          category_name: CATEGORY_DATA.name,
          subcategory: ruleData.subcategory,
          title: ruleData.title,
          intent: ruleData.intent,
          rule_text: ruleData.rule_text,
          steps: ruleData.steps || [],
          allowed_actions: ruleData.allowed_actions || [],
          disallowed_actions: ruleData.disallowed_actions || [],
          conditions: ruleData.conditions || [],
          exceptions: ruleData.exceptions || [],
          examples_good: ruleData.examples_good || [],
          examples_bad: ruleData.examples_bad || [],
          tags: ruleData.tags || [],
          severity_default: ruleData.severity_default || 'medium',
          evidence_requirements: ruleData.evidence_requirements || '',
          verification_checks: ruleData.verification_checks || [],
          source_location: ruleData.source_location || {},
          isActive: true
        };

        if (rule) {
          Object.assign(rule, ruleDoc);
          await rule.save();
          rulesUpdated++;
          console.log(`  Updated: ${ruleData.title}`);
        } else {
          rule = await Rule.create(ruleDoc);
          rulesCreated++;
          console.log(`  Created: ${ruleData.title}`);
        }
      } catch (error) {
        rulesErrors.push({ title: ruleData.title, error: error.message });
        console.error(`  ERROR: ${ruleData.title} - ${error.message}`);
      }
    }

    // Summary
    console.log('\n==========================================');
    console.log('              SUMMARY');
    console.log('==========================================');
    console.log(`Category: ${CATEGORY_DATA.name}`);
    console.log(`Subcategories: ${category.subcategories.length}`);
    console.log('  - Pragmatic Drops & Wins');
    console.log('  - Bonus Drops');
    console.log(`Rules created: ${rulesCreated}`);
    console.log(`Rules updated: ${rulesUpdated}`);
    console.log(`Total rules: ${RULES_DATA.length}`);
    console.log(`Errors: ${rulesErrors.length}`);

    if (rulesErrors.length > 0) {
      console.log('\nERRORS:');
      rulesErrors.forEach(e => console.log(`  Rule: ${e.title} - ${e.error}`));
    }

    console.log('\n Done!\n');

  } catch (error) {
    console.error('\nFATAL ERROR:', error);
    throw error;
  }
}

// Run
const run = async () => {
  try {
    await connectDB();
    await addPromotionsKnowledge();
    await mongoose.connection.close();
    console.log('Database connection closed.');
    process.exit(0);
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
};

run();
