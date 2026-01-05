/**
 * Script: Add Phishing Websites Knowledge Base
 *
 * Dodaje knowledge za Phishing Websites proceduru u Security kategoriju
 *
 * Usage: node scripts/addPhishingWebsitesKnowledge.js
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
  name: 'Phishing Websites',
  description: 'Handling reports of phishing websites impersonating Stake',
  knowledge: `Phishing websites impersonate Stake to defraud customers. When users report these, we need to collect specific information for takedown requests.

REQUIRED INFORMATION FOR TAKEDOWN:
1. Domain Name / URL (REQUIRED)
   - IMPORTANT: Put period in brackets when copying URL
   - Example: https://stake[.]kim/ (not https://stake.kim/)

2. URLs & Screenshots of concerning pages
   - Landing page is usually sufficient
   - Can send up to 3 images

3. Description of infringing material
   - What Stake content is being copied
   - Where it's located on the fake site
   - Example: "Stake logo in top-left, Stake branding worn by individuals in middle of screen"

ESCALATION: #com-tech-support → Open Jira ticket → Forwarded for takedown`,
  keywords: ['phishing website', 'fake website', 'phishing site', 'takedown', 'com-tech-support', 'impersonation'],
  evaluationCriteria: `Agent must:
1. Collect URL/domain name from user
2. Request screenshots if not provided
3. Get description of infringing material
4. Escalate via #com-tech-support with Jira ticket
5. Use bracket notation for URLs in reports`
};

// ============================================================================
// RULES DATA
// ============================================================================

const RULES_DATA = [
  {
    subcategory: 'Phishing Websites',
    title: 'Phishing Website Report - Required Information',
    intent: 'Ensure agents collect all required information for phishing website takedown requests.',
    rule_text: `When user reports a phishing website impersonating Stake, collect:

REQUIRED:
1. Domain Name / URL
   - Ask user for the website address
   - This is MANDATORY for takedown request

2. Screenshots of concerning pages
   - Landing page is usually sufficient
   - Up to 3 images can be submitted
   - Ask user to provide if not included

3. Description of infringing material
   - What Stake content is being copied/used
   - Where it appears on the fake website
   - Example: "Stake logo in top-left corner, Stake branding on images"

All three pieces of information help the takedown process.`,
    steps: [
      { step_number: 1, action: 'Ask user for the phishing website URL/domain (REQUIRED)' },
      { step_number: 2, action: 'Request screenshots of the concerning pages (landing page is fine)' },
      { step_number: 3, action: 'Ask for description of what Stake material is being copied' },
      { step_number: 4, action: 'Compile information for Jira ticket' }
    ],
    allowed_actions: ['Request URL', 'Request screenshots', 'Request description', 'Compile report'],
    disallowed_actions: ['Skip URL collection', 'Submit without domain name', 'Ignore user report'],
    tags: ['phishing_website', 'takedown', 'url', 'screenshot', 'infringement', 'required_info'],
    severity_default: 'high',
    evidence_requirements: 'Agent collects URL/domain name at minimum. Screenshots and description also requested.',
    verification_checks: [
      { check_id: 'URL_COLLECTED', description: 'Agent obtained the phishing website URL', required_when: 'User reports phishing website' },
      { check_id: 'SCREENSHOT_REQUESTED', description: 'Agent requested or received screenshots', required_when: 'Phishing website reported' },
      { check_id: 'DESCRIPTION_OBTAINED', description: 'Agent obtained description of infringing content', required_when: 'Phishing website reported' }
    ],
    examples_good: [
      'Thank you for reporting this. Could you please share the website URL and any screenshots of the page? Also, can you describe what Stake content you see being used on the site?',
      'I\'ll need the website address to report this. Can you also send a screenshot of the landing page and tell me what Stake branding you noticed?'
    ],
    examples_bad: [
      'Thanks, I\'ll report it. [without getting URL]',
      'Okay, noted. [without collecting any information]'
    ],
    source_location: { source_name: 'CS-Phishing Website-050126-032120.pdf', page: 1, section: 'Required Information' }
  },
  {
    subcategory: 'Phishing Websites',
    title: 'URL Bracket Notation for Phishing Reports',
    intent: 'Ensure agents use proper bracket notation when documenting phishing URLs.',
    rule_text: `IMPORTANT: When copying/documenting phishing URLs, use bracket notation for the period.

CORRECT FORMAT:
- https://stake[.]kim/
- https://stake[.]casino/
- https://fakestake[.]com/

INCORRECT FORMAT:
- https://stake.kim/
- https://stake.casino/

WHY: Bracket notation prevents accidental clicks and automatic hyperlinking of malicious URLs in reports and tickets.

Apply this when:
- Writing URLs in Jira tickets
- Documenting in internal systems
- Sharing with team members`,
    allowed_actions: ['Use bracket notation', 'Document URLs safely'],
    disallowed_actions: ['Use direct URLs without brackets in reports'],
    tags: ['url_format', 'bracket_notation', 'safety', 'documentation', 'phishing_website'],
    severity_default: 'low',
    evidence_requirements: 'Agent uses bracket notation when documenting phishing URLs in tickets/reports',
    examples_good: [
      'Reported phishing site: https://stake[.]kim/',
      'User found fake site at https://stakecasino[.]net/'
    ],
    examples_bad: [
      'Reported phishing site: https://stake.kim/',
      'The fake URL is stake.casino'
    ],
    source_location: { source_name: 'CS-Phishing Website-050126-032120.pdf', page: 1, section: 'Domain Name / URL Required' }
  },
  {
    subcategory: 'Phishing Websites',
    title: 'Phishing Website - Escalation to com-tech-support',
    intent: 'Ensure phishing website reports are escalated correctly via #com-tech-support Jira ticket.',
    rule_text: `After collecting required information, escalate for takedown:

ESCALATION PROCESS:
1. Go to #com-tech-support channel
2. Open a Jira ticket with:
   - Domain Name/URL (with bracket notation)
   - Screenshots of concerning pages
   - Description of infringing material (what Stake content is copied)
3. Submission will be forwarded for takedown

Do NOT use other channels for phishing website reports.
Do NOT skip Jira ticket creation.

The goal is to have the fraudulent website taken down to protect users.`,
    steps: [
      { step_number: 1, action: 'Collect all required information from user' },
      { step_number: 2, action: 'Go to #com-tech-support channel' },
      { step_number: 3, action: 'Open Jira ticket with URL (bracket notation), screenshots, and description' },
      { step_number: 4, action: 'Confirm to user that report has been submitted for takedown' }
    ],
    conditions: [
      {
        if: [{ field: 'report_type', operator: 'equals', value: 'phishing_website' }],
        then: 'Escalate via #com-tech-support with Jira ticket',
        certainty: 'hard'
      }
    ],
    allowed_actions: ['Open Jira ticket', 'Escalate to #com-tech-support', 'Confirm submission to user'],
    disallowed_actions: ['Use wrong channel', 'Skip Jira ticket', 'Escalate to marketing-support'],
    tags: ['phishing_website', 'com-tech-support', 'jira', 'takedown', 'escalation'],
    severity_default: 'high',
    evidence_requirements: 'Agent indicates they will report via #com-tech-support / Jira for takedown',
    verification_checks: [
      { check_id: 'CORRECT_CHANNEL', description: 'Agent escalates to #com-tech-support', required_when: 'Phishing website reported with all info' },
      { check_id: 'JIRA_CREATED', description: 'Agent mentions creating Jira ticket', required_when: 'Phishing website needs to be reported' }
    ],
    examples_good: [
      'Thank you for this information. I\'ve created a ticket with our tech support team and this will be forwarded for takedown.',
      'I\'ll report this to our #com-tech-support team via Jira so we can work on getting this fraudulent site taken down.'
    ],
    examples_bad: [
      'I\'ll let the team know. [vague, no mention of proper channel]',
      'Reported to marketing team. [wrong channel]'
    ],
    source_location: { source_name: 'CS-Phishing Website-050126-032120.pdf', page: 2, section: 'Escalation' }
  },
  {
    subcategory: 'Phishing Websites',
    title: 'Description of Infringing Material Format',
    intent: 'Guide agents on how to describe infringing material for takedown requests.',
    rule_text: `When describing infringing material on phishing websites, be specific:

GOOD DESCRIPTION FORMAT:
- Location of copied content (top-left, middle, footer, etc.)
- What Stake elements are copied:
  • Stake logo
  • Stake branding/colors
  • Stake partner images (Drake, UFC, etc.)
  • Stake website layout/design
  • Stake promotional text

EXAMPLE DESCRIPTION:
"There is a Stake logo in the top-left of the screen. There is also Stake branding worn by 3 individuals near the middle of the screen."

This helps legal/compliance team with takedown requests.`,
    allowed_actions: ['Write detailed descriptions', 'Identify Stake branding elements', 'Note locations of copied content'],
    disallowed_actions: ['Submit vague descriptions', 'Skip description entirely'],
    tags: ['description', 'infringing_material', 'takedown', 'branding', 'copyright'],
    severity_default: 'low',
    evidence_requirements: 'Agent collects or writes specific description of what Stake content is being copied',
    examples_good: [
      'Description: Stake logo visible in header, UFC partnership badge displayed, website layout mimics official Stake design',
      'The user reports: Stake logo top-left, Drake partnership images in banner, identical color scheme to real Stake'
    ],
    examples_bad: [
      'It looks like Stake',
      'Fake website'
    ],
    source_location: { source_name: 'CS-Phishing Website-050126-032120.pdf', page: 1, section: 'Description of infringing material' }
  },
  {
    subcategory: 'Phishing Websites',
    title: 'User Safety Advice for Phishing Websites',
    intent: 'Ensure agents warn users about dangers of phishing websites.',
    rule_text: `After collecting report information, advise the user:

SAFETY WARNINGS:
1. Do NOT enter any credentials on the fake site
2. Do NOT deposit any funds to addresses shown on fake site
3. If they already entered credentials:
   - Change Stake password immediately
   - Enable 2FA if not already enabled
   - Monitor account for suspicious activity
4. If they deposited to fake address:
   - Funds are likely unrecoverable
   - This should be documented in the report

OFFICIAL STAKE DOMAINS:
- stake.com
- stake.us (US social casino)

Any other domain claiming to be Stake is fraudulent.`,
    allowed_actions: ['Warn about credential theft', 'Advise password change', 'Recommend 2FA', 'Clarify official domains'],
    disallowed_actions: ['Ignore user safety', 'Not warn about dangers', 'Promise fund recovery from scams'],
    tags: ['phishing_website', 'user_safety', 'password_change', '2fa', 'credentials'],
    severity_default: 'medium',
    evidence_requirements: 'Agent provides safety advice, especially if user may have interacted with fake site',
    examples_good: [
      'Please do not enter any information on that website. If you already have, I strongly recommend changing your Stake password immediately and enabling 2FA.',
      'That is a fraudulent website. Our official sites are stake.com and stake.us. Did you enter any credentials or deposit funds there?'
    ],
    examples_bad: [
      'Thanks for reporting, bye.',
      'Yeah that\'s fake.'
    ],
    source_location: { source_name: 'CS-Phishing Website-050126-032120.pdf', page: 1, section: 'Intro' }
  }
];

// ============================================================================
// MAIN SCRIPT
// ============================================================================

async function addPhishingWebsitesKnowledge() {
  console.log('\n==========================================');
  console.log('  PHISHING WEBSITES KNOWLEDGE BUILDER');
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
    const existingSubcat = category.subcategories.find(s => s.name === 'Phishing Websites');
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
    console.log(`Subcategory: Phishing Websites`);
    console.log(`Total subcategories now: ${category.subcategories.length}`);
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
    await addPhishingWebsitesKnowledge();
    await mongoose.connection.close();
    console.log('Database connection closed.');
    process.exit(0);
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
};

run();
