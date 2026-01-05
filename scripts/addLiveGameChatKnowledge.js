/**
 * Script: Add Live Game Chat Knowledge Base
 *
 * SEPARATE kategorija za Evolution/Pragmatic mute i username change
 * (odvojeno od Games kategorije da bi AI razlikovao od buduceg "Stake chat mute")
 *
 * Usage: node scripts/addLiveGameChatKnowledge.js
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
  name: 'Live Game Chat',
  description: 'Handling chat-related issues in live casino games: Evolution Gaming mutes, Pragmatic Play mutes, and Evolution username changes. NOT related to Stake website chat.',
  knowledge: `Live Game Chat category handles chat features WITHIN live casino games (Evolution, Pragmatic Play).

IMPORTANT DISTINCTION:
- This is for LIVE GAME chat (Evolution/Pragmatic in-game chat with dealers and other players)
- This is NOT for Stake website chat/community chat
- Future "Stake chat mute" will be a DIFFERENT category

KEY PROCEDURES:
1. EVOLUTION MUTE - Refer to Evolution mute guide, process via Jira
2. PRAGMATIC MUTE - Create Jira case regardless of wager/VIP rank, include coin pair
3. EVOLUTION USERNAME CHANGE - Only for Platinum IV+ VIP, requires coin pair and desired username`,
  keywords: [
    'live game chat', 'evolution mute', 'pragmatic mute', 'muted', 'chat mute',
    'username change', 'in-game chat', 'dealer chat', 'evolution gaming', 'pragmatic play',
    'chat guidelines', 'unmute', 'coin pair'
  ],
  evaluationCriteria: `When evaluating live game chat tickets:
1. Agent correctly identifies this is about LIVE GAME chat, not Stake chat
2. Agent follows correct procedure for each provider (Evolution vs Pragmatic)
3. Agent collects coin pair for all mute cases
4. Agent verifies VIP status (Platinum IV+) for username changes
5. Agent creates Jira case with required information`,
  subcategories: [
    {
      name: 'Evolution Mute',
      description: 'Handling Evolution Gaming live chat mutes',
      knowledge: `Evolution Gaming provides live games with chat feature allowing players to interact with other players and game presenters.

Users who do not follow Evolution's chat guidelines may be muted and unable to participate in chat.

PROCEDURE:
1. User reports being muted in Evolution live game chat
2. Refer to Evolution mute guide for how to proceed
3. Create Jira case with coin pair information

Note: This is Evolution's chat policy, not Stake's. Mutes are applied by Evolution for guideline violations.`,
      keywords: ['evolution', 'mute', 'chat', 'live game', 'guideline', 'presenter', 'unmute'],
      evaluationCriteria: 'Agent identifies Evolution mute, follows Evolution mute guide, includes coin pair in Jira.'
    },
    {
      name: 'Pragmatic Mute',
      description: 'Handling Pragmatic Play live chat mutes',
      knowledge: `Pragmatic Play provides live chat feature in their live games for users to interact with each other and game presenters.

Pragmatic Play enforces strict chat guidelines. Players who breach rules may be muted for a set duration.

PROCEDURE:
1. User contacts Support about Pragmatic mute
2. Create Jira case REGARDLESS of wager amount or VIP rank
3. Include the COIN PAIR in which they were muted
4. Tech team will review and remove mute if appropriate

Important: Unlike some other processes, Pragmatic mute cases are opened for ALL users regardless of status.`,
      keywords: ['pragmatic', 'mute', 'chat', 'live game', 'guideline', 'unmute', 'coin pair'],
      evaluationCriteria: 'Agent creates Jira case for ANY user regardless of VIP status. Includes coin pair.'
    },
    {
      name: 'Evolution Username Change',
      description: 'Evolution Gaming username change requests (Platinum IV+ only)',
      knowledge: `Evolution does NOT support self-service username changes. Tech Support assists with this request.

ELIGIBILITY: Platinum IV VIP status or HIGHER only.

REQUIRED INFORMATION:
1. Coin pair associated with the username change request
2. Desired username

PROCESS:
1. Verify user is Platinum IV+ VIP
2. Collect coin pair and desired username
3. Submit Jira ticket
4. Tech Support processes the request`,
      keywords: ['evolution', 'username', 'change', 'platinum', 'vip', 'coin pair'],
      evaluationCriteria: 'Agent verifies Platinum IV+ status. Collects coin pair and desired username. Creates Jira ticket.'
    }
  ]
};

// ============================================================================
// RULES DATA
// ============================================================================

const RULES_DATA = [
  {
    subcategory: 'Evolution Mute',
    title: 'Evolution Mute - Handling Procedure',
    intent: 'Guide agents on handling Evolution Gaming chat mute requests.',
    rule_text: `Evolution Gaming provides live games with chat features allowing players to interact with other players and game presenters.

Users who do not follow Evolution's chat guidelines may be muted and unable to participate in chat.

WHEN USER REPORTS EVOLUTION MUTE:
1. Acknowledge their mute issue
2. Refer to the Evolution mute guide for procedure
3. Collect the coin pair where they were muted
4. Create appropriate case based on Evolution mute guide

Note: Evolution enforces their own chat guidelines. Mutes are applied by Evolution for their terms violations, not by Stake.`,
    steps: [
      { step_number: 1, action: 'Acknowledge the user\'s mute report' },
      { step_number: 2, action: 'Refer to Evolution mute guide for specific procedure' },
      { step_number: 3, action: 'Collect the coin pair where mute occurred' },
      { step_number: 4, action: 'Follow Evolution mute guide procedure' }
    ],
    allowed_actions: ['Acknowledge mute', 'Follow Evolution mute guide', 'Collect coin pair', 'Create case as per guide'],
    disallowed_actions: ['Immediately promise unmute', 'Skip coin pair collection', 'Blame user without explanation'],
    tags: ['evolution', 'mute', 'chat', 'live_game_chat', 'guidelines', 'coin_pair'],
    severity_default: 'medium',
    evidence_requirements: 'Agent follows Evolution mute guide procedure. Collects coin pair.',
    verification_checks: [
      { check_id: 'COIN_PAIR_COLLECTED', description: 'Agent collected coin pair for muted account', required_when: 'User reports Evolution mute' },
      { check_id: 'GUIDE_FOLLOWED', description: 'Agent followed Evolution mute guide procedure', required_when: 'Evolution mute case' }
    ],
    examples_good: [
      'I understand you\'ve been muted in the Evolution live game chat. Could you tell me which coin pair (currency) you were playing with when this happened? I\'ll follow our procedure to look into this.',
      'Evolution Gaming has their own chat guidelines, and mutes are applied for violations. Let me get some details - which coin pair was this on? I\'ll create a case to review this.'
    ],
    examples_bad: [
      'I\'ll unmute you right away.',
      'That\'s Evolution\'s problem, nothing we can do.'
    ],
    source_location: { source_name: 'CS-Customer Support x Tech support - Process-050126-012722.pdf', page: 8, section: 'Evolution mute' }
  },
  {
    subcategory: 'Pragmatic Mute',
    title: 'Pragmatic Mute - Create Jira for All Users',
    intent: 'Ensure Pragmatic mute cases are opened for all users regardless of status.',
    rule_text: `Pragmatic Play provides live chat in their live games for user interaction with other players and presenters.

To maintain a friendly environment, Pragmatic Play enforces strict chat guidelines. Players who breach these rules may be muted for a set duration.

PROCEDURE:
1. User contacts Support regarding a mute
2. Create Jira case REGARDLESS of wager amount or VIP rank
3. Include the COIN PAIR in which they were muted
4. Tech team reviews and removes mute if possible based on findings

IMPORTANT: This applies to ALL users - do not skip based on VIP status or wager amount.`,
    steps: [
      { step_number: 1, action: 'Acknowledge the Pragmatic mute report' },
      { step_number: 2, action: 'Collect the coin pair where mute occurred' },
      { step_number: 3, action: 'Create Jira case (regardless of user status)' },
      { step_number: 4, action: 'Inform user that Tech team will review' }
    ],
    conditions: [
      {
        if: [{ field: 'issue_type', operator: 'equals', value: 'pragmatic_mute' }],
        then: 'Create Jira case regardless of VIP status or wager amount',
        certainty: 'hard'
      }
    ],
    allowed_actions: ['Create Jira case for any user', 'Collect coin pair', 'Inform about Tech team review'],
    disallowed_actions: ['Decline to help based on VIP status', 'Skip Jira case', 'Forget coin pair'],
    tags: ['pragmatic', 'mute', 'chat', 'live_game_chat', 'jira', 'all_users', 'coin_pair'],
    severity_default: 'medium',
    evidence_requirements: 'Agent creates Jira case for any user, regardless of status. Includes coin pair.',
    verification_checks: [
      { check_id: 'JIRA_CREATED', description: 'Agent created Jira case for Pragmatic mute', required_when: 'User reports Pragmatic mute' },
      { check_id: 'COIN_PAIR_INCLUDED', description: 'Jira case includes coin pair', required_when: 'Pragmatic mute case' },
      { check_id: 'NO_STATUS_DISCRIMINATION', description: 'Agent did not decline based on VIP/wager status', required_when: 'Any Pragmatic mute request' }
    ],
    examples_good: [
      'I\'ll create a ticket for our tech team to review your Pragmatic mute. Which coin pair were you playing with when you were muted?',
      'Regardless of your account status, I can submit this for review. Please provide the coin pair where you experienced the mute, and I\'ll create a case right away.'
    ],
    examples_bad: [
      'Sorry, we only help VIP players with this.',
      'Your wager amount isn\'t high enough for us to look into this.'
    ],
    source_location: { source_name: 'CS-Customer Support x Tech support - Process-050126-012722.pdf', page: 8, section: 'Pragmatic mute' }
  },
  {
    subcategory: 'Evolution Username Change',
    title: 'Evolution Username Change - Platinum IV+ Only',
    intent: 'Process Evolution username changes only for eligible VIP users.',
    rule_text: `Evolution does NOT support self-service username changes. Tech Support assists with this request.

ELIGIBILITY REQUIREMENT:
- Customer must be Platinum IV VIP status or HIGHER
- Do NOT process for users below Platinum IV

REQUIRED INFORMATION:
1. Coin pair associated with the username change request
2. Desired username

PROCESS:
1. Verify user VIP status (must be Platinum IV+)
2. If not eligible, politely explain the requirement
3. If eligible, collect coin pair and desired username
4. Submit Jira ticket
5. Tech Support processes the request`,
    steps: [
      { step_number: 1, action: 'Verify user\'s VIP status is Platinum IV or higher' },
      { step_number: 2, action: 'If not eligible, explain Platinum IV+ requirement politely' },
      { step_number: 3, action: 'If eligible, collect coin pair for the request' },
      { step_number: 4, action: 'Collect desired username from user' },
      { step_number: 5, action: 'Submit Jira ticket with coin pair and desired username' }
    ],
    conditions: [
      {
        if: [{ field: 'vip_status', operator: 'in', value: ['platinum_iv', 'platinum_v', 'diamond', 'obsidian'] }],
        then: 'Process username change request',
        certainty: 'hard'
      },
      {
        if: [{ field: 'vip_status', operator: 'not_in', value: ['platinum_iv', 'platinum_v', 'diamond', 'obsidian'] }],
        then: 'Decline and explain Platinum IV+ requirement',
        certainty: 'hard'
      }
    ],
    allowed_actions: ['Verify VIP status', 'Collect coin pair', 'Collect desired username', 'Create Jira ticket', 'Politely decline if not eligible'],
    disallowed_actions: ['Process for ineligible users', 'Skip VIP verification', 'Forget to collect coin pair'],
    tags: ['evolution', 'username_change', 'platinum', 'vip', 'coin_pair', 'jira'],
    severity_default: 'low',
    evidence_requirements: 'Agent verifies Platinum IV+ status. Collects coin pair and desired username. Creates Jira or politely declines.',
    verification_checks: [
      { check_id: 'VIP_VERIFIED', description: 'Agent verified user VIP status', required_when: 'Username change request' },
      { check_id: 'ELIGIBILITY_CHECKED', description: 'Agent confirmed Platinum IV+ status before processing', required_when: 'Username change request' },
      { check_id: 'INFO_COLLECTED', description: 'Agent collected coin pair and desired username', required_when: 'Eligible username change' }
    ],
    examples_good: [
      'I\'d be happy to help with your Evolution username change. I can see you\'re a Platinum IV member. Could you please provide the coin pair and your desired new username?',
      'Thank you for reaching out about an Evolution username change. This feature is available for Platinum IV VIP members and above. Let me check your status...',
      'I appreciate your interest, but Evolution username changes are currently only available for Platinum IV VIP status and higher. Once you reach that level, we\'d be glad to assist!'
    ],
    examples_bad: [
      'Sure, I\'ll change your username right away.',
      'You\'re not VIP enough, sorry.'
    ],
    source_location: { source_name: 'CS-Customer Support x Tech support - Process-050126-012722.pdf', page: 8, section: 'Evolution Username Change Process' }
  },
  {
    subcategory: 'Evolution Mute',
    title: 'Live Game Chat vs Stake Chat - Distinction',
    intent: 'Ensure agents distinguish between live game chat and Stake platform chat.',
    rule_text: `IMPORTANT DISTINCTION:

LIVE GAME CHAT (this category):
- Chat WITHIN Evolution or Pragmatic live games
- Interaction with dealers and other players at the table
- Managed by Evolution/Pragmatic, not Stake
- Mutes applied by game providers for their guidelines

STAKE CHAT (different category - future):
- Stake website community chat
- Stake platform chat features
- Managed by Stake directly

When user mentions being muted, CLARIFY which chat they mean:
- "Were you muted in a live casino game (like Blackjack or Crazy Time) or in Stake's website chat?"

This distinction is critical for correct routing and handling.`,
    allowed_actions: ['Clarify which chat type', 'Route to correct procedure', 'Explain difference if needed'],
    disallowed_actions: ['Assume chat type without asking', 'Mix up procedures'],
    tags: ['live_game_chat', 'stake_chat', 'distinction', 'clarification', 'routing'],
    severity_default: 'medium',
    evidence_requirements: 'Agent clarifies whether mute is in live game chat or Stake platform chat before proceeding.',
    examples_good: [
      'Just to make sure I help you correctly - were you muted in a live casino game (like Evolution Blackjack or Pragmatic Roulette) or in Stake\'s website chat?',
      'I want to direct you to the right team. Is this mute in the chat during live games with dealers, or in Stake\'s community/website chat?'
    ],
    examples_bad: [
      'I\'ll handle your mute request.',
      'Let me unmute you.'
    ],
    source_location: { source_name: 'Internal guideline', page: 0, section: 'Chat distinction' }
  }
];

// ============================================================================
// MAIN SCRIPT
// ============================================================================

async function addLiveGameChatKnowledge() {
  console.log('\n==========================================');
  console.log('    LIVE GAME CHAT KNOWLEDGE BUILDER');
  console.log('    (SEPARATE from future Stake chat)');
  console.log('==========================================\n');

  try {
    // Step 1: Create or update the main category
    console.log('Step 1: Creating/Updating Live Game Chat category...');

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
    console.log('  - Evolution Mute');
    console.log('  - Pragmatic Mute');
    console.log('  - Evolution Username Change');
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
    await addLiveGameChatKnowledge();
    await mongoose.connection.close();
    console.log('Database connection closed.');
    process.exit(0);
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
};

run();
