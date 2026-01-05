/**
 * Script: Add Transactions Knowledge Base
 *
 * Dodaje knowledge za Transactions kategoriju (Deposit/Withdrawal, Rollover Completion)
 *
 * Usage: node scripts/addTransactionsKnowledge.js
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
  name: 'Transactions',
  description: 'Knowledge base for handling deposit/withdrawal issues and rollover completion cases.',
  knowledge: `Transactions category covers:
1. DEPOSIT ISSUES - Deposits not credited to account
2. WITHDRAWAL ISSUES - Failed withdrawals not refunded
3. ROLLOVER COMPLETION - Cases when user completes rollover and attempts to withdraw

KEY INFORMATION TO GATHER:
- Piq ID or transaction hash (for crypto)
- Exact amount
- Time and date in UTC

All transaction issues should be escalated via Jira with complete information.`,
  keywords: [
    'deposit', 'withdrawal', 'transaction', 'piq', 'hash', 'crypto', 'refund',
    'not credited', 'failed', 'rollover', 'manual', 'pending', 'abuse', 'verification'
  ],
  evaluationCriteria: `When evaluating transaction tickets:
1. Agent gathers Piq ID or transaction hash
2. Agent collects exact amount
3. Agent records time/date in UTC
4. Agent creates Jira with complete information
5. Agent follows correct procedure for rollover cases`,
  subcategories: [
    {
      name: 'Deposit/Withdrawal Issues',
      description: 'Handling deposits not credited and failed withdrawals not refunded',
      knowledge: `When users claim deposit not credited or failed withdrawal not refunded:

REQUIRED INFORMATION:
1. Piq ID or transaction hash (for crypto)
2. Exact amount involved
3. Time and date of transaction in UTC

ACTION: Open Jira case with all details to double-check transaction status.`,
      keywords: ['deposit', 'withdrawal', 'not_credited', 'failed', 'refund', 'piq_id', 'hash', 'utc'],
      evaluationCriteria: 'Agent collects Piq ID/hash, exact amount, and UTC time before creating Jira.'
    },
    {
      name: 'Rollover Completion Cases',
      description: 'Handling cases when users complete rollover requirements and attempt withdrawal',
      knowledge: `When user completes rollover (spending balance or reaching 100%):

NORMAL PROCESS:
- Account reviewed automatically
- Legitimate = withdrawal processed
- Abuse detected = suspended for Level 4 verification

SPECIAL CASES:
- Extended pending withdrawal → Create Jira
- Withdrawal in crypto without rollover in that currency → Create Jira
- Manual status withdrawal → Create Jira to investigate
- Rollover disabled showing 0.00% → Create Jira

All cases need: user ID, withdrawal amount, relevant logs.`,
      keywords: ['rollover', 'completion', 'withdrawal', 'abuse', 'verification', 'level4', 'manual', 'pending', 'disabled'],
      evaluationCriteria: 'Agent follows correct procedure based on specific rollover situation. Creates Jira with required info.'
    }
  ]
};

// ============================================================================
// RULES DATA
// ============================================================================

const RULES_DATA = [
  // ==================== DEPOSIT/WITHDRAWAL ====================
  {
    subcategory: 'Deposit/Withdrawal Issues',
    title: 'Deposit Not Credited - Information Gathering',
    intent: 'Ensure agents collect all required information for deposit issues.',
    rule_text: `When users claim their deposit hasn't been credited to their account:

GATHER THE FOLLOWING:
1. Piq ID or Transaction Hash (for cryptocurrency)
2. Exact amount involved
3. Time and date of transaction in UTC

THEN: Open Jira case to double-check the transaction status. Include ALL the gathered details in the Jira case.

This ensures proper investigation of deposit issues.`,
    steps: [
      { step_number: 1, action: 'Ask for Piq ID or transaction hash (crypto)' },
      { step_number: 2, action: 'Ask for exact amount' },
      { step_number: 3, action: 'Ask for time and date in UTC' },
      { step_number: 4, action: 'Create Jira case with all information' }
    ],
    allowed_actions: ['Request Piq ID/hash', 'Request amount', 'Request UTC timestamp', 'Create Jira'],
    disallowed_actions: ['Create Jira without transaction details', 'Promise immediate credit'],
    tags: ['deposit', 'not_credited', 'piq_id', 'transaction_hash', 'crypto', 'utc', 'jira'],
    severity_default: 'high',
    evidence_requirements: 'Agent collects Piq ID/hash, exact amount, and UTC time before Jira.',
    verification_checks: [
      { check_id: 'PIQ_OR_HASH', description: 'Agent collected Piq ID or transaction hash', required_when: 'Deposit not credited' },
      { check_id: 'AMOUNT_COLLECTED', description: 'Agent collected exact amount', required_when: 'Deposit not credited' },
      { check_id: 'UTC_COLLECTED', description: 'Agent collected time/date in UTC', required_when: 'Deposit not credited' }
    ],
    examples_good: [
      'I\'ll investigate this deposit for you. Could you provide the Piq ID or transaction hash (if crypto), the exact amount, and when you made the deposit (time and date in UTC)?',
      'To look into your missing deposit, I need: 1) Transaction hash or Piq ID, 2) Exact amount deposited, 3) Date and time in UTC timezone.'
    ],
    examples_bad: [
      'Let me check on that deposit.',
      'I\'ll report this to our team.'
    ],
    source_location: { source_name: 'CS-Customer Support x Tech support - Process-050126-012722.pdf', page: 11, section: 'Deposit/withdrawal issues' }
  },
  {
    subcategory: 'Deposit/Withdrawal Issues',
    title: 'Failed Withdrawal Not Refunded - Information Gathering',
    intent: 'Ensure agents collect all required information for failed withdrawal refund issues.',
    rule_text: `When users claim a failed withdrawal hasn't been refunded:

GATHER THE FOLLOWING:
1. Piq ID or Transaction Hash (for cryptocurrency)
2. Exact amount involved
3. Time and date of transaction in UTC

THEN: Open Jira case to double-check the transaction status. Include ALL the gathered details in the Jira case.

This ensures proper investigation of refund issues.`,
    steps: [
      { step_number: 1, action: 'Ask for Piq ID or transaction hash (crypto)' },
      { step_number: 2, action: 'Ask for exact amount' },
      { step_number: 3, action: 'Ask for time and date in UTC' },
      { step_number: 4, action: 'Create Jira case with all information' }
    ],
    allowed_actions: ['Request Piq ID/hash', 'Request amount', 'Request UTC timestamp', 'Create Jira'],
    disallowed_actions: ['Create Jira without transaction details', 'Promise immediate refund'],
    tags: ['withdrawal', 'failed', 'refund', 'piq_id', 'transaction_hash', 'crypto', 'utc', 'jira'],
    severity_default: 'high',
    evidence_requirements: 'Agent collects Piq ID/hash, exact amount, and UTC time before Jira.',
    verification_checks: [
      { check_id: 'PIQ_OR_HASH', description: 'Agent collected Piq ID or transaction hash', required_when: 'Failed withdrawal refund' },
      { check_id: 'AMOUNT_COLLECTED', description: 'Agent collected exact amount', required_when: 'Failed withdrawal refund' },
      { check_id: 'UTC_COLLECTED', description: 'Agent collected time/date in UTC', required_when: 'Failed withdrawal refund' }
    ],
    examples_good: [
      'I\'ll check on this failed withdrawal for you. Please provide: the Piq ID or transaction hash, the exact amount, and when the withdrawal was attempted (time and date in UTC).',
      'To investigate the missing refund, I\'ll need: 1) Transaction ID or hash, 2) Withdrawal amount, 3) When this happened in UTC.'
    ],
    examples_bad: [
      'I\'ll look into that refund.',
      'Let me report this.'
    ],
    source_location: { source_name: 'CS-Customer Support x Tech support - Process-050126-012722.pdf', page: 11, section: 'Deposit/withdrawal issues' }
  },

  // ==================== ROLLOVER COMPLETION ====================
  {
    subcategory: 'Rollover Completion Cases',
    title: 'Rollover Completion - Standard Process',
    intent: 'Explain the automatic process when users complete rollover.',
    rule_text: `When a user completes their rollover requirement (spending entire balance OR reaching 100%):

AUTOMATIC PROCESS:
1. User attempts to withdraw
2. Case is automatically flagged in Slack channel
3. Account is reviewed

IF LEGITIMATE:
- Withdrawal processed accordingly

IF ABUSE DETECTED:
- User suspended
- Required to complete Level 4 verification before proceeding

This is automatic - no immediate agent action required unless issues arise.`,
    conditions: [
      {
        if: [{ field: 'account_review', operator: 'equals', value: 'legitimate' }],
        then: 'Withdrawal processed automatically',
        certainty: 'hard'
      },
      {
        if: [{ field: 'account_review', operator: 'equals', value: 'abuse_detected' }],
        then: 'User suspended for Level 4 verification',
        certainty: 'hard'
      }
    ],
    allowed_actions: ['Explain automatic process', 'Guide suspended users to Level 4 verification'],
    disallowed_actions: ['Manually approve suspicious withdrawals', 'Skip verification process'],
    tags: ['rollover', 'completion', 'automatic', 'review', 'abuse', 'level4', 'verification'],
    severity_default: 'medium',
    evidence_requirements: 'Agent explains automatic review process correctly.',
    examples_good: [
      'After completing your rollover, your account is automatically reviewed. If everything looks good, the withdrawal will be processed. I can see your status - let me check what\'s happening.',
      'When you complete the rollover requirement, the system automatically reviews the account. If any concerns are flagged, you may need to complete additional verification.'
    ],
    examples_bad: [
      'I\'ll approve your withdrawal now.',
      'Just complete the rollover and you can withdraw.'
    ],
    source_location: { source_name: 'CS-Customer Support x Tech support - Process-050126-012722.pdf', page: 12, section: 'Rollover Completion Cases' }
  },
  {
    subcategory: 'Rollover Completion Cases',
    title: 'Rollover - User Flagged for Abuse (Level 4 Verification)',
    intent: 'Handle users flagged for potential abuse who need Level 4 verification.',
    rule_text: `If a user is flagged for potential abuse and suspended:

PROCESS:
1. User must complete Level 4 verification
2. Once verified, Customer Support can escalate to Tech Support for further action
3. Tech Support will take appropriate action

Explain the verification requirement clearly to the user and guide them through the process.`,
    steps: [
      { step_number: 1, action: 'Inform user they need Level 4 verification' },
      { step_number: 2, action: 'Guide user through verification process' },
      { step_number: 3, action: 'Once verified, escalate to Tech Support via Jira' },
      { step_number: 4, action: 'Tech Support processes the case' }
    ],
    conditions: [
      {
        if: [{ field: 'user_status', operator: 'equals', value: 'flagged_abuse' }],
        then: 'Require Level 4 verification',
        certainty: 'hard'
      }
    ],
    allowed_actions: ['Require Level 4 verification', 'Guide through verification', 'Escalate after verification'],
    disallowed_actions: ['Skip verification', 'Process withdrawal before verification'],
    tags: ['rollover', 'abuse', 'flagged', 'level4', 'verification', 'suspended', 'escalation'],
    severity_default: 'high',
    evidence_requirements: 'Agent requires Level 4 verification before escalating flagged accounts.',
    examples_good: [
      'Your account has been flagged for additional review. To proceed, you\'ll need to complete Level 4 verification. Once that\'s done, I can escalate your case to our technical team.',
      'I see your account requires Level 4 verification before we can process the withdrawal. Let me guide you through what you\'ll need to submit.'
    ],
    examples_bad: [
      'I\'ll just process your withdrawal.',
      'The flag is probably a mistake, let me remove it.'
    ],
    source_location: { source_name: 'CS-Customer Support x Tech support - Process-050126-012722.pdf', page: 12, section: 'Rollover Completion Cases - Point 2' }
  },
  {
    subcategory: 'Rollover Completion Cases',
    title: 'Rollover - Extended Pending Withdrawal',
    intent: 'Handle withdrawals pending for extended period after rollover completion.',
    rule_text: `If a user's withdrawal remains PENDING for an extended period after completing rollover:

ACTION:
- Customer Support should create a Jira case
- Tech Support team will investigate
- Take necessary action as per procedure

Include: User ID, withdrawal amount, relevant logs in the Jira case.`,
    conditions: [
      {
        if: [
          { field: 'rollover_status', operator: 'equals', value: 'completed' },
          { field: 'withdrawal_status', operator: 'equals', value: 'pending_extended' }
        ],
        then: 'Create Jira case for investigation',
        certainty: 'hard'
      }
    ],
    allowed_actions: ['Create Jira case', 'Include user ID and withdrawal amount', 'Include relevant logs'],
    disallowed_actions: ['Tell user to just wait', 'Skip Jira case'],
    tags: ['rollover', 'pending', 'extended', 'withdrawal', 'jira', 'investigation'],
    severity_default: 'medium',
    evidence_requirements: 'Agent creates Jira case with user ID, amount, and logs for extended pending withdrawals.',
    examples_good: [
      'I see your withdrawal has been pending for a while after completing the rollover. Let me create a case with our technical team to investigate why this is taking longer than expected.',
      'Since your rollover is complete but the withdrawal is still pending, I\'ll open a ticket for our tech team to look into. I\'ll include your user ID and withdrawal details.'
    ],
    examples_bad: [
      'Just wait, it should process eventually.',
      'I\'m not sure why it\'s pending, try again later.'
    ],
    source_location: { source_name: 'CS-Customer Support x Tech support - Process-050126-012722.pdf', page: 12, section: 'Rollover Completion Cases - Point 3' }
  },
  {
    subcategory: 'Rollover Completion Cases',
    title: 'Rollover - Crypto Withdrawal Without Currency Rollover',
    intent: 'Handle crypto withdrawals when no rollover exists in that currency.',
    rule_text: `If a user requests a withdrawal in cryptocurrency but has NO rollover requirement in that currency:

ACTION:
- Customer Support should create a Jira case
- This is an unusual situation requiring investigation

Include: User ID, withdrawal amount, cryptocurrency requested, relevant logs.`,
    conditions: [
      {
        if: [
          { field: 'withdrawal_type', operator: 'equals', value: 'crypto' },
          { field: 'rollover_in_currency', operator: 'equals', value: false }
        ],
        then: 'Create Jira case',
        certainty: 'hard'
      }
    ],
    allowed_actions: ['Create Jira case', 'Include crypto type requested', 'Include user details'],
    disallowed_actions: ['Process without investigation', 'Ignore mismatch'],
    tags: ['rollover', 'crypto', 'currency', 'mismatch', 'withdrawal', 'jira'],
    severity_default: 'medium',
    evidence_requirements: 'Agent creates Jira case when crypto withdrawal has no rollover in that currency.',
    examples_good: [
      'I notice you\'re requesting a withdrawal in BTC but there\'s no rollover requirement in that currency. Let me create a case for our technical team to review this.',
      'This is an unusual situation - you\'re withdrawing in a currency that doesn\'t have an associated rollover. I\'ll need to open a ticket for investigation.'
    ],
    examples_bad: [
      'Go ahead and withdraw in whatever currency.',
      'That shouldn\'t matter, try again.'
    ],
    source_location: { source_name: 'CS-Customer Support x Tech support - Process-050126-012722.pdf', page: 12, section: 'Rollover Completion Cases - Point 4' }
  },
  {
    subcategory: 'Rollover Completion Cases',
    title: 'Rollover - Manual Status Withdrawal',
    intent: 'Handle withdrawals set to manual status.',
    rule_text: `If a user's withdrawal is set to 'MANUAL' status:

ACTION:
- Customer Support should contact Tech Support via Jira case
- Investigation needed to determine if status should be changed
- Do NOT promise the user it will be changed

Include: User ID, withdrawal details, current status information.`,
    conditions: [
      {
        if: [{ field: 'withdrawal_status', operator: 'equals', value: 'manual' }],
        then: 'Create Jira case to investigate if status should change',
        certainty: 'hard'
      }
    ],
    allowed_actions: ['Create Jira case', 'Request investigation', 'Inform user of review'],
    disallowed_actions: ['Promise status change', 'Change status without authorization'],
    tags: ['rollover', 'manual', 'status', 'withdrawal', 'jira', 'investigation'],
    severity_default: 'medium',
    evidence_requirements: 'Agent creates Jira to investigate manual status withdrawals.',
    examples_good: [
      'I see your withdrawal is in manual status. Let me create a case with our technical team to review whether this status should be updated.',
      'Manual status withdrawals require review. I\'ll open a ticket for investigation - please note I can\'t guarantee the outcome.'
    ],
    examples_bad: [
      'I\'ll change that to automatic for you.',
      'Manual status is fine, just wait.'
    ],
    source_location: { source_name: 'CS-Customer Support x Tech support - Process-050126-012722.pdf', page: 12, section: 'Rollover Completion Cases - Point 5' }
  },
  {
    subcategory: 'Rollover Completion Cases',
    title: 'Rollover - Disabled Showing 0.00%',
    intent: 'Handle cases where rollover is disabled after being enabled and shows 0.00% progress.',
    rule_text: `If a user's rollover is DISABLED after being ENABLED and shows 0.00% progress:

ACTION:
- Customer Support should create a Jira case
- This indicates an anomaly requiring investigation

Include: User ID, rollover history, relevant logs.`,
    conditions: [
      {
        if: [
          { field: 'rollover_previous', operator: 'equals', value: 'enabled' },
          { field: 'rollover_current', operator: 'equals', value: 'disabled' },
          { field: 'rollover_progress', operator: 'equals', value: '0.00%' }
        ],
        then: 'Create Jira case for investigation',
        certainty: 'hard'
      }
    ],
    allowed_actions: ['Create Jira case', 'Report anomaly', 'Include rollover history'],
    disallowed_actions: ['Ignore anomaly', 'Tell user rollover is complete'],
    tags: ['rollover', 'disabled', 'zero_progress', 'anomaly', 'jira', 'investigation'],
    severity_default: 'medium',
    evidence_requirements: 'Agent creates Jira for rollover showing disabled at 0.00% after being enabled.',
    examples_good: [
      'I notice your rollover was enabled but is now showing as disabled at 0.00%. This is unusual and I\'ll need to create a case for our technical team to investigate.',
      'There seems to be an anomaly with your rollover status. Let me open a ticket to find out why it\'s showing disabled at 0% when it was previously active.'
    ],
    examples_bad: [
      'Your rollover is complete since it shows 0%.',
      'Disabled means you\'re good to withdraw.'
    ],
    source_location: { source_name: 'CS-Customer Support x Tech support - Process-050126-012722.pdf', page: 13, section: 'Rollover Completion Cases - Point 6' }
  },
  {
    subcategory: 'Rollover Completion Cases',
    title: 'Rollover Cases - Documentation Requirements',
    intent: 'Ensure all rollover Jira cases include required documentation.',
    rule_text: `ALL rollover-related Jira cases MUST include:

1. User's ID
2. Withdrawal amount
3. Any relevant logs

Proper documentation in Jira is required for tracking and resolution purposes.

If uncertain about a case, ESCALATE to appropriate team rather than providing speculative responses to the user.`,
    allowed_actions: ['Include user ID', 'Include withdrawal amount', 'Include relevant logs', 'Escalate when uncertain'],
    disallowed_actions: ['Create case without required info', 'Give speculative responses', 'Skip documentation'],
    tags: ['rollover', 'documentation', 'user_id', 'amount', 'logs', 'jira'],
    severity_default: 'high',
    evidence_requirements: 'All rollover Jira cases include user ID, withdrawal amount, and relevant logs.',
    examples_good: [
      'I\'ve created the case with your user ID, the withdrawal amount of $X, and the relevant account logs for investigation.',
      'For proper documentation, I\'m including your user ID (X), withdrawal amount ($Y), and the transaction logs in this ticket.'
    ],
    examples_bad: [
      'I\'ve reported your issue.',
      'Ticket created, we\'ll look into it.'
    ],
    source_location: { source_name: 'CS-Customer Support x Tech support - Process-050126-012722.pdf', page: 13, section: 'Rollover - Additional Notes' }
  }
];

// ============================================================================
// MAIN SCRIPT
// ============================================================================

async function addTransactionsKnowledge() {
  console.log('\n==========================================');
  console.log('     TRANSACTIONS KNOWLEDGE BUILDER');
  console.log('==========================================\n');

  try {
    // Step 1: Create or update the main category
    console.log('Step 1: Creating/Updating Transactions category...');

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
    console.log('  - Deposit/Withdrawal Issues');
    console.log('  - Rollover Completion Cases');
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
    await addTransactionsKnowledge();
    await mongoose.connection.close();
    console.log('Database connection closed.');
    process.exit(0);
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
};

run();
