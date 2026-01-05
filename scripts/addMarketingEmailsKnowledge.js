/**
 * Script: Add Marketing Emails Knowledge Base
 *
 * Dodaje knowledge za Marketing VS Transactional Emails u MongoDB
 *
 * Usage: node scripts/addMarketingEmailsKnowledge.js
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
// KNOWLEDGE DATA
// ============================================================================

const CATEGORY_DATA = {
  name: 'Marketing',
  description: 'Knowledge base for handling marketing-related inquiries including promotional emails, bonuses, campaigns, and email delivery issues.',
  knowledge: `Marketing category covers promotional activities, email campaigns, bonuses, and related user inquiries.

Key distinction for email issues:
- TRANSACTIONAL emails (noreply@stake.com): System-triggered emails like login codes, password reset, 2FA
- MARKETING emails (noreply@mail.stake.com): Promotional emails like bonuses, offers, campaigns

When user reports not receiving emails, ALWAYS identify which type first - escalation paths are different.`,
  keywords: [
    'marketing', 'email', 'promotional', 'bonus', 'campaign', 'newsletter',
    'transactional', 'not receiving emails', 'spam', 'unsubscribe', 'resubscribe'
  ],
  evaluationCriteria: `When evaluating marketing-related tickets:
1. Agent correctly identifies email type (transactional vs marketing)
2. Agent asks user to check spam/subfolders first
3. Agent escalates to correct channel based on email type
4. Agent does NOT escalate transactional issues to marketing-support
5. Agent does NOT escalate marketing issues to technical support via Jira`,
  subcategories: [
    {
      name: 'Email Issues',
      description: 'Handling issues with users not receiving transactional or marketing emails',
      knowledge: `Two types of emails with DIFFERENT escalation paths:

TRANSACTIONAL EMAILS:
- From: noreply@stake.com
- Types: Confirm Email, Login Codes, Enable 2FA, Password Reset, Initial Self Exclusion, Verification Code, Session Alert, Sportsbook Suspended, Suspended, User Snapshot Summary, Creditos OTP
- Escalation: Technical support via Jira on Intercom

MARKETING EMAILS:
- From: noreply@mail.stake.com
- Types: Monthly Bonus, Post-Monthly Bonus, Promotional Wagering Offer, CRM Casino & Sports Promotion, Deposit Bonuses, Welcome Bonus, Birthday Bonus
- Escalation: #marketing-support channel OR forward to supervisor to resubscribe on ACP

FIRST STEP (both types): Ask user to check spam folder and any subfolders`,
      keywords: ['email', 'not receiving', 'spam', 'transactional', 'marketing', 'noreply', 'jira', 'marketing-support'],
      evaluationCriteria: 'Agent must identify email type and use correct escalation path. Transactional → Jira/Tech Support. Marketing → marketing-support or supervisor.'
    }
  ]
};

// ============================================================================
// RULES DATA
// ============================================================================

const RULES_DATA = [
  {
    subcategory: 'Email Issues',
    title: 'Identify Email Type Before Escalation',
    intent: 'Ensure agents correctly identify whether the missing email is transactional or marketing before escalating.',
    rule_text: `When a user reports not receiving emails, FIRST identify the email type:

TRANSACTIONAL (noreply@stake.com):
- Confirm Email, Login Codes, Enable 2FA
- Password Reset, Verification Code
- Initial Self Exclusion, Session Alert
- Sportsbook Suspended, Suspended
- User Snapshot Summary, Creditos OTP

MARKETING (noreply@mail.stake.com):
- Monthly Bonus, Post-Monthly Bonus
- Promotional Wagering Offer
- CRM Casino & Sports Promotion
- Deposit Bonuses, Welcome Bonus, Birthday Bonus

Ask the user which specific email they're not receiving to determine the correct escalation path.`,
    steps: [
      { step_number: 1, action: 'Ask user which specific email they are not receiving' },
      { step_number: 2, action: 'Identify if it is transactional or marketing based on email type' },
      { step_number: 3, action: 'Proceed with appropriate escalation workflow' }
    ],
    allowed_actions: ['Ask clarifying questions', 'Identify email type', 'Explain difference if needed'],
    disallowed_actions: ['Escalate without identifying email type', 'Assume email type without asking'],
    tags: ['email', 'not_receiving_email', 'transactional', 'marketing', 'identification'],
    severity_default: 'high',
    evidence_requirements: 'Agent identifies or asks about the specific email type before escalating',
    verification_checks: [
      { check_id: 'EMAIL_TYPE_IDENTIFIED', description: 'Agent identified or asked about email type', required_when: 'User reports not receiving emails' }
    ],
    examples_good: [
      'Could you please clarify which email you are not receiving? Is it a login code/verification email, or a promotional/bonus email?',
      'I see you\'re not receiving emails. To help you better, could you tell me if this is related to login codes, password reset, or promotional offers like bonuses?'
    ],
    examples_bad: [
      'I\'ll escalate this to our technical team right away.',
      'Let me report this to marketing-support.'
    ],
    source_location: { source_name: 'CS-Marketing VS Transactional Emails-050126-030538.pdf', page: 1, section: 'Introduction' }
  },
  {
    subcategory: 'Email Issues',
    title: 'Transactional Email Issues - Technical Support Escalation',
    intent: 'Ensure transactional email issues are escalated to technical support via Jira.',
    rule_text: `For TRANSACTIONAL email issues (noreply@stake.com):

Email types:
- Confirm Email, Login Codes, Enable 2FA
- Password Reset, Initial Self Exclusion, Verification Code
- Session Alert, Sportsbook Suspended, Suspended
- User Snapshot Summary, Creditos OTP

WORKFLOW:
1. First: Ask user to check spam folder and any subfolders
2. If still not receiving: Open case to technical support via Jira on Intercom

Do NOT escalate to marketing-support channel for transactional emails.`,
    steps: [
      { step_number: 1, action: 'Confirm the email type is transactional (login codes, verification, 2FA, password reset, etc.)' },
      { step_number: 2, action: 'Ask user to check spam folder and any other subfolders' },
      { step_number: 3, action: 'If issue persists, open case to technical support via Jira on Intercom' }
    ],
    conditions: [
      {
        if: [{ field: 'email_type', operator: 'in', value: ['login_code', 'verification', '2fa', 'password_reset', 'confirm_email', 'session_alert', 'suspended', 'self_exclusion', 'otp'] }],
        then: 'Escalate to technical support via Jira on Intercom',
        certainty: 'hard'
      }
    ],
    allowed_actions: ['Ask to check spam', 'Open Jira ticket', 'Escalate to technical support'],
    disallowed_actions: ['Escalate to marketing-support', 'Forward to supervisor for resubscribe', 'Report in marketing channel'],
    tags: ['transactional_email', 'technical_support', 'jira', 'login_code', 'verification', '2fa', 'password_reset', 'noreply@stake.com'],
    severity_default: 'high',
    evidence_requirements: 'Agent escalates transactional email issues to technical support via Jira, NOT to marketing-support',
    verification_checks: [
      { check_id: 'SPAM_CHECK_ADVISED', description: 'Agent asked user to check spam folder', required_when: 'User reports not receiving transactional email' },
      { check_id: 'CORRECT_ESCALATION_TECH', description: 'Agent escalated to technical support via Jira', required_when: 'Transactional email issue persists after spam check' }
    ],
    examples_good: [
      'Please check your spam folder and any subfolders you may have. If you still cannot find the verification email, I will report this to our technical team for investigation.',
      'I\'ve checked and this is a transactional email issue. Let me open a case with our technical support team via Jira to investigate why you\'re not receiving your login codes.'
    ],
    examples_bad: [
      'I\'ll report this to our marketing-support channel.',
      'Let me forward this to my supervisor to resubscribe you.'
    ],
    source_location: { source_name: 'CS-Marketing VS Transactional Emails-050126-030538.pdf', page: 1, section: 'Transactional Emails' }
  },
  {
    subcategory: 'Email Issues',
    title: 'Marketing Email Issues - Marketing Support Escalation',
    intent: 'Ensure marketing email issues are escalated to marketing-support channel or supervisor for ACP resubscribe.',
    rule_text: `For MARKETING email issues (noreply@mail.stake.com):

Email types:
- Monthly Bonus, Post-Monthly Bonus
- Promotional Wagering Offer
- CRM Casino & Sports Promotion
- Deposit Bonuses, Welcome Bonus, Birthday Bonus

WORKFLOW:
1. First: Ask user to check spam folder and any subfolders
2. If still not receiving, TWO options:
   a) Report in #marketing-support channel, OR
   b) Forward to supervisor so they can resubscribe on ACP

Do NOT open Jira ticket for marketing emails.`,
    steps: [
      { step_number: 1, action: 'Confirm the email type is marketing (bonus emails, promotional offers, etc.)' },
      { step_number: 2, action: 'Ask user to check spam folder and any other subfolders' },
      { step_number: 3, action: 'If issue persists, report in #marketing-support channel OR forward to supervisor for ACP resubscribe' }
    ],
    conditions: [
      {
        if: [{ field: 'email_type', operator: 'in', value: ['monthly_bonus', 'promotional', 'deposit_bonus', 'welcome_bonus', 'birthday_bonus', 'crm_promotion', 'wagering_offer'] }],
        then: 'Report to #marketing-support channel or forward to supervisor for ACP resubscribe',
        certainty: 'hard'
      }
    ],
    allowed_actions: ['Ask to check spam', 'Report in marketing-support channel', 'Forward to supervisor for ACP resubscribe'],
    disallowed_actions: ['Open Jira ticket', 'Escalate to technical support', 'Report via Jira on Intercom'],
    tags: ['marketing_email', 'marketing-support', 'bonus_email', 'promotional', 'resubscribe', 'ACP', 'noreply@mail.stake.com'],
    severity_default: 'medium',
    evidence_requirements: 'Agent escalates marketing email issues to marketing-support or supervisor, NOT to technical support/Jira',
    verification_checks: [
      { check_id: 'SPAM_CHECK_ADVISED', description: 'Agent asked user to check spam folder', required_when: 'User reports not receiving marketing email' },
      { check_id: 'CORRECT_ESCALATION_MARKETING', description: 'Agent escalated to marketing-support or supervisor', required_when: 'Marketing email issue persists after spam check' }
    ],
    examples_good: [
      'Please check your spam folder first. If you still don\'t see the bonus emails, I\'ll report this to our marketing team to look into it.',
      'I\'ll forward this to my supervisor so they can check your subscription settings and resubscribe you on ACP if needed.'
    ],
    examples_bad: [
      'Let me open a Jira ticket for this.',
      'I\'ll escalate this to technical support.'
    ],
    source_location: { source_name: 'CS-Marketing VS Transactional Emails-050126-030538.pdf', page: 2, section: 'Marketing Emails' }
  },
  {
    subcategory: 'Email Issues',
    title: 'Email Sender Addresses Reference',
    intent: 'Provide quick reference for identifying email type by sender address.',
    rule_text: `Quick reference for email sender addresses:

TRANSACTIONAL: noreply@stake.com
- System-triggered emails
- User action triggers these (login, password reset, etc.)
- Technical support handles issues

MARKETING: noreply@mail.stake.com
- Promotional campaign emails
- Part of broader marketing campaigns
- Marketing team handles issues

If user mentions the sender address, use this to immediately identify the email type and correct escalation path.`,
    allowed_actions: ['Identify email type by sender', 'Use sender address to determine escalation'],
    disallowed_actions: ['Confuse the two sender addresses'],
    tags: ['email_address', 'noreply@stake.com', 'noreply@mail.stake.com', 'sender', 'identification'],
    severity_default: 'low',
    examples_good: [
      'I see the email should come from noreply@stake.com - this is a transactional email, so I\'ll escalate to our technical team.',
      'Emails from noreply@mail.stake.com are marketing emails. Let me check with our marketing team about your subscription.'
    ],
    source_location: { source_name: 'CS-Marketing VS Transactional Emails-050126-030538.pdf', page: 1, section: 'Email addresses' }
  }
];

// ============================================================================
// MAIN SCRIPT
// ============================================================================

async function createMarketingEmailsKnowledge() {
  console.log('\n========================================');
  console.log('  MARKETING EMAILS KNOWLEDGE BUILDER');
  console.log('========================================\n');

  try {
    // Step 1: Create or update the main category
    console.log('Step 1: Creating/Updating Marketing category...');

    let category = await QACategory.findOne({ name: CATEGORY_DATA.name });

    if (category) {
      console.log('  Category exists, updating...');
      category.description = CATEGORY_DATA.description;
      category.knowledge = CATEGORY_DATA.knowledge;
      category.keywords = CATEGORY_DATA.keywords;
      category.evaluationCriteria = CATEGORY_DATA.evaluationCriteria;

      // Check if subcategory exists, if not add it
      const existingSubcat = category.subcategories.find(s => s.name === 'Email Issues');
      if (existingSubcat) {
        Object.assign(existingSubcat, CATEGORY_DATA.subcategories[0]);
      } else {
        category.subcategories.push(CATEGORY_DATA.subcategories[0]);
      }

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
        // Generate rule_id
        const rule_id = Rule.generateRuleId(CATEGORY_DATA.name, ruleData.title);

        // Check if rule exists
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
    console.log('\n========================================');
    console.log('            SUMMARY');
    console.log('========================================');
    console.log(`Category: ${CATEGORY_DATA.name}`);
    console.log(`Subcategories: ${category.subcategories.length}`);
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
    await createMarketingEmailsKnowledge();
    await mongoose.connection.close();
    console.log('Database connection closed.');
    process.exit(0);
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
};

run();
