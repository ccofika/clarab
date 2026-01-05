/**
 * Script: Add Phishing Email Process Knowledge Base
 *
 * Dodaje knowledge za Phishing Email Process u MongoDB
 *
 * Usage: node scripts/addPhishingKnowledge.js
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
  name: 'Security',
  description: 'Knowledge base for handling security-related inquiries including phishing reports, suspicious activity, account security, and fraud prevention.',
  knowledge: `Security category covers phishing reports, suspicious emails, account security issues, and fraud-related inquiries.

Key security concerns:
- Phishing emails impersonating Stake (fake bonus offers, promotions)
- Suspicious account activity
- Compromised accounts
- Fraudulent websites/apps

OFFICIAL STAKE EMAIL ADDRESSES:
- noreply@stake.com (transactional)
- noreply@mail.stake.com (marketing)
Any email from other domains claiming to be Stake is PHISHING.`,
  keywords: [
    'security', 'phishing', 'scam', 'suspicious', 'fraud', 'fake email',
    'impersonation', 'hacked', 'compromised', 'malicious', 'techsupport'
  ],
  evaluationCriteria: `When evaluating security-related tickets:
1. Agent takes phishing reports seriously
2. Agent verifies sender email address against official addresses
3. Agent follows proper escalation to techsupport@stake.com
4. Agent creates Jira ticket with required information
5. Agent checks catalogue before reporting duplicate cases
6. Agent asks user to forward email as ATTACHMENT (not inline)`,
  subcategories: [
    {
      name: 'Phishing Emails',
      description: 'Handling reports of phishing emails impersonating Stake',
      knowledge: `Phishing emails impersonating Stake are common - often disguised as bonus offers or promotions.

OFFICIAL STAKE SENDERS:
- noreply@stake.com (transactional)
- noreply@mail.stake.com (marketing)

ANY OTHER DOMAIN = NOT FROM STAKE = PHISHING

WORKFLOW:
1. Ask user to forward suspicious email to your work email
2. Verify sender address is NOT official Stake
3. Cross-check in Catalogue if already reported
4. If new phishing: Ask user to forward as ATTACHMENT to techsupport@stake.com
5. Create Jira ticket with domain name and email header`,
      keywords: ['phishing', 'fake email', 'scam email', 'impersonation', 'suspicious email', 'techsupport'],
      evaluationCriteria: 'Agent must verify sender, check catalogue, and escalate new cases properly to techsupport@stake.com with Jira ticket.'
    }
  ]
};

// ============================================================================
// RULES DATA
// ============================================================================

const RULES_DATA = [
  {
    subcategory: 'Phishing Emails',
    title: 'Phishing Email Report - Initial Verification',
    intent: 'Ensure agents properly receive and verify suspicious emails reported by users.',
    rule_text: `When a user reports a suspicious email claiming to be from Stake:

STEP 1 - Get the email for verification:
1. Find your work email in Intercom (Click icon bottom left > Click your name > Copy email)
2. Share your work email with the user
3. Ask them to FORWARD the suspicious email to you for verification

STEP 2 - Verify the sender:
- Check the sender's email address
- Official Stake senders are ONLY:
  • noreply@stake.com (transactional)
  • noreply@mail.stake.com (marketing)
- If from ANY other domain, it is NOT from Stake = PHISHING`,
    steps: [
      { step_number: 1, action: 'Find your work email in Intercom (icon > name > copy email)' },
      { step_number: 2, action: 'Share work email with user and ask them to forward the suspicious email' },
      { step_number: 3, action: 'Check sender email address when received' },
      { step_number: 4, action: 'Verify if sender is official (noreply@stake.com or noreply@mail.stake.com)' },
      { step_number: 5, action: 'If not official domain = confirm phishing' }
    ],
    allowed_actions: ['Request email forward', 'Verify sender address', 'Confirm phishing status'],
    disallowed_actions: ['Ignore phishing reports', 'Assume email is legitimate without checking sender'],
    tags: ['phishing', 'suspicious_email', 'verification', 'sender_check', 'security'],
    severity_default: 'high',
    evidence_requirements: 'Agent requests email forward and verifies sender address against official Stake addresses',
    verification_checks: [
      { check_id: 'EMAIL_REQUESTED', description: 'Agent asked user to forward suspicious email', required_when: 'User reports suspicious email' },
      { check_id: 'SENDER_VERIFIED', description: 'Agent checked sender email address', required_when: 'Email received from user' }
    ],
    examples_good: [
      'Could you please forward that suspicious email to my work email [email] so I can verify it for you?',
      'I can see the sender is "noreply@stake-bonus.com" which is NOT our official email address. This is a phishing email - please do not click any links.'
    ],
    examples_bad: [
      'That sounds suspicious, just delete it.',
      'I\'m sure it\'s fine if it mentions Stake.'
    ],
    source_location: { source_name: 'CS-Phishing Email Process-050126-030950.pdf', page: 1, section: '1. Confirm the email address' }
  },
  {
    subcategory: 'Phishing Emails',
    title: 'Official Stake Email Addresses Reference',
    intent: 'Provide definitive list of official Stake email addresses for phishing verification.',
    rule_text: `OFFICIAL STAKE EMAIL ADDRESSES:

TRANSACTIONAL: noreply@stake.com
- Login codes, verification emails, password reset, 2FA, etc.

MARKETING: noreply@mail.stake.com
- Bonus offers, promotions, campaigns, etc.

CRITICAL: If email is from ANY OTHER DOMAIN, it is NOT from Stake.

Common phishing patterns:
- stake-bonus.com
- stake-rewards.com
- stakepromo.com
- mail-stake.com
- Any variation that is NOT exactly stake.com or mail.stake.com`,
    allowed_actions: ['Verify against official addresses', 'Confirm phishing if different domain'],
    disallowed_actions: ['Accept emails from unofficial domains as legitimate'],
    tags: ['official_email', 'noreply@stake.com', 'noreply@mail.stake.com', 'phishing_verification'],
    severity_default: 'high',
    examples_good: [
      'Our official email addresses are noreply@stake.com for transactional emails and noreply@mail.stake.com for marketing. The email you received from "stake-bonus.com" is not from us.',
      'I can confirm this is a phishing email - we only send from @stake.com or @mail.stake.com domains.'
    ],
    examples_bad: [
      'That looks like it could be from us.',
      'Stake-bonus.com sounds like a Stake email.'
    ],
    source_location: { source_name: 'CS-Phishing Email Process-050126-030950.pdf', page: 1, section: '1-2. Check the email address' }
  },
  {
    subcategory: 'Phishing Emails',
    title: 'Phishing Email - Catalogue Check and Escalation',
    intent: 'Ensure agents check catalogue for existing reports and properly escalate new phishing cases.',
    rule_text: `After confirming email is phishing (not from official Stake domain):

STEP 1 - Cross-check in Catalogue:
- Compare the phishing email address with existing reported cases in the Catalogue
- If ALREADY REPORTED: No need to report again
- If NEW (not in catalogue): Proceed to escalation

STEP 2 - Escalate new phishing cases:
1. Ask user to forward a copy of the email AS AN ATTACHMENT to techsupport@stake.com
   (Refer user to Action Plan for steps on how to forward as attachment)
2. Create Jira ticket to Tech team including:
   - The DOMAIN NAME involved
   - The EMAIL HEADER (if email hasn't been forwarded to the team)`,
    steps: [
      { step_number: 1, action: 'Cross-check phishing email in Catalogue' },
      { step_number: 2, action: 'If found in catalogue: Inform user it\'s already reported, no further action needed' },
      { step_number: 3, action: 'If NOT in catalogue: Ask user to forward email AS ATTACHMENT to techsupport@stake.com' },
      { step_number: 4, action: 'Create Jira ticket with domain name and email header' }
    ],
    conditions: [
      {
        if: [{ field: 'phishing_in_catalogue', operator: 'equals', value: true }],
        then: 'Inform user case is already reported. No need to report again.',
        certainty: 'hard'
      },
      {
        if: [{ field: 'phishing_in_catalogue', operator: 'equals', value: false }],
        then: 'Escalate: User forwards to techsupport@stake.com + Create Jira ticket',
        certainty: 'hard'
      }
    ],
    allowed_actions: ['Check catalogue', 'Request email as attachment to techsupport', 'Create Jira ticket'],
    disallowed_actions: ['Skip catalogue check', 'Report already-catalogued phishing', 'Ask user to forward inline instead of attachment'],
    tags: ['phishing', 'catalogue', 'techsupport@stake.com', 'jira', 'escalation', 'email_header', 'domain'],
    severity_default: 'high',
    evidence_requirements: 'Agent checks catalogue and escalates new cases to techsupport@stake.com with Jira ticket',
    verification_checks: [
      { check_id: 'CATALOGUE_CHECKED', description: 'Agent checked catalogue for existing report', required_when: 'Phishing email confirmed' },
      { check_id: 'PROPER_ESCALATION', description: 'Agent escalated to techsupport@stake.com with Jira ticket', required_when: 'New phishing case not in catalogue' }
    ],
    examples_good: [
      'I\'ve checked our records and this phishing domain hasn\'t been reported yet. Could you please forward the email as an attachment to techsupport@stake.com? I\'ll also create a ticket with our tech team.',
      'Good news - this phishing domain has already been reported and our team is aware. Thank you for bringing it to our attention. Please delete the email and don\'t click any links.'
    ],
    examples_bad: [
      'Just forward it to techsupport.',
      'I\'ll report this without checking if it\'s already known.'
    ],
    source_location: { source_name: 'CS-Phishing Email Process-050126-030950.pdf', page: 2, section: '2-4. Cross-check and escalation' }
  },
  {
    subcategory: 'Phishing Emails',
    title: 'Jira Ticket Requirements for Phishing Reports',
    intent: 'Ensure Jira tickets for phishing reports contain all required information.',
    rule_text: `When creating Jira ticket for new phishing report, MUST include:

REQUIRED INFORMATION:
1. DOMAIN NAME involved (the fake sender domain)
2. EMAIL HEADER (if the email hasn't been forwarded to the team)

The user should forward the email as an ATTACHMENT (not inline/copy-paste) to techsupport@stake.com.

Refer user to the Action Plan document for steps on how to forward email as attachment.`,
    allowed_actions: ['Create Jira ticket', 'Include domain name', 'Include email header', 'Direct user to techsupport@stake.com'],
    disallowed_actions: ['Create ticket without domain name', 'Skip email header when email not forwarded'],
    tags: ['jira', 'phishing_report', 'domain_name', 'email_header', 'techsupport', 'escalation'],
    severity_default: 'medium',
    evidence_requirements: 'Jira ticket contains domain name and email header (if applicable)',
    examples_good: [
      'I\'ve created a ticket with our tech team including the phishing domain "stake-rewards.com" and the email header information.',
      'Please forward the email as an attachment (not copy-paste) to techsupport@stake.com so our security team can investigate the full email header.'
    ],
    examples_bad: [
      'I\'ve reported this.',
      'Just created a ticket about suspicious email.'
    ],
    source_location: { source_name: 'CS-Phishing Email Process-050126-030950.pdf', page: 2, section: '4. Create Jira tickets' }
  },
  {
    subcategory: 'Phishing Emails',
    title: 'User Safety Advice for Phishing Emails',
    intent: 'Ensure agents provide proper safety guidance to users who received phishing emails.',
    rule_text: `After confirming an email is phishing, advise the user:

SAFETY RECOMMENDATIONS:
1. Do NOT click any links in the email
2. Do NOT download any attachments from the email
3. Do NOT reply to the email
4. Do NOT enter any credentials or personal information
5. Delete the email after forwarding to techsupport@stake.com
6. If they clicked any links or entered information, advise immediate password change and enable 2FA

Mark the email as spam/phishing in their email client to help filter future attempts.`,
    allowed_actions: ['Warn about clicking links', 'Advise password change if compromised', 'Recommend 2FA', 'Suggest marking as spam'],
    disallowed_actions: ['Ignore user safety', 'Not warn about dangers'],
    tags: ['phishing', 'user_safety', 'security_advice', 'password_change', '2fa'],
    severity_default: 'medium',
    examples_good: [
      'Please do not click any links or download attachments from this email. If you\'ve already clicked anything or entered any information, I strongly recommend changing your password immediately and enabling 2FA on your account.',
      'This is a phishing attempt. Please delete the email and mark it as spam. Did you happen to click on any links or enter any information?'
    ],
    examples_bad: [
      'Yes that\'s phishing. Anything else?',
      'Don\'t worry about it, just delete it.'
    ],
    source_location: { source_name: 'CS-Phishing Email Process-050126-030950.pdf', page: 1, section: 'Intro' }
  }
];

// ============================================================================
// MAIN SCRIPT
// ============================================================================

async function createPhishingKnowledge() {
  console.log('\n========================================');
  console.log('  PHISHING EMAIL KNOWLEDGE BUILDER');
  console.log('========================================\n');

  try {
    // Step 1: Create or update the main category
    console.log('Step 1: Creating/Updating Security category...');

    let category = await QACategory.findOne({ name: CATEGORY_DATA.name });

    if (category) {
      console.log('  Category exists, updating...');
      category.description = CATEGORY_DATA.description;
      category.knowledge = CATEGORY_DATA.knowledge;
      category.keywords = CATEGORY_DATA.keywords;
      category.evaluationCriteria = CATEGORY_DATA.evaluationCriteria;

      // Check if subcategory exists, if not add it
      const existingSubcat = category.subcategories.find(s => s.name === 'Phishing Emails');
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
    await createPhishingKnowledge();
    await mongoose.connection.close();
    console.log('Database connection closed.');
    process.exit(0);
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
};

run();
