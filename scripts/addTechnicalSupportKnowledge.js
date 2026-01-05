/**
 * Script: Add Technical Support Knowledge Base
 *
 * Dodaje knowledge za Technical Support kategoriju (Jira best practices, Troubleshooting, Tips)
 *
 * Usage: node scripts/addTechnicalSupportKnowledge.js
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
  name: 'Technical Support',
  description: 'Knowledge base for Jira case best practices, troubleshooting steps, and tips for handling technical issues.',
  knowledge: `Technical Support category covers:
1. JIRA BEST PRACTICES - How to create and manage Jira tickets properly
2. TROUBLESHOOTING - Standard troubleshooting steps to try before escalating
3. TIPS AND TRICKS - Common issue solutions (login, captcha, 2FA, etc.)

KEY PRINCIPLE: Fully understand the issue before opening Jira. Gather all information and try troubleshooting first.

IMPORTANT: Do NOT copy/paste tech support responses. Understand and explain solutions clearly to users.`,
  keywords: [
    'jira', 'ticket', 'case', 'troubleshooting', 'cache', 'cookies', 'incognito',
    'browser', 'device', 'mirror', 'vpn', 'login', 'captcha', '2fa', 'bug'
  ],
  evaluationCriteria: `When evaluating technical support handling:
1. Agent gathers complete information before creating Jira
2. Agent attempts troubleshooting before escalating
3. Agent includes all required details in Jira (bet ID, screenshots, timestamps)
4. Agent does NOT copy/paste tech responses
5. Agent guides user through steps, not just lists them`,
  subcategories: [
    {
      name: 'Jira Best Practices',
      description: 'Guidelines for creating and managing Jira tickets effectively',
      knowledge: `Before opening Jira:
- Fully understand the issue
- Ask for clarification if uncertain
- Gather: bet IDs, screenshots, detailed explanations, timeframes in UTC

When creating:
- Include detailed description
- Include bet ID/game ID and/or round timeframe (UTC)

During resolution:
- Do NOT copy/paste Tech Support responses
- Understand and explain solution clearly
- Share documents/screenshots from tech unless told otherwise

Similar issues in same conversation: Reopen existing Jira by commenting
Unrelated issues: Create separate Jira case`,
      keywords: ['jira', 'ticket', 'case', 'bet_id', 'screenshot', 'utc', 'escalation'],
      evaluationCriteria: 'Agent creates complete Jira tickets with all info. Does not copy/paste tech responses.'
    },
    {
      name: 'Troubleshooting Steps',
      description: 'Standard troubleshooting steps to guide users through before escalating',
      knowledge: `Standard troubleshooting steps (do NOT just copy/paste - GUIDE user through each):

1. Clear Cache and Cookies
2. Use Incognito Mode
3. Try Different Browser (Opera, Brave)
4. Use Different Device
5. Use Mirror Sites
6. Change Internet Connection (WiFi, 4G, 5G)
7. Close Unnecessary Tabs
8. Disable Browser Extensions
9. Restart Device
10. Update Device and Browser

Only escalate to Jira AFTER troubleshooting fails.`,
      keywords: ['troubleshooting', 'cache', 'cookies', 'incognito', 'browser', 'device', 'mirror', 'connection', 'extensions', 'restart', 'update'],
      evaluationCriteria: 'Agent guides user through troubleshooting steps one by one. Only escalates after troubleshooting fails.'
    },
    {
      name: 'Tips and Tricks',
      description: 'Quick solutions for common technical issues',
      knowledge: `Common issue solutions:

LOGIN (Rate-Limited):
- Try different IP connection
- Disable VPN/Proxy temporarily

CAPTCHA ("Cannot Load"):
- Follow hCaptcha guide
- Follow Debugging Captcha guide

2FA ("Token Expired"):
- Delete current QR code
- Log out, wait 5 minutes, log in
- Scan new QR code
- If persists, escalate via Jira

"COPY LINK" ICON:
- Check for conflicting Chrome extensions

IP LIMITATIONS:
- Try changing IP/internet connection

RE-VERIFICATION WITH GOOGLE (Mirror Sites):
- Replace "stake.com" in URL with mirror site address

SPORTSBOOK BETS:
- Always note the sports team for investigation`,
      keywords: ['login', 'rate_limited', 'captcha', '2fa', 'token', 'copy_link', 'ip', 'verification', 'google', 'mirror', 'sportsbook'],
      evaluationCriteria: 'Agent applies correct tip for the specific issue type.'
    }
  ]
};

// ============================================================================
// RULES DATA
// ============================================================================

const RULES_DATA = [
  // ==================== JIRA BEST PRACTICES ====================
  {
    subcategory: 'Jira Best Practices',
    title: 'Jira - Pre-Creation Requirements',
    intent: 'Ensure agents gather all required information before creating Jira cases.',
    rule_text: `Before opening a Jira case, it is CRUCIAL to:

1. Fully understand the issue reported by the user
2. If ANY uncertainty in their description, ask for clarification
3. Gather all necessary information:
   - Bet IDs
   - Screenshots (slot rounds, live game outcomes)
   - Detailed explanations of issues
   - Relevant timeframes in UTC (GMT) timezone

Do NOT create Jira cases with incomplete information.`,
    steps: [
      { step_number: 1, action: 'Read and fully understand the user\'s issue' },
      { step_number: 2, action: 'If unclear, ask for clarification' },
      { step_number: 3, action: 'Gather bet IDs if applicable' },
      { step_number: 4, action: 'Request screenshots of the issue' },
      { step_number: 5, action: 'Get detailed explanation' },
      { step_number: 6, action: 'Record timeframes in UTC' }
    ],
    allowed_actions: ['Ask clarifying questions', 'Request bet IDs', 'Request screenshots', 'Request UTC timestamps'],
    disallowed_actions: ['Create Jira with incomplete info', 'Skip clarification when unsure', 'Assume missing details'],
    tags: ['jira', 'pre_creation', 'information_gathering', 'bet_id', 'screenshot', 'utc'],
    severity_default: 'high',
    evidence_requirements: 'Agent gathers complete information before creating Jira case.',
    verification_checks: [
      { check_id: 'ISSUE_UNDERSTOOD', description: 'Agent demonstrated understanding of issue', required_when: 'Creating any Jira case' },
      { check_id: 'INFO_COMPLETE', description: 'Agent gathered all required information', required_when: 'Creating any Jira case' }
    ],
    examples_good: [
      'Before I create a ticket, I want to make sure I understand correctly. You\'re saying [X happened]. Is that right? Also, could you share the bet ID and a screenshot?',
      'I\'ll need a few more details: the bet ID, what time this happened (in UTC if possible), and a screenshot of the issue.'
    ],
    examples_bad: [
      'I\'ll create a ticket for you now.',
      'Reported to tech team.'
    ],
    source_location: { source_name: 'CS-Customer Support x Tech support - Process-050126-012722.pdf', page: 1, section: 'Best Practices for Jira Cases' }
  },
  {
    subcategory: 'Jira Best Practices',
    title: 'Jira - Case Content Requirements',
    intent: 'Specify what must be included when creating a Jira case.',
    rule_text: `When creating a Jira case, Customer Support MUST include:

1. Detailed description of the problem
2. Bet ID / Game ID
3. Specific round timeframe (time and date in UTC)

Without these elements, Tech Support cannot effectively investigate the issue.`,
    allowed_actions: ['Include detailed description', 'Include bet/game ID', 'Include UTC timeframe'],
    disallowed_actions: ['Create case without description', 'Skip bet/game ID', 'Use non-UTC timestamps'],
    tags: ['jira', 'case_content', 'bet_id', 'game_id', 'utc', 'description'],
    severity_default: 'high',
    evidence_requirements: 'Jira case includes detailed description, bet/game ID, and UTC timeframe.',
    examples_good: [
      'Jira case: User reports slot not paying out. Bet ID: 12345, occurred 2024-01-15 14:30 UTC. User claims won during bonus round but balance didn\'t update.',
      'Game: Crazy Time, Bet ID: 67890, Time: 2024-01-15 09:15 UTC. User says bet was rejected despite having sufficient balance.'
    ],
    examples_bad: [
      'User says game didn\'t work.',
      'Slot issue, please investigate.'
    ],
    source_location: { source_name: 'CS-Customer Support x Tech support - Process-050126-012722.pdf', page: 1, section: 'Best Practices for Jira Cases' }
  },
  {
    subcategory: 'Jira Best Practices',
    title: 'Jira - Do Not Copy/Paste Tech Responses',
    intent: 'Ensure agents understand and explain solutions rather than copying tech responses.',
    rule_text: `During case resolution:

DO NOT directly copy and paste Tech Support's response to users.

WHY: Tech Team responses are written for support agents to understand, not for end users.

INSTEAD:
- Fully comprehend the solution
- Explain it clearly to the user in your own words
- Share any documents/screenshots from tech unless instructed otherwise

If anything is unclear, seek clarification from senior team member or tech support directly.`,
    allowed_actions: ['Understand solution', 'Explain in own words', 'Share documents/screenshots', 'Ask for clarification'],
    disallowed_actions: ['Copy/paste tech response directly', 'Forward without understanding', 'Leave user confused'],
    tags: ['jira', 'tech_response', 'communication', 'explanation', 'no_copy_paste'],
    severity_default: 'high',
    evidence_requirements: 'Agent explains solution in their own words, not copy/pasted tech response.',
    verification_checks: [
      { check_id: 'OWN_WORDS', description: 'Agent explained solution in own words', required_when: 'Communicating tech resolution to user' },
      { check_id: 'SOLUTION_UNDERSTOOD', description: 'Agent demonstrated understanding of solution', required_when: 'Communicating tech resolution' }
    ],
    examples_good: [
      'Our technical team investigated and found that the payout was actually processed, but there was a display delay. Your balance should now show correctly after refreshing.',
      'The tech team confirmed this was due to a temporary sync issue. The bet was settled correctly and the winnings should be visible in your history now.'
    ],
    examples_bad: [
      '[Copy/paste of technical jargon from tech team]',
      'Tech says: "Settlement callback delayed due to provider timeout, auto-reconciled at T+10"'
    ],
    source_location: { source_name: 'CS-Customer Support x Tech support - Process-050126-012722.pdf', page: 2, section: 'Best Practices' }
  },
  {
    subcategory: 'Jira Best Practices',
    title: 'Jira - Reopen vs New Case',
    intent: 'Guide agents on when to reopen existing Jira vs create new case.',
    rule_text: `For issues in the same conversation:

SIMILAR/RELATED ISSUES:
- Reopen the Jira case that was previously created
- Do this by commenting on the existing case
- This keeps related issues together

UNRELATED ISSUES:
- Create a separate case
- This allows issues to be addressed separately

This organization helps both CS and Tech Support track and resolve issues efficiently.`,
    conditions: [
      {
        if: [{ field: 'issue_relation', operator: 'equals', value: 'similar' }],
        then: 'Reopen existing Jira by commenting',
        certainty: 'hard'
      },
      {
        if: [{ field: 'issue_relation', operator: 'equals', value: 'unrelated' }],
        then: 'Create separate Jira case',
        certainty: 'hard'
      }
    ],
    allowed_actions: ['Reopen by commenting for similar issues', 'Create new case for unrelated issues'],
    disallowed_actions: ['Create duplicate cases for same issue', 'Mix unrelated issues in one case'],
    tags: ['jira', 'reopen', 'new_case', 'organization', 'commenting'],
    severity_default: 'low',
    evidence_requirements: 'Agent correctly decides to reopen vs create new case based on issue relation.',
    examples_good: [
      'Since this is related to the same bet issue we discussed earlier, I\'ll add this to the existing ticket.',
      'This is a different issue from your earlier question, so I\'ll create a separate ticket for this.'
    ],
    examples_bad: [
      'I\'ll create another ticket for this same issue.',
      'Let me add this withdrawal question to your game issue ticket.'
    ],
    source_location: { source_name: 'CS-Customer Support x Tech support - Process-050126-012722.pdf', page: 2, section: 'Best Practices' }
  },
  {
    subcategory: 'Jira Best Practices',
    title: 'Jira - Bug Ticket Creation (Senior Only)',
    intent: 'Clarify that only senior support and team leaders create bug reports.',
    rule_text: `BUG TICKET CREATION:

Only senior support and team leaders are responsible for reporting bug cases.

REQUIREMENTS for bug reports:
1. Detailed explanation of the problem
2. Instructions on how to reproduce it
3. Any available screenshots

Regular support agents should escalate potential bugs to senior team members rather than creating bug tickets directly.`,
    conditions: [
      {
        if: [{ field: 'agent_level', operator: 'in', value: ['senior', 'team_leader'] }],
        then: 'Can create bug tickets',
        certainty: 'hard'
      },
      {
        if: [{ field: 'agent_level', operator: 'equals', value: 'regular' }],
        then: 'Escalate to senior for bug reporting',
        certainty: 'hard'
      }
    ],
    allowed_actions: ['Senior: Create bug ticket', 'Regular: Escalate to senior for bugs'],
    disallowed_actions: ['Regular agents creating bug tickets directly'],
    tags: ['jira', 'bug', 'senior', 'team_leader', 'escalation'],
    severity_default: 'medium',
    evidence_requirements: 'Bug tickets created only by senior support or team leaders.',
    examples_good: [
      'This looks like it could be a bug. Let me escalate this to our senior team for proper bug reporting.',
      '[Senior] I\'m creating a bug report with reproduction steps and screenshots for the dev team.'
    ],
    examples_bad: [
      '[Regular agent] I\'ll create a bug ticket for this.',
      'Reporting this as a bug.'
    ],
    source_location: { source_name: 'CS-Customer Support x Tech support - Process-050126-012722.pdf', page: 2, section: 'BUG ticket creation' }
  },

  // ==================== TROUBLESHOOTING ====================
  {
    subcategory: 'Troubleshooting Steps',
    title: 'Troubleshooting - Guide Users Step by Step',
    intent: 'Ensure agents guide users through troubleshooting rather than just listing steps.',
    rule_text: `IMPORTANT: Support agents should NOT merely copy and paste troubleshooting steps.

INSTEAD:
- Guide the user through EACH step
- Ensure the user understands the process
- Confirm they complete each step correctly
- Ask for results before moving to next step

Only escalate to Jira AFTER all troubleshooting steps have been followed and issue persists.`,
    allowed_actions: ['Guide through each step', 'Confirm completion', 'Ask for results', 'Escalate only after all steps fail'],
    disallowed_actions: ['Copy/paste full list of steps', 'Skip troubleshooting', 'Escalate before trying steps'],
    tags: ['troubleshooting', 'guide', 'step_by_step', 'user_assistance'],
    severity_default: 'high',
    evidence_requirements: 'Agent guides user through steps one by one, not just lists them.',
    verification_checks: [
      { check_id: 'GUIDED_APPROACH', description: 'Agent guided through steps individually', required_when: 'Troubleshooting required' },
      { check_id: 'COMPLETION_CONFIRMED', description: 'Agent confirmed user completed steps', required_when: 'Troubleshooting' }
    ],
    examples_good: [
      'Let\'s start by clearing your browser cache. Can you go to your browser settings and clear the cache and cookies? Let me know once you\'ve done that.',
      'Now that you\'ve cleared the cache, try loading the game again. Did that help? If not, let\'s try the next step.'
    ],
    examples_bad: [
      'Try: 1. Clear cache 2. Incognito mode 3. Different browser 4. Different device 5. Mirror site...',
      'Here are the troubleshooting steps: [lists all 10 steps]'
    ],
    source_location: { source_name: 'CS-Customer Support x Tech support - Process-050126-012722.pdf', page: 9, section: 'Troubleshooting Steps' }
  },
  {
    subcategory: 'Troubleshooting Steps',
    title: 'Troubleshooting - Standard Steps Reference',
    intent: 'Provide reference for standard troubleshooting steps.',
    rule_text: `Standard troubleshooting steps to guide users through:

1. CLEAR CACHE AND COOKIES - Outdated/corrupt data causes issues
2. USE INCOGNITO MODE - Disables extensions, uses clean session
3. TRY DIFFERENT BROWSER - Opera, Brave, etc. handle content differently
4. USE DIFFERENT DEVICE - Identifies device-specific issues
5. USE MIRROR SITES - Bypasses regional restrictions/connectivity issues
6. CHANGE INTERNET CONNECTION - WiFi, 3G, 4G, 5G, LTE
7. CLOSE UNNECESSARY TABS - Reduces browser overload
8. DISABLE BROWSER EXTENSIONS - Extensions can interfere
9. RESTART DEVICE - Resolves temporary issues
10. UPDATE DEVICE AND BROWSER - Updates include bug fixes

Guide through these ONE BY ONE, confirming each before proceeding.`,
    steps: [
      { step_number: 1, action: 'Clear cache and cookies' },
      { step_number: 2, action: 'Try incognito mode' },
      { step_number: 3, action: 'Try different browser' },
      { step_number: 4, action: 'Try different device' },
      { step_number: 5, action: 'Try mirror sites' },
      { step_number: 6, action: 'Change internet connection' },
      { step_number: 7, action: 'Close unnecessary tabs' },
      { step_number: 8, action: 'Disable browser extensions' },
      { step_number: 9, action: 'Restart device' },
      { step_number: 10, action: 'Update device and browser' }
    ],
    tags: ['troubleshooting', 'cache', 'incognito', 'browser', 'device', 'mirror', 'connection', 'extensions', 'restart', 'update'],
    severity_default: 'low',
    evidence_requirements: 'Agent uses appropriate troubleshooting steps for the issue type.',
    source_location: { source_name: 'CS-Customer Support x Tech support - Process-050126-012722.pdf', page: 9, section: 'Troubleshooting Steps' }
  },

  // ==================== TIPS AND TRICKS ====================
  {
    subcategory: 'Tips and Tricks',
    title: 'Login Issues - Rate Limited',
    intent: 'Handle rate-limited login issues.',
    rule_text: `When user cannot log in due to rate limiting:

SOLUTIONS:
1. Try using a different IP connection
2. Disable any VPN or Proxy services temporarily

Rate limiting occurs when too many login attempts are made in a short time.`,
    allowed_actions: ['Suggest different IP', 'Suggest disabling VPN/Proxy'],
    disallowed_actions: ['Immediately escalate', 'Skip these solutions'],
    tags: ['login', 'rate_limited', 'ip', 'vpn', 'proxy'],
    severity_default: 'low',
    examples_good: [
      'If you\'re having trouble logging in due to rate limiting, try connecting via a different IP address. Also, if you\'re using a VPN or proxy, try disabling it temporarily.'
    ],
    source_location: { source_name: 'CS-Customer Support x Tech support - Process-050126-012722.pdf', page: 11, section: 'Login Issues' }
  },
  {
    subcategory: 'Tips and Tricks',
    title: 'Captcha Error - Cannot Load',
    intent: 'Handle captcha loading issues.',
    rule_text: `When user sees "Cannot Load" captcha error:

SOLUTIONS:
1. Follow hCaptcha guide for basic steps
2. Follow Debugging Captcha guide for advanced steps

These guides provide step-by-step solutions for captcha issues.`,
    allowed_actions: ['Guide through hCaptcha steps', 'Guide through debugging steps'],
    disallowed_actions: ['Skip captcha troubleshooting', 'Immediately escalate'],
    tags: ['captcha', 'hcaptcha', 'cannot_load', 'error', 'debugging'],
    severity_default: 'low',
    examples_good: [
      'For captcha issues, let\'s go through some basic troubleshooting. First, try clearing your browser cache and refreshing the page. If that doesn\'t work, we can try more advanced debugging steps.'
    ],
    source_location: { source_name: 'CS-Customer Support x Tech support - Process-050126-012722.pdf', page: 11, section: 'Captcha Error' }
  },
  {
    subcategory: 'Tips and Tricks',
    title: '2FA Issues - Token Expired',
    intent: 'Handle 2FA token expired issues.',
    rule_text: `When user sees "Your Token Expired" for 2FA:

SOLUTIONS:
1. Delete the current QR code associated with 2FA
2. Log out of your account
3. Wait for 5 minutes
4. Log in again
5. Scan a new QR code to set up 2FA afresh

If issues persist after these steps, escalate by opening a Jira case.`,
    steps: [
      { step_number: 1, action: 'Delete current QR code from authenticator' },
      { step_number: 2, action: 'Log out of Stake account' },
      { step_number: 3, action: 'Wait 5 minutes' },
      { step_number: 4, action: 'Log in again' },
      { step_number: 5, action: 'Scan new QR code for 2FA' },
      { step_number: 6, action: 'If still failing, escalate via Jira' }
    ],
    allowed_actions: ['Guide through 2FA reset steps', 'Escalate if steps fail'],
    disallowed_actions: ['Skip troubleshooting steps', 'Immediately escalate'],
    tags: ['2fa', 'token_expired', 'qr_code', 'authenticator', 'login'],
    severity_default: 'medium',
    examples_good: [
      'For the expired token issue, let\'s try resetting your 2FA. First, delete the current QR code from your authenticator app. Then log out, wait about 5 minutes, and log back in to set up a fresh 2FA code.'
    ],
    source_location: { source_name: 'CS-Customer Support x Tech support - Process-050126-012722.pdf', page: 11, section: '2FA Issues' }
  },
  {
    subcategory: 'Tips and Tricks',
    title: 'Google Re-verification on Mirror Sites',
    intent: 'Handle Google re-verification issues when using mirror sites.',
    rule_text: `When users on MIRROR sites are prompted to re-verify with Google:

PROBLEM: Default re-verification link leads to stake.com, not the mirror site they're using.

SOLUTION:
1. When re-verification pop-up appears, note the URL in the link
2. Replace "stake.com" with the mirror site address they're using
3. Press Enter to proceed with re-verification

This allows re-verification to work correctly on mirror sites.`,
    steps: [
      { step_number: 1, action: 'Note the URL in the re-verification pop-up' },
      { step_number: 2, action: 'Replace "stake.com" with current mirror site address' },
      { step_number: 3, action: 'Press Enter to proceed' }
    ],
    allowed_actions: ['Explain URL replacement solution', 'Guide through mirror re-verification'],
    disallowed_actions: ['Tell user to use stake.com', 'Skip explanation'],
    tags: ['google', 'reverification', 'mirror', 'url', 'authentication'],
    severity_default: 'low',
    examples_good: [
      'Since you\'re on a mirror site, the Google re-verification link defaults to stake.com which won\'t work. In the pop-up URL, replace "stake.com" with the mirror address you\'re currently using, then press Enter.'
    ],
    source_location: { source_name: 'CS-Customer Support x Tech support - Process-050126-012722.pdf', page: 12, section: 'Re-verification with Google' }
  },
  {
    subcategory: 'Tips and Tricks',
    title: 'Sportsbook Bets - Note Sports Team',
    intent: 'Ensure agents note sports team for sportsbook bet investigations.',
    rule_text: `For ALL sportsbook bet issues:

ALWAYS note the sports team involved.

This allows the Sportsbook support team to perform in-depth investigation and detect if any issues arise.

Include the team name(s) in any Jira case or documentation.`,
    allowed_actions: ['Record sports team name', 'Include in Jira case'],
    disallowed_actions: ['Skip team name', 'Create sportsbook case without team info'],
    tags: ['sportsbook', 'sports_team', 'bet', 'investigation'],
    severity_default: 'low',
    examples_good: [
      'For this sportsbook bet issue, which teams were involved in the match? I need to include that for our investigation.',
      'Jira case: User reports bet issue. Match: Lakers vs Celtics, Bet ID: 12345...'
    ],
    source_location: { source_name: 'CS-Customer Support x Tech support - Process-050126-012722.pdf', page: 11, section: 'Sportsbook Bets' }
  },
  {
    subcategory: 'Tips and Tricks',
    title: 'Always Ask for More Information',
    intent: 'Encourage gathering maximum information before Jira cases.',
    rule_text: `Before opening a Jira case:

It is ALWAYS helpful for the Tech Team to have as much information as possible.

In some cases, you may resolve issues by simply asking the user for a screenshot from in-game history.

THEREFORE: Always ensure you fully understand the issue and gather as much information as possible.

More information = faster resolution.`,
    allowed_actions: ['Ask for screenshots', 'Ask for detailed explanation', 'Gather comprehensive info'],
    disallowed_actions: ['Create Jira with minimal info', 'Skip information gathering'],
    tags: ['information', 'screenshot', 'in_game_history', 'jira', 'investigation'],
    severity_default: 'medium',
    examples_good: [
      'Before I create a ticket, could you share a screenshot from your in-game history? This might help us resolve this faster.',
      'The more details you can provide, the quicker we can investigate. Can you tell me exactly what happened step by step?'
    ],
    source_location: { source_name: 'CS-Customer Support x Tech support - Process-050126-012722.pdf', page: 12, section: 'Ask for more information' }
  }
];

// ============================================================================
// MAIN SCRIPT
// ============================================================================

async function addTechnicalSupportKnowledge() {
  console.log('\n==========================================');
  console.log('   TECHNICAL SUPPORT KNOWLEDGE BUILDER');
  console.log('==========================================\n');

  try {
    // Step 1: Create or update the main category
    console.log('Step 1: Creating/Updating Technical Support category...');

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
    console.log('  - Jira Best Practices');
    console.log('  - Troubleshooting Steps');
    console.log('  - Tips and Tricks');
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
    await addTechnicalSupportKnowledge();
    await mongoose.connection.close();
    console.log('Database connection closed.');
    process.exit(0);
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
};

run();
