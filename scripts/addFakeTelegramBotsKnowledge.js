/**
 * Script: Add Fake Telegram Bots Knowledge Base
 *
 * Dodaje knowledge za Fake Telegram Bots proceduru u Security kategoriju
 *
 * Usage: node scripts/addFakeTelegramBotsKnowledge.js
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
// SUBCATEGORY DATA
// ============================================================================

const SUBCATEGORY_DATA = {
  name: 'Fake Telegram Bots',
  description: 'Handling reports of fake Telegram bots and channels impersonating Stake',
  knowledge: `Fake Telegram bots and channels impersonating Stake are common scams.

ONLY OFFICIAL STAKE TELEGRAM BOT: @Stakeminiappbot
Any other bot is FAKE and created with malicious intent.

OFFICIAL STAKE TELEGRAM CHANNELS:
- Main: https://t.me/StakeCasino
- VIP Notices: https://t.me/+v284SVO35m43N2U9
- Daily Drops: https://t.me/StakecomDailyDrops
- Live Challenges: https://t.me/Stakelivechallenges

HOW TO SPOT FAKE CHANNELS:
- Unreasonably good promotions (e.g., 450% deposit bonus with no wager)
- Ask to deposit to address NOT associated with user's account
- Too-good-to-be-true offers are 99% fake

WORKFLOW:
1. ASK FOR THE TELEGRAM LINK FIRST (critical!)
2. Check catalogue if already reported
3. If not reported, open Jira case`,
  keywords: ['telegram', 'fake bot', 'scam', '@Stakeminiappbot', 'fake channel', 'telegram scam'],
  evaluationCriteria: `Agent must:
1. Ask for the Telegram link FIRST before anything else
2. Check catalogue for existing reports (evaluate intuitively based on agent behavior)
3. Open Jira case if new
4. Provide official channel links
5. Explain how to spot fake channels`
};

// ============================================================================
// RULES DATA
// ============================================================================

const RULES_DATA = [
  {
    subcategory: 'Fake Telegram Bots',
    title: 'Fake Telegram Bot - Ask for Link First',
    intent: 'Ensure agents ALWAYS request the Telegram link before providing any response about fake bots.',
    rule_text: `CRITICAL: When user reports a fake Telegram bot or channel, ALWAYS ask for the Telegram link FIRST.

Do NOT send the macro/response until user has forwarded the link.

CORRECT ORDER:
1. User reports fake bot/channel
2. Agent asks: "Could you please share the link to that Telegram channel/bot?"
3. User provides link
4. Agent checks catalogue
5. Agent sends appropriate response

Why this matters:
- Need the link to check if already reported in catalogue
- Need the link to open Jira case if new
- Cannot properly investigate without the actual link`,
    steps: [
      { step_number: 1, action: 'User reports suspicious Telegram bot/channel' },
      { step_number: 2, action: 'ASK FOR THE TELEGRAM LINK FIRST - do not proceed without it' },
      { step_number: 3, action: 'Wait for user to provide the link' },
      { step_number: 4, action: 'Check catalogue if link was already reported' },
      { step_number: 5, action: 'If not reported: Open Jira case' },
      { step_number: 6, action: 'Send response with official channels and safety info' }
    ],
    allowed_actions: ['Ask for Telegram link', 'Check catalogue', 'Open Jira case', 'Provide official channels'],
    disallowed_actions: ['Send macro response before getting link', 'Skip asking for link', 'Skip catalogue check'],
    tags: ['telegram', 'fake_bot', 'link_first', 'catalogue_check', 'jira', 'security'],
    severity_default: 'high',
    evidence_requirements: 'Agent asks for Telegram link BEFORE sending any detailed response about fake bots. Look for agent requesting link in their first or second message.',
    verification_checks: [
      { check_id: 'LINK_REQUESTED_FIRST', description: 'Agent asked for Telegram link before sending detailed response', required_when: 'User reports fake Telegram bot/channel' },
      { check_id: 'CATALOGUE_CHECK_BEHAVIOR', description: 'Agent behavior suggests they checked catalogue (mentions checking, or knows to report new cases)', required_when: 'After receiving Telegram link' }
    ],
    examples_good: [
      'Could you please share the link to that Telegram channel so I can look into this for you?',
      'Before I can help, could you forward me the link to the bot/channel you\'re referring to?',
      'Thank you for reporting this. Can you please provide the Telegram link first?'
    ],
    examples_bad: [
      'The only official Telegram Stake bot is @Stakeminiappbot... [full macro without asking for link]',
      'That sounds like a scam. Here are our official channels... [without getting the link first]',
      'Yes, that\'s fake. [without requesting link or checking catalogue]'
    ],
    source_location: { source_name: 'Fake TG Bot Macro', section: 'Process' }
  },
  {
    subcategory: 'Fake Telegram Bots',
    title: 'Fake Telegram Bot - Catalogue Check Verification',
    intent: 'Ensure agents check catalogue before reporting and AI can intuitively evaluate if this was done.',
    rule_text: `After receiving the Telegram link, agent MUST check the catalogue to see if already reported.

CATALOGUE CHECK INDICATORS (for AI evaluation):
The AI evaluator should look for signs that agent followed the process:

POSITIVE INDICATORS (agent likely checked catalogue):
- Agent mentions "I've checked" or "looking into this"
- Agent confidently states "this has been reported" or "this is a new case"
- Agent mentions opening Jira ticket (suggests they checked and it wasn't there)
- Brief pause/delay between receiving link and responding (checking)
- Agent's response is contextual to the specific link provided

NEGATIVE INDICATORS (agent likely skipped catalogue check):
- Immediate copy-paste macro response after receiving link
- Generic response that doesn't acknowledge the specific bot/channel
- No mention of reporting or checking
- Agent doesn't differentiate between known and new scams

NOTE: AI evaluator cannot access the catalogue directly, so evaluation must be based on agent behavior and response patterns.`,
    conditions: [
      {
        if: [{ field: 'agent_mentions_checking', operator: 'equals', value: true }],
        then: 'Likely followed process - checked catalogue',
        certainty: 'soft'
      },
      {
        if: [{ field: 'agent_mentions_jira_or_reporting', operator: 'equals', value: true }],
        then: 'Likely followed process - new case being reported',
        certainty: 'soft'
      },
      {
        if: [{ field: 'immediate_macro_without_acknowledgment', operator: 'equals', value: true }],
        then: 'Likely skipped catalogue check - potential violation',
        certainty: 'soft'
      }
    ],
    allowed_actions: ['Check catalogue', 'Mention checking', 'Report new cases to Jira'],
    disallowed_actions: ['Skip catalogue check', 'Send generic response without verification'],
    tags: ['telegram', 'catalogue', 'verification', 'jira', 'process_check'],
    severity_default: 'medium',
    evidence_requirements: 'Agent behavior suggests catalogue was checked. Look for: mentions of checking, contextual responses, or Jira ticket creation for new cases.',
    verification_checks: [
      { check_id: 'PROCESS_FOLLOWED', description: 'Agent behavior indicates they followed the check-then-respond process', required_when: 'Telegram link was provided by user' }
    ],
    examples_good: [
      'Thank you for the link. I\'ve checked and this bot hasn\'t been reported yet, so I\'ll open a case with our security team.',
      'I can see this channel has been reported before. Thank you for bringing it to our attention.',
      'Let me look into this link for you... [then contextual response]'
    ],
    examples_bad: [
      '[Immediate macro response without any acknowledgment of the specific link]',
      '[Generic response that could apply to any fake bot report]'
    ],
    source_location: { source_name: 'Fake TG Bot Macro', section: 'Catalogue Check' }
  },
  {
    subcategory: 'Fake Telegram Bots',
    title: 'Official Stake Telegram Channels Reference',
    intent: 'Provide definitive list of official Stake Telegram channels and the only official bot.',
    rule_text: `OFFICIAL STAKE TELEGRAM:

ONLY OFFICIAL BOT: @Stakeminiappbot
Any other bot on Telegram claiming to be Stake is FAKE.

OFFICIAL CHANNELS:
1. Main Telegram: https://t.me/StakeCasino
2. VIP Notices (official): https://t.me/+v284SVO35m43N2U9
3. Daily Drops: https://t.me/StakecomDailyDrops
4. Live Challenges: https://t.me/Stakelivechallenges

Agent should provide these official links when handling fake bot reports to help users find legitimate Stake presence on Telegram.`,
    allowed_actions: ['Share official bot name', 'Share official channel links', 'Confirm other bots are fake'],
    disallowed_actions: ['Share unofficial channels', 'Confirm legitimacy of non-official bots'],
    tags: ['telegram', 'official_channels', '@Stakeminiappbot', 'StakeCasino', 'legitimate'],
    severity_default: 'low',
    evidence_requirements: 'Agent provides correct official Telegram information',
    examples_good: [
      'The only official Stake Telegram bot is @Stakeminiappbot. Here are our official channels: Main: https://t.me/StakeCasino',
      'Any bot other than @Stakeminiappbot is fake. You can find our official Telegram at https://t.me/StakeCasino'
    ],
    examples_bad: [
      'I\'m not sure which bot is official.',
      'That might be one of our bots.'
    ],
    source_location: { source_name: 'Fake TG Bot Macro', section: 'Official Channels' }
  },
  {
    subcategory: 'Fake Telegram Bots',
    title: 'How to Spot Fake Telegram Channels',
    intent: 'Ensure agents educate users on identifying fake Telegram channels.',
    rule_text: `Agents should explain how to identify fake Telegram channels:

RED FLAGS FOR FAKE CHANNELS:
1. Unreasonably good promotions
   - Example: "450% deposit bonus with no wager requirements" is ABSURD
   - No legitimate platform gives 5x deposit with no requirements

2. Deposit requests to external addresses
   - Asking to deposit to address NOT associated with user's account
   - Legitimate Stake will never ask this

3. Too-good-to-be-true offers
   - 99% of these are scams
   - If it seems unrealistic, it probably is

4. Unofficial bot names
   - Only @Stakeminiappbot is real
   - Variations like @StakeBot, @StakeOfficial, etc. are FAKE

5. Found as Telegram ads
   - Scammers often promote via Telegram ads

People create these with malicious intent to steal funds.`,
    allowed_actions: ['Explain red flags', 'Give examples of fake offers', 'Educate users'],
    disallowed_actions: ['Dismiss user concerns', 'Not explain the dangers'],
    tags: ['telegram', 'fake_detection', 'red_flags', 'user_education', 'scam_prevention'],
    severity_default: 'low',
    evidence_requirements: 'Agent explains at least one method to identify fake channels',
    examples_good: [
      'The easiest way to spot fake channels is by their offers. A 450% deposit bonus with no wager requirements is unrealistic - no platform would give almost 5x your deposit with no requirements.',
      'Be wary of any channel asking you to deposit to an address not associated with your Stake account. That\'s a clear sign of a scam.'
    ],
    examples_bad: [
      'Yeah those are fake.',
      'Just be careful out there.'
    ],
    source_location: { source_name: 'Fake TG Bot Macro', section: 'How to Spot Fake' }
  },
  {
    subcategory: 'Fake Telegram Bots',
    title: 'Jira Case for New Fake Telegram Reports',
    intent: 'Ensure new fake Telegram bot/channel reports are escalated via Jira.',
    rule_text: `When a fake Telegram bot/channel is NOT in the catalogue:

ACTION: Open Jira case to report the new scam

Include in Jira:
- The Telegram link/username of the fake bot/channel
- Any screenshots if user provided them
- Brief description of the scam (what they were promoting)

This helps the security team:
- Track and document new scams
- Potentially report to Telegram for takedown
- Update the catalogue for future reference

Do NOT skip Jira reporting for new cases - even if it seems obviously fake.`,
    conditions: [
      {
        if: [{ field: 'in_catalogue', operator: 'equals', value: false }],
        then: 'Open Jira case with Telegram link and details',
        certainty: 'hard'
      },
      {
        if: [{ field: 'in_catalogue', operator: 'equals', value: true }],
        then: 'No need to report again - already in catalogue',
        certainty: 'hard'
      }
    ],
    allowed_actions: ['Open Jira case', 'Document scam details', 'Include Telegram link'],
    disallowed_actions: ['Skip Jira for new cases', 'Assume all cases are already reported'],
    tags: ['telegram', 'jira', 'escalation', 'new_report', 'security_team'],
    severity_default: 'medium',
    evidence_requirements: 'For new cases, agent indicates they will report/open ticket. For known cases, agent acknowledges it\'s already reported.',
    examples_good: [
      'This is a new scam we haven\'t seen before. I\'ll report this to our security team right away.',
      'I\'ve opened a case with our team to investigate and report this fake channel.',
      'This one has already been reported to our security team. Thanks for letting us know though!'
    ],
    examples_bad: [
      '[No mention of reporting for what appears to be a new scam]',
      'Yes that\'s fake, here are the real channels. [without reporting new scam]'
    ],
    source_location: { source_name: 'Fake TG Bot Macro', section: 'Jira Reporting' }
  }
];

// ============================================================================
// MAIN SCRIPT
// ============================================================================

async function addFakeTelegramBotsKnowledge() {
  console.log('\n==========================================');
  console.log('  FAKE TELEGRAM BOTS KNOWLEDGE BUILDER');
  console.log('==========================================\n');

  try {
    // Step 1: Find Security category and add subcategory
    console.log('Step 1: Finding Security category and adding subcategory...');

    let category = await QACategory.findOne({ name: 'Security' });

    if (!category) {
      console.error('  ERROR: Security category not found. Please run addPhishingKnowledge.js first.');
      process.exit(1);
    }

    // Check if subcategory exists, if not add it
    const existingSubcat = category.subcategories.find(s => s.name === 'Fake Telegram Bots');
    if (existingSubcat) {
      console.log('  Subcategory exists, updating...');
      Object.assign(existingSubcat, SUBCATEGORY_DATA);
    } else {
      console.log('  Adding new subcategory...');
      category.subcategories.push(SUBCATEGORY_DATA);
    }

    await category.save();
    console.log(`  Category "${category.name}" now has ${category.subcategories.length} subcategories`);

    // Step 2: Create rules
    console.log('\nStep 2: Creating rules...');

    let rulesCreated = 0;
    let rulesUpdated = 0;
    let rulesErrors = [];

    for (const ruleData of RULES_DATA) {
      try {
        const rule_id = Rule.generateRuleId('Security', ruleData.title);
        let rule = await Rule.findOne({ rule_id });

        const ruleDoc = {
          rule_id,
          category: category._id,
          category_name: 'Security',
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
    console.log(`Category: Security`);
    console.log(`New Subcategory: Fake Telegram Bots`);
    console.log(`Rules created: ${rulesCreated}`);
    console.log(`Rules updated: ${rulesUpdated}`);
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
    await addFakeTelegramBotsKnowledge();
    await mongoose.connection.close();
    console.log('Database connection closed.');
    process.exit(0);
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
};

run();
