/**
 * Seed Script: Responsible Gambling Knowledge Base
 *
 * This script adds comprehensive Responsible Gambling (RG) knowledge to the QA Knowledge Base.
 * Includes both QACategory (for human-readable knowledge) and Rules (for AI evaluation).
 *
 * Run with: node seeds/seedResponsibleGambling.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const QACategory = require('../models/QACategory');
const Rule = require('../models/Rule');

// ===========================================
// QA CATEGORY DATA
// ===========================================

const RESPONSIBLE_GAMBLING_CATEGORY = {
  name: 'Responsible Gambling',
  description: 'Complete guide for handling responsible gambling (RG) cases. Includes terminology, addiction phases, risk management process, management tools, signposting, and all NEW procedures for RG-sensitive statements, self-exclusion, account closure, and data deletion.',
  knowledge: `## Responsible Gambling Overview

As a regulated online gambling casino, Stake has a social responsibility towards customers to minimise and protect them from gambling harms.

### Core Principles:
1. **Duty of Care**: Obligation to take applicable steps in protecting users from gambling harms when detected.
2. **Platform is for ENTERTAINMENT ONLY**: Gambling is not a form of investment.
3. **Only spend what you can afford to lose**: Key message to communicate to customers.

### Key Distinction - CRITICAL:
- "I have a gambling PROBLEM" → Provide RG tools (Stake Safe page)
- "I have a gambling ADDICTION" → Tag SS/SLs for RG Suspension/Signposting

This distinction is critical for proper case handling.`,

  keywords: [
    'responsible gambling', 'RG', 'self-exclusion', 'SE', 'account closure', 'AC',
    'gambling addiction', 'gambling problem', 'signposting', 'mitigation',
    'duty of care', 'stake safe', 'gambling limits', 'deposit limits',
    'cooling off', 'ban account', 'close account', 'delete account',
    'lost too much', 'in debt', 'spent salary', 'kill myself', 'suicide',
    'budget calculator', 'self-assessment', 'gambling therapy', 'gamblers anonymous',
    'data deletion', 'GDPR', 'RTP', 'return to play'
  ],

  evaluationCriteria: `When evaluating RG tickets, verify:
1. Agent correctly identified the risk level (low-risk RG statement vs high-risk)
2. For LOW-RISK statements (lost too much, spent salary, in debt): Agent showed empathy and directed to Stake Safe page - NO additional questions asked
3. For HIGH-RISK statements (addiction, kill myself, suicide threats): Agent tagged SS/SLs for SE and sent signposting macro
4. Agent distinguished between "gambling problem" (→ RG tools) and "gambling addiction" (→ SE/Signposting)
5. For SE/AC requests: Agent used correct macro flow (RG1, RG2, or RG3 based on situation)
6. Agent did NOT manually set self-exclusion - directed user to Self-Exclusion page
7. For account closure/reopening requests (after 24h): Agent forwarded to accountclosure@stake.com
8. For data deletion: Agent explained legal retention requirement and forwarded to accountclosure@stake.com
9. Agent did not dig deeper or ask additional questions that could trigger player to say something leading to SE`,

  subcategories: [
    // ===========================================
    // SUBCATEGORY 1: RG Terminology & Definitions
    // ===========================================
    {
      name: 'RG Terminology & Definitions',
      description: 'Key terms and definitions related to responsible gambling that agents must understand.',
      knowledge: `## RG Terminology

| Term | Definition |
|------|------------|
| **Self-exclusion (SE)** | Blocking access to the platform. When user sets SE themselves, account gets Banned (B) role with no further access. |
| **Mitigation** | Suspend further activity on platform when users make high-risk RG statements. |
| **Duty of Care** | Obligation to take applicable steps in protecting a user from gambling harms when detected. |
| **Responsible Gambling Tools** | Management tools used to manage customer activity: Self-exclusion, Break-in-play, Gambling Limits (Wager/Loss), Deposit Limits |
| **Signposting** | Industry terminology for educating customers on third-party help resources and contact details (Gamblers Anonymous, NCPG, Gamtalk, Gambling Therapy) |
| **Risk Factors** | Factors that present harm to a user |

### Account Roles for RG:
- **B (Banned)**: Applied when user sets self-exclusion. No platform access.
- **S (Suspended)**: Applied when user wishes to withdraw remaining balance (but not bonuses).`,
      keywords: ['terminology', 'definitions', 'self-exclusion', 'mitigation', 'duty of care', 'signposting', 'banned', 'suspended'],
      examples: [
        'User asks: "What does self-exclusion mean?" → Explain it blocks access to platform',
        'User mentions gambling harm → Duty of care requires applicable protective steps'
      ],
      evaluationCriteria: 'Agent correctly understands and applies RG terminology. Uses correct account roles (B for SE, S for withdrawal access).'
    },

    // ===========================================
    // SUBCATEGORY 2: Four Phases of Gambling Addiction
    // ===========================================
    {
      name: 'Four Phases of Gambling Addiction',
      description: 'Understanding the four phases helps identify customer risk level and appropriate response.',
      knowledge: `## Four Phases of Gambling Addiction

Understanding these phases helps determine the level of risk the customer presents.

### 1. Winning Phase
- Often drives gambling myths and fallacies
- Starts with big wins, leading customer to believe more will come by spending/wagering more
- **Agent Action**: Educate that they should only spend what they can afford to lose; outcome of bets is not guaranteed

### 2. Losing Phase
- Involves series of losses
- Customer believes they can "recoup" losses
- False beliefs drive behavior, often resulting in complaints about losses
- **Agent Action**: Educate that:
  1. Gambling is NOT a form of investment - entertainment purposes ONLY
  2. Only spend what you can afford to lose

### 3. Desperation Phase
- Customer LOSING CONTROL of gambling activities
- Consequences of compulsive gambling have caught up
- Gambling has negatively affected their life (financial, emotional, mental, physical)
- **Agent Action**: User is often no longer able to make informed decisions and requires our help

### 4. Hopeless Phase (CRITICAL - HIGH RISK)
- Customer hits rock bottom
- Reach point of wanting to commit suicide
- Threatening to kill/harm themselves or others
- **Agent Action**:
  1. User cannot make informed decisions - requires immediate help
  2. Customer MUST be suspended
  3. Send signposting macro
  4. Tag SS/SLs immediately`,
      keywords: ['winning phase', 'losing phase', 'desperation phase', 'hopeless phase', 'addiction phases', 'recoup', 'rock bottom', 'suicide'],
      examples: [
        'User says "I need to win back what I lost" → Losing Phase - educate about entertainment only',
        'User says "gambling has ruined my life" → Desperation Phase - user needs help',
        'User threatens self-harm → Hopeless Phase - IMMEDIATE suspension and signposting required'
      ],
      evaluationCriteria: 'Agent correctly identified the gambling phase based on customer statements and took appropriate action. For Hopeless Phase (suicide/self-harm threats), immediate suspension and signposting is mandatory.'
    },

    // ===========================================
    // SUBCATEGORY 3: Risk Management Process (3-Method)
    // ===========================================
    {
      name: 'Risk Management Process (3-Method)',
      description: 'The three-method approach for categorizing and handling RG cases based on risk level.',
      knowledge: `## Three-Method Risk Management Process

Once you identify the gambling phase, categorize the customer using this process:

### Method 1: MANAGE (Low Risk)
- **Action**: Redirect user to the **Stake Safe page** where RG tools are available
- **When**: Customer shows early signs or wants to self-manage
- **Tools available**: Gambling limits, deposit limits, self-assessment, budget calculator

### Method 2: MITIGATE (High Risk)
- **Action**: SUSPEND further activity when users make **high-risk RG statements**
- **When**: Customer cannot make informed decisions
- **Examples of high-risk statements**:
  - "I want to kill myself"
  - "I'm an addict"
  - "I have a gambling addiction"
  - Similar trigger words indicating serious threat to life
- **Required Actions**:
  1. Tag SS/SLs for RG Suspension
  2. Send Signposting macro
  3. Account must be restricted

### Method 3: UNCLEAR
- **Action**: Refer to the RG Decision Matrix
- **When**: Not clear which category applies

### CRITICAL - NEW PROCEDURE:
For **concerning but NOT high-risk** statements like:
- "I've lost too much"
- "I spent my salary here"
- "I'm in debt because of gambling"

**DO NOT** ask additional questions. Instead:
1. Show empathy
2. Direct to Stake Safe page for RG tools
3. Recommend GamblingTherapy.org

**Response Template**:
"We're truly sorry to hear about your experience. Please remember that our platform is intended solely for entertainment purposes. As your well-being is important to us, we encourage you to explore the responsible gambling tools available on our Stake Safe page. These resources can help you manage your gambling habits more effectively. Additionally, we can recommend support organizations such as GamblingTherapy.org, which offer professional help and advice."`,
      keywords: ['manage', 'mitigate', 'unclear', 'risk management', 'stake safe', 'high-risk statements', 'suspend', 'RG decision matrix'],
      examples: [
        'User: "I lost too much" → MANAGE - Direct to Stake Safe, do NOT ask questions',
        'User: "I am an addict" → MITIGATE - Suspend, tag SS/SLs, send signposting',
        'User: "I want to set limits" → MANAGE - Direct to Stake Safe page'
      ],
      evaluationCriteria: 'Agent correctly categorized the risk level. For concerning-but-not-high-risk statements, agent showed empathy and directed to Stake Safe WITHOUT asking additional questions. For high-risk statements, agent suspended and sent signposting.'
    },

    // ===========================================
    // SUBCATEGORY 4: Management Tools
    // ===========================================
    {
      name: 'RG Management Tools',
      description: 'Available responsible gambling tools that can be set by users or agents.',
      knowledge: `## RG Management Tools

### 1. Gambling Limits (Loss/Wager)
- User can set daily, weekly, or monthly limits on losses or wagers
- **Can be set by**: Both operator (Stake) AND user
- **Removing limit**: Takes 24 hours cooling off (if done by user)
- **Exception**: Platinum 5+ users may request immediate removal through support
- **Important**: When setting in ACP, limits are calculated in USD - convert if customer currency is non-USD
- **Process**: Set limit for user while educating them how to set it themselves for future

### 2. Deposit Limits
- Limits amount that can be deposited
- Any amount above limit is held and released once limit resets
- **Setting/lowering**: Takes effect immediately
- **Increasing/removing**: Requires 24-hour cooling-off period

### 3. Self-exclusion
- When user sets SE themselves → Account gets **Banned (B)** role
- No further access to Stake platform permitted
- **Suspended (S)** role: Applied when user wishes to withdraw remaining balance (but NOT bonuses)
- **NEW PROCESS**: We no longer set SE manually. Guide users to Self-Exclusion page to set it themselves.

### 4. Casino Exclusion (House Exclusion)
- Excludes from casino games EXCEPT Stake Poker
- User can still:
  - Use sports betting
  - Claim bonuses
  - Make transactions

### 5. Poker Exclusion
- Restricts from Stake Poker games only
- User can still:
  - Wager on sports
  - Play casino games (including third-party poker)
  - Access all other platform functionalities

### 6. Budget Calculator
- Allows user to evaluate finances for informed gambling decisions
- Displays available disposable income by inputting income and expenses

### 7. Self-Assessment (NODS)
- Quick 3-minute quiz with 10 questions
- Results help assess if user needs support managing gambling behaviour`,
      keywords: ['gambling limits', 'deposit limits', 'self-exclusion', 'casino exclusion', 'poker exclusion', 'budget calculator', 'self-assessment', 'cooling off', 'platinum 5'],
      examples: [
        'User wants to set loss limit → Educate on self-setting, help if needed, convert to USD',
        'User wants to increase limit → Inform about 24h cooling-off period',
        'User wants casino exclusion → Explain they can still use sports betting and other features'
      ],
      evaluationCriteria: 'Agent correctly explained tool functionality and limitations. For SE requests, agent directed to self-service page (NEW process). For limits, agent mentioned cooling-off periods and USD conversion requirement.'
    },

    // ===========================================
    // SUBCATEGORY 5: Signposting Information
    // ===========================================
    {
      name: 'Signposting Information',
      description: 'Third-party help resources to provide to customers with gambling problems.',
      knowledge: `## Signposting Information

If a customer has problems managing their gambling, provide these external support agencies:

### 1. Gamblers Anonymous
- **Website**: https://gamblersanonymous.org/ga/

### 2. Gambling Therapy
- **Website**: https://www.gamblingtherapy.org/
- **Contact**: support@gamblingtherapy.org

### 3. The National Council on Problem Gambling (Canada, excluding Ontario)
- **Phone**: 1-800-426-2537 (1-800-GAMBLER)
- **Chat**: https://www.ncpgambling.org/help-treatment/chat/
- Provides: FAQs, gambling behaviour self-assessment, treatment information, National Problem Gambling Helpline

### 4. Gamtalk
- **Website**: https://www.gamtalk.org/treatment-support/
- Resources from organizations worldwide for those struggling with problem gambling

### When to Send Signposting:
- HIGH-RISK RG statements (addiction, suicide threats, etc.)
- After setting SE for RG reasons
- When customer explicitly asks for external help resources

### Available on Site:
This information is available in Responsible Gambling FAQ's on Stake website`,
      keywords: ['signposting', 'gamblers anonymous', 'gambling therapy', 'ncpg', 'gamtalk', 'external help', 'helpline', '1-800-gambler'],
      examples: [
        'User says they are addicted → After SE, send signposting macro with all resources',
        'User asks where to get help → Provide signposting information',
        'User is in Hopeless Phase → Signposting is MANDATORY'
      ],
      evaluationCriteria: 'Agent provided signposting information when required (high-risk cases, explicit requests). Used correct macro with all relevant resources.'
    },

    // ===========================================
    // SUBCATEGORY 6: NEW - RG-Sensitive Statements Handling
    // ===========================================
    {
      name: 'RG-Sensitive Statements Handling (NEW)',
      description: 'NEW PROCEDURE: How to handle RG-sensitive player statements without triggering unnecessary escalation.',
      knowledge: `## NEW RG-Sensitive Statements Handling Procedure

### Key Change:
We are NO LONGER required to ask additional questions when players say something with RG-sensitive context.

### Goal:
NOT to dig deeper and trigger the player to say something that would lead to SE and signposting.

### Proper Response:
1. Show empathy
2. Demonstrate care about their well-being
3. Direct them to Stake Safe page for RG tools

### Examples of Concerning (but NOT high-risk) Statements:
- "I've lost too much"
- "I spent my salary here"
- "I'm in debt because of gambling"

### Suggested Response for These:
"We're truly sorry to hear about your experience. Please remember that our platform is intended solely for entertainment purposes. As your well-being is important to us, we encourage you to explore the responsible gambling tools available on our Stake Safe page. These resources can help you manage your gambling habits more effectively. Additionally, we can recommend support organizations such as GamblingTherapy.org, which offer professional help and advice."

---

## EXCEPTION - High-Risk RG Situations

The ONLY exception is for **HIGH-RISK** statements that indicate:
- Serious threat to life
- Gambling addiction (explicit statement)

### High-Risk Trigger Phrases:
- "I want to kill myself"
- "I'm an addict"
- "I have a gambling addiction"
- Similar explicit statements

### For High-Risk Cases:
1. SE the account immediately
2. Send signposting macro
3. Tag SS/SLs

---

## Critical Distinction:
| Statement | Classification | Action |
|-----------|---------------|--------|
| "I have a gambling problem" | NOT high-risk | Provide RG tools (Stake Safe) |
| "I have a gambling addiction" | HIGH-RISK | Tag SS/SLs for RG Suspension/Signposting |`,
      keywords: ['rg-sensitive', 'lost too much', 'spent salary', 'in debt', 'gambling problem', 'gambling addiction', 'empathy', 'stake safe', 'do not ask questions'],
      examples: [
        'User: "I lost my whole salary gambling" → Show empathy, direct to Stake Safe, DO NOT ask more questions',
        'User: "I have a gambling problem" → Direct to Stake Safe and RG tools',
        'User: "I am a gambling addict" → HIGH-RISK - Suspend, signpost, tag SS/SLs',
        'WRONG: Agent asks "How much did you lose?" after user said they lost too much'
      ],
      evaluationCriteria: 'Agent did NOT ask additional questions for concerning-but-not-high-risk statements. Agent showed empathy and directed to Stake Safe. Only for HIGH-RISK explicit statements (addiction, suicide) did agent proceed with SE and signposting.'
    },

    // ===========================================
    // SUBCATEGORY 7: NEW - Self-Exclusion & Account Closure Process
    // ===========================================
    {
      name: 'Self-Exclusion & Account Closure Process (NEW)',
      description: 'NEW PROCEDURE: Complete workflow for handling SE and AC requests including macro flow.',
      knowledge: `## NEW Self-Exclusion & Account Closure Process

### Key Change:
We NO LONGER set self-exclusions manually upon player request. We guide players to set it themselves.

---

## Process Flow:

### Step 1: When Player Requests to Close/Ban/Delete Account
Send **'RG1 - SE / AC macro'** explaining options

### Step 2: Based on Player's Choice
| Player Choice | Action |
|--------------|--------|
| Account Closure | Send **'Account Closure' macro** |
| Self-Exclusion | Send **'RG2 - SE how to - new process' macro** to redirect to SE page on site |

### Step 3: If Player Unresponsive to RG1 Macro
1. **Snooze ticket for 3 hours**
2. After unsnooze, check account status:
   - If account closed/excluded in meantime → Send **'Follow-up | SE/AC already set' macro**
   - If account still active → Send **'RG3 - SE/AC follow up' macro**

---

## Special Case: Account Deletion Requests
- Account deletion is NOT an available option
- Adjust RG1 macro: Clearly inform at START that deletion is not possible
- Continue with available options listed in RG1

---

## Flow Decision Guide:

### When to Use RG1 (Provide Options):
- Request is vague or unclear
- Could go either way (SE or AC)
- Example: "How can I close my account?"

### When to Skip RG1 and Send RG2 Directly:
- Specific duration mentioned (SE is the only option with exact durations)
  - Example: "Ban me for 1 year"
- Reasons provided are clearly RG-related
  - Example: "Ban me from gambling, I'm losing too much"

### Summary Logic:
1. **Specific duration mentioned** → Send SE instructions (RG2)
2. **RG-related reasons** → Send SE details (RG2)
3. **Vague/unclear/could go either way** → Use RG1 flow

---

## Macro Reference:
- **RG1**: Initial options macro (SE vs AC explanation)
- **RG2**: Self-exclusion instructions (how to set on site)
- **RG3**: Follow-up if account still active after snooze
- **Follow-up | SE/AC already set**: When action was taken during snooze`,
      keywords: ['self-exclusion', 'account closure', 'RG1', 'RG2', 'RG3', 'snooze', 'follow-up', 'ban account', 'close account', 'delete account', 'macro flow'],
      examples: [
        'User: "Ban me for 1 year" → Send RG2 directly (specific duration = SE)',
        'User: "How can I close my account?" → Send RG1 (vague request)',
        'User: "Ban me, I am losing too much" → Send RG2 (RG reasons = SE)',
        'User: "Delete my account" → Inform deletion not possible, then send RG1 with available options',
        'User unresponsive after RG1 → Snooze 3h, then check status and send appropriate follow-up'
      ],
      evaluationCriteria: 'Agent used correct macro flow. Did NOT manually set SE. For specific duration or RG reasons, went directly to RG2. For vague requests, used RG1 flow. For deletion requests, informed not possible before providing options. Snoozed correctly for unresponsive users.'
    },

    // ===========================================
    // SUBCATEGORY 8: NEW - Account Closure & Reopening Requests
    // ===========================================
    {
      name: 'Account Closure & Reopening Requests (NEW)',
      description: 'NEW PROCEDURE: How to handle closure and reopening requests, including email forwarding.',
      knowledge: `## NEW Account Closure & Reopening Email Procedure

### Key Change:
Account closure and reopening requests (after 24h have passed) are NO LONGER handled by support.

### New Email:
**accountclosure@stake.com**

---

## Who to Forward to accountclosure@stake.com:

### FORWARD (Closure for AC Reason):
- Users wanting to close account for Account Closure reason
- Users wanting to reopen account that was closed for AC reason (after 24h)

### Macro for Reopening:
Use: **'Account reopening | Forward to email'**

---

## Who NOT to Forward:

### DO NOT Forward (SE/RG Cases):
- Accounts suspended or banned for **Self-Exclusion** reason
- Accounts restricted for **RG reasons**

### For SE/RG Restricted Accounts:
- Explain account is already restricted
- Nothing can be done on it
- **Exception**: Suspended (S) accounts can still process withdrawals

---

## RTP Procedure:
Remains the same (no changes)

---

## Quick Reference:

| Account Status | Closure Request | Reopening Request |
|---------------|-----------------|-------------------|
| Active | Forward to accountclosure@stake.com | N/A |
| Closed (AC reason, 24h passed) | N/A | Forward to accountclosure@stake.com |
| Suspended (S) for SE/RG | Explain already restricted | Cannot reopen - explain restriction |
| Banned (B) for SE/RG | Explain already restricted | Cannot reopen - explain restriction |`,
      keywords: ['account closure', 'account reopening', 'accountclosure@stake.com', 'forward email', '24 hours', 'RTP'],
      examples: [
        'User wants to close account (not RG) → Forward to accountclosure@stake.com',
        'User with AC-closed account wants to reopen (24h passed) → Use reopening macro, forward to email',
        'User with SE/RG ban wants to reopen → Explain account is restricted, cannot be reopened',
        'User with S role wants to reopen → Explain restriction, but can still process withdrawals'
      ],
      evaluationCriteria: 'Agent correctly identified whether to forward to accountclosure@stake.com or not. Did NOT forward SE/RG cases. For SE/RG restricted accounts, explained the restriction clearly. Used correct reopening macro when applicable.'
    },

    // ===========================================
    // SUBCATEGORY 9: NEW - Data Deletion Requests (GDPR)
    // ===========================================
    {
      name: 'Data Deletion Requests (GDPR) (NEW)',
      description: 'NEW PROCEDURE: Handling GDPR data deletion requests - data deletion is now a valid reason for account closure, not actual data deletion.',
      knowledge: `## Data Deletion Requests (GDPR) - NEW PROCESS

### Overview:
Data deletion requests are now treated as a valid reason for **account closure**, NOT actual data deletion. We are legally required to retain records for compliance and audit purposes.

---

## Support Response to Data Deletion Requests:

**Standard Response:**
"We are legally required to retain records for a certain period of time under our licensing obligations to ensure compliance with applicable laws and audit requirements. Therefore, we regret to inform you that your request cannot be accepted."

This ensures the user understands legal obligations while redirecting towards account closure.

---

## Account Closure Procedure for Data Deletion:

### Step 1: Check Account Age
- **If account is UNDER 5 years old** → Proceed with closure process
- **If account is OVER 5 years old** → Tag Complaints who will raise with Compliance

### Step 2: Once User Agrees to Conditions
Forward them to send email to Account Closure Team: **accountclosure@stake.com**

---

## Return to Play (RTP) Process:

### Timing:
Users can submit RTP request **24 hours after** account was closed for data deletion.

### Verification Process:
1. User contacts Recovery Team
2. Proof of ownership begins
3. **Required documents:**
   - Selfie holding their ID
   - Note with username and date
4. Similar to existing KYC-Fraud/account recovery procedure

### Handling:
Account Closure Team (accountclosure@stake.com) handles proof-of-ownership verification.

### Approval:
When RTP is approved, tag **'RTP – Data Deletion Approved'** will be added.

---

## Key Notes:

1. **Account over 5 years**: Tag Complaints for Compliance review. Support confirms data must be retained for required period and case escalated to responsible department.

2. **Data NOT actually deleted**: All records retained for compliance and audit purposes.

3. **No KYC changes**: Once process initiated, no changes to KYC can be made.

4. **New cases only**: Accounts previously blocked for data deletion are NOT eligible for RTP.

5. **SE + Data Deletion**: If user has Self-Exclusion AND requests data deletion, still forward to Account Closure Team.

6. **SE + AC with Data Deletion tag**: If user has BOTH SE and AC request with data deletion reason/tag, forward to Account Closure Team FIRST. They will then forward to RG Team to continue.

---

## Quick Reference:

| Scenario | Action |
|----------|--------|
| Data deletion request (account < 5 years) | Explain legal retention → Forward to accountclosure@stake.com |
| Data deletion request (account > 5 years) | Tag Complaints for Compliance |
| RTP after data deletion closure | 24h wait → Verify ownership (selfie + ID + note) |
| User has SE + requests data deletion | Forward to Account Closure Team |
| User has SE + AC (data deletion tag) | Forward to Account Closure Team → They forward to RG Team |`,
      keywords: ['data deletion', 'GDPR', 'legal retention', 'compliance', 'RTP', 'return to play', 'accountclosure@stake.com', '5 years', 'selfie', 'proof of ownership', 'verification'],
      examples: [
        'User requests data deletion → Explain legal retention requirement, redirect to account closure',
        'Account is 6 years old + data deletion request → Tag Complaints for Compliance',
        'User wants to return after data deletion closure → 24h wait, then verify with selfie + ID + note',
        'User has SE and requests data deletion → Forward to Account Closure Team',
        'WRONG: Agent proceeds with data deletion without explaining legal retention',
        'WRONG: Agent tries to delete user data instead of processing as account closure'
      ],
      evaluationCriteria: 'Agent explained that data cannot be deleted due to legal requirements. Agent checked account age (5 year threshold). For accounts under 5 years, forwarded to accountclosure@stake.com. For accounts over 5 years, tagged Complaints. Agent did NOT attempt actual data deletion.'
    }
  ]
};

// ===========================================
// RULES DATA
// ===========================================

const RULES = [
  // ===========================================
  // RULE 1: Gambling Problem vs Addiction Distinction
  // ===========================================
  {
    subcategory: 'RG-Sensitive Statements Handling (NEW)',
    title: 'Gambling Problem vs Addiction Distinction',
    intent: 'Ensure agents correctly distinguish between "gambling problem" and "gambling addiction" and take appropriate action.',
    rule_text: '"I have a gambling problem" is NOT a synonym for "I have a gambling addiction". Problem = provide RG tools. Addiction = tag SS/SLs for SE/Signposting.',
    steps: [
      { step_number: 1, action: 'Identify if customer said "problem" or "addiction"', note: 'Exact wording matters' },
      { step_number: 2, action: 'For "problem": Direct to Stake Safe page and RG tools', note: 'No SE required' },
      { step_number: 3, action: 'For "addiction": Tag SS/SLs for RG Suspension/Signposting', note: 'HIGH-RISK case' }
    ],
    allowed_actions: ['Direct to Stake Safe for gambling problem', 'Tag SS/SLs for gambling addiction', 'Send signposting for addiction cases'],
    disallowed_actions: ['Treat problem as addiction', 'Ask additional probing questions', 'Ignore addiction statement'],
    conditions: [
      {
        if: [{ field: 'customer_statement', operator: 'contains', value: 'gambling problem' }],
        then: 'Provide RG tools and Stake Safe page',
        certainty: 'hard'
      },
      {
        if: [{ field: 'customer_statement', operator: 'contains', value: 'gambling addiction' }],
        then: 'Tag SS/SLs for SE and signposting - HIGH RISK',
        certainty: 'hard'
      },
      {
        if: [{ field: 'customer_statement', operator: 'contains', value: 'addict' }],
        then: 'Tag SS/SLs for SE and signposting - HIGH RISK',
        certainty: 'hard'
      }
    ],
    exceptions: [],
    examples_good: [
      'User: "I have a gambling problem" → Agent directs to Stake Safe',
      'User: "I am an addict" → Agent tags SS/SLs and sends signposting'
    ],
    examples_bad: [
      'User says "gambling problem" → Agent suspends account (WRONG)',
      'User says "gambling addiction" → Agent only sends RG tools (WRONG - needs SE)'
    ],
    tags: ['gambling_problem', 'gambling_addiction', 'rg_distinction', 'high_risk', 'stake_safe', 'signposting'],
    severity_default: 'critical',
    evidence_requirements: 'Customer message containing either "gambling problem" or "gambling addiction" and agent response',
    verification_checks: [
      { check_id: 'verify_customer_wording', description: 'Verify exact wording customer used', internal_tool_action: 'Check transcript for exact phrase', required_when: 'Unclear which term was used' }
    ],
    source_location: { source_name: 'RG New Procedure Announcement', section: 'Gambling problem vs Gambling addiction' }
  },

  // ===========================================
  // RULE 2: No Additional Questions for Low-Risk RG Statements
  // ===========================================
  {
    subcategory: 'RG-Sensitive Statements Handling (NEW)',
    title: 'No Additional Questions for Low-Risk RG Statements',
    intent: 'Prevent agents from asking additional questions that could trigger escalation for low-risk RG statements.',
    rule_text: 'When players make RG-sensitive but NOT high-risk statements (lost too much, spent salary, in debt), agents must NOT ask additional questions. Show empathy and direct to Stake Safe page.',
    steps: [
      { step_number: 1, action: 'Recognize low-risk RG statement', note: 'Lost too much, spent salary, in debt, etc.' },
      { step_number: 2, action: 'Show empathy - acknowledge their experience', note: 'Do NOT ask "how much?" or similar' },
      { step_number: 3, action: 'Direct to Stake Safe page for RG tools', note: 'Can also recommend GamblingTherapy.org' }
    ],
    allowed_actions: ['Show empathy', 'Direct to Stake Safe', 'Recommend GamblingTherapy.org', 'Explain platform is for entertainment'],
    disallowed_actions: ['Ask how much they lost', 'Ask about their financial situation', 'Probe deeper into gambling habits', 'Ask any additional questions that could trigger SE'],
    conditions: [
      {
        if: [{ field: 'customer_statement', operator: 'contains', value: 'lost too much' }],
        then: 'Show empathy and direct to Stake Safe - NO additional questions',
        certainty: 'hard'
      },
      {
        if: [{ field: 'customer_statement', operator: 'contains', value: 'spent my salary' }],
        then: 'Show empathy and direct to Stake Safe - NO additional questions',
        certainty: 'hard'
      },
      {
        if: [{ field: 'customer_statement', operator: 'contains', value: 'in debt' }],
        then: 'Show empathy and direct to Stake Safe - NO additional questions',
        certainty: 'hard'
      }
    ],
    exceptions: [
      { description: 'High-risk statements (suicide, addiction) require different handling', when: 'Customer mentions suicide, killing themselves, or explicitly states addiction' }
    ],
    examples_good: [
      'User: "I lost too much" → Agent: "We\'re truly sorry to hear... please explore our Stake Safe page..."',
      'User: "I spent my whole salary" → Agent shows empathy, directs to RG tools without asking more'
    ],
    examples_bad: [
      'User: "I lost too much" → Agent: "How much did you lose?" (WRONG - probing)',
      'User: "I\'m in debt" → Agent: "Can you tell me more about your gambling?" (WRONG - probing)'
    ],
    tags: ['low_risk_rg', 'no_probing', 'empathy', 'stake_safe', 'lost_too_much', 'spent_salary', 'in_debt'],
    severity_default: 'high',
    evidence_requirements: 'Customer RG statement and agent response showing whether additional questions were asked',
    verification_checks: [],
    source_location: { source_name: 'RG New Procedure Announcement', section: 'Handling RG-Sensitive Player Statements' }
  },

  // ===========================================
  // RULE 3: High-Risk RG Statements Require Immediate Action
  // ===========================================
  {
    subcategory: 'RG-Sensitive Statements Handling (NEW)',
    title: 'High-Risk RG Statements Require Immediate SE and Signposting',
    intent: 'Ensure immediate suspension and signposting for high-risk RG statements indicating threat to life.',
    rule_text: 'High-risk RG statements (suicide threats, "I\'m an addict", "gambling addiction") require immediate SE and signposting macro. These are the ONLY exceptions to the "no additional questions" rule.',
    steps: [
      { step_number: 1, action: 'Identify high-risk statement', note: 'Suicide, kill myself, addict, gambling addiction' },
      { step_number: 2, action: 'SE the account immediately', note: 'Do not wait for confirmation' },
      { step_number: 3, action: 'Send signposting macro', note: 'External help resources' },
      { step_number: 4, action: 'Tag SS/SLs', note: 'For RG tracking' }
    ],
    allowed_actions: ['Immediately SE account', 'Send signposting macro', 'Tag SS/SLs'],
    disallowed_actions: ['Only provide RG tools without SE', 'Wait for customer confirmation', 'Ignore high-risk statement'],
    conditions: [
      {
        if: [{ field: 'customer_statement', operator: 'contains', value: 'kill myself' }],
        then: 'IMMEDIATE SE + Signposting + Tag SS/SLs',
        certainty: 'hard'
      },
      {
        if: [{ field: 'customer_statement', operator: 'contains', value: 'suicide' }],
        then: 'IMMEDIATE SE + Signposting + Tag SS/SLs',
        certainty: 'hard'
      },
      {
        if: [{ field: 'customer_statement', operator: 'contains', value: 'I\'m an addict' }],
        then: 'IMMEDIATE SE + Signposting + Tag SS/SLs',
        certainty: 'hard'
      }
    ],
    exceptions: [],
    examples_good: [
      'User: "I want to kill myself" → Agent immediately SEs account and sends signposting',
      'User: "I\'m a gambling addict" → Agent tags SS/SLs, SEs, and sends help resources'
    ],
    examples_bad: [
      'User mentions suicide → Agent only sends Stake Safe link (WRONG - needs SE)',
      'User says they are addict → Agent asks "Are you sure?" (WRONG - immediate action required)'
    ],
    tags: ['high_risk_rg', 'suicide', 'addict', 'immediate_se', 'signposting', 'critical'],
    severity_default: 'critical',
    evidence_requirements: 'High-risk customer statement and evidence of SE + signposting',
    verification_checks: [
      { check_id: 'verify_se_applied', description: 'Verify SE was applied to account', internal_tool_action: 'Check account status for B role', required_when: 'High-risk statement identified' }
    ],
    source_location: { source_name: 'RG New Procedure Announcement', section: 'High-risk RG situations' }
  },

  // ===========================================
  // RULE 4: SE/AC Macro Flow
  // ===========================================
  {
    subcategory: 'Self-Exclusion & Account Closure Process (NEW)',
    title: 'SE/AC Request Macro Flow',
    intent: 'Ensure agents use correct macro flow for self-exclusion and account closure requests.',
    rule_text: 'No longer set SE manually. For SE/AC requests: RG1 for options, RG2 for SE instructions, Account Closure macro for AC. Skip RG1 if request clearly indicates SE (specific duration or RG reasons).',
    steps: [
      { step_number: 1, action: 'Evaluate request clarity', note: 'Is it vague or specific?' },
      { step_number: 2, action: 'If vague/unclear: Send RG1 macro with options', note: 'e.g., "How can I close my account?"' },
      { step_number: 3, action: 'If specific duration mentioned: Send RG2 directly', note: 'e.g., "Ban me for 1 year"' },
      { step_number: 4, action: 'If RG reasons given: Send RG2 directly', note: 'e.g., "Ban me, I\'m losing too much"' },
      { step_number: 5, action: 'If user chooses AC: Send Account Closure macro', note: '' },
      { step_number: 6, action: 'If user chooses SE: Send RG2 with site instructions', note: 'User sets SE themselves' }
    ],
    allowed_actions: ['Send RG1 for vague requests', 'Send RG2 for clear SE requests', 'Send Account Closure macro', 'Skip RG1 when SE is obvious'],
    disallowed_actions: ['Manually set SE for user', 'Skip all macros', 'Send RG1 when SE is clearly indicated'],
    conditions: [
      {
        if: [{ field: 'request_type', operator: 'equals', value: 'vague_closure_request' }],
        then: 'Send RG1 macro with options',
        certainty: 'hard'
      },
      {
        if: [{ field: 'request_type', operator: 'equals', value: 'specific_duration_ban' }],
        then: 'Send RG2 directly - SE is only option with exact durations',
        certainty: 'hard'
      },
      {
        if: [{ field: 'request_type', operator: 'equals', value: 'rg_related_ban' }],
        then: 'Send RG2 directly - SE for RG cases',
        certainty: 'hard'
      }
    ],
    exceptions: [
      { description: 'Account deletion requests', when: 'User requests deletion - inform not possible, then provide RG1 options' }
    ],
    examples_good: [
      'User: "Ban me for 1 year" → Agent sends RG2 directly (specific duration)',
      'User: "How can I close my account?" → Agent sends RG1 (vague)',
      'User: "Ban me, I lose too much" → Agent sends RG2 (RG reason)'
    ],
    examples_bad: [
      'User: "Ban me for 6 months" → Agent sends RG1 (WRONG - should be RG2)',
      'User requests SE → Agent manually sets it (WRONG - direct to site)'
    ],
    tags: ['se_ac_flow', 'RG1', 'RG2', 'macro_flow', 'self_exclusion', 'account_closure'],
    severity_default: 'high',
    evidence_requirements: 'User request and macro used by agent',
    verification_checks: [],
    source_location: { source_name: 'RG New Procedure Announcement', section: 'Self-Exclusion and Account Closures' }
  },

  // ===========================================
  // RULE 5: Snooze for Unresponsive SE/AC Requests
  // ===========================================
  {
    subcategory: 'Self-Exclusion & Account Closure Process (NEW)',
    title: 'Snooze and Follow-up for Unresponsive SE/AC Requests',
    intent: 'Ensure proper follow-up when users do not respond to initial SE/AC options.',
    rule_text: 'If user does not respond to RG1 macro, snooze ticket for 3 hours. After unsnooze, send appropriate follow-up based on account status.',
    steps: [
      { step_number: 1, action: 'Send RG1 macro', note: '' },
      { step_number: 2, action: 'If no response: Snooze for 3 hours', note: '' },
      { step_number: 3, action: 'After unsnooze: Check account status', note: '' },
      { step_number: 4, action: 'If account closed/SE set: Send "Follow-up | SE/AC already set" macro', note: '' },
      { step_number: 5, action: 'If account still active: Send RG3 macro', note: '' }
    ],
    allowed_actions: ['Snooze for 3 hours', 'Send Follow-up SE/AC already set', 'Send RG3 follow-up'],
    disallowed_actions: ['Close ticket without follow-up', 'Snooze for wrong duration', 'Send wrong follow-up macro'],
    conditions: [
      {
        if: [{ field: 'user_response', operator: 'equals', value: 'no_response' }, { field: 'rg1_sent', operator: 'equals', value: true }],
        then: 'Snooze ticket for 3 hours',
        certainty: 'hard'
      },
      {
        if: [{ field: 'account_status_after_snooze', operator: 'in', value: ['closed', 'self_excluded'] }],
        then: 'Send "Follow-up | SE/AC already set" macro',
        certainty: 'hard'
      },
      {
        if: [{ field: 'account_status_after_snooze', operator: 'equals', value: 'active' }],
        then: 'Send RG3 follow-up macro',
        certainty: 'hard'
      }
    ],
    exceptions: [],
    examples_good: [
      'User unresponsive after RG1 → Agent snoozes 3h → Account closed → Sends "SE/AC already set" macro',
      'User unresponsive after RG1 → Agent snoozes 3h → Account active → Sends RG3 macro'
    ],
    examples_bad: [
      'User unresponsive → Agent closes ticket (WRONG - needs follow-up)',
      'User unresponsive → Agent snoozes for 24h (WRONG - should be 3h)'
    ],
    tags: ['snooze', 'follow_up', 'RG3', 'unresponsive', 'se_ac_flow'],
    severity_default: 'medium',
    evidence_requirements: 'RG1 sent, no response, snooze action, follow-up macro',
    verification_checks: [
      { check_id: 'verify_snooze_duration', description: 'Verify ticket was snoozed for 3 hours', internal_tool_action: 'Check ticket history for snooze duration', required_when: 'User was unresponsive' }
    ],
    source_location: { source_name: 'RG New Procedure Announcement', section: 'Self-Exclusion and Account Closures' }
  },

  // ===========================================
  // RULE 6: Account Closure Email Forwarding
  // ===========================================
  {
    subcategory: 'Account Closure & Reopening Requests (NEW)',
    title: 'Forward AC Requests to accountclosure@stake.com',
    intent: 'Ensure account closure and reopening requests are forwarded to the correct email.',
    rule_text: 'Account closure and reopening requests (after 24h) must be forwarded to accountclosure@stake.com. Do NOT forward SE/RG restricted accounts.',
    steps: [
      { step_number: 1, action: 'Identify if request is for AC closure or reopening', note: '' },
      { step_number: 2, action: 'Check if account is SE/RG restricted', note: '' },
      { step_number: 3, action: 'If NOT SE/RG: Forward to accountclosure@stake.com', note: '' },
      { step_number: 4, action: 'If SE/RG restricted: Explain account is restricted, nothing can be done', note: 'Exception: S accounts can process withdrawals' }
    ],
    allowed_actions: ['Forward AC requests to accountclosure@stake.com', 'Explain restriction for SE/RG accounts', 'Use Account reopening macro'],
    disallowed_actions: ['Forward SE/RG cases to AC email', 'Handle AC requests in support', 'Process reopening for SE/RG accounts'],
    conditions: [
      {
        if: [{ field: 'request_type', operator: 'equals', value: 'account_closure' }, { field: 'account_restriction', operator: 'not_in', value: ['SE', 'RG'] }],
        then: 'Forward to accountclosure@stake.com',
        certainty: 'hard'
      },
      {
        if: [{ field: 'request_type', operator: 'equals', value: 'account_reopening' }, { field: 'closure_reason', operator: 'equals', value: 'AC' }],
        then: 'Forward to accountclosure@stake.com (after 24h)',
        certainty: 'hard'
      },
      {
        if: [{ field: 'account_restriction', operator: 'in', value: ['SE', 'RG'] }],
        then: 'Explain account is restricted - cannot be reopened. S accounts can still withdraw.',
        certainty: 'hard'
      }
    ],
    exceptions: [],
    examples_good: [
      'User wants to close account (not RG) → Agent forwards to accountclosure@stake.com',
      'User with SE ban wants to reopen → Agent explains restriction, cannot be reopened'
    ],
    examples_bad: [
      'User with SE wants to reopen → Agent forwards to AC email (WRONG - SE cases not forwarded)',
      'User wants AC closure → Agent handles in support (WRONG - forward to email)'
    ],
    tags: ['account_closure', 'account_reopening', 'forward_email', 'accountclosure_email', 'se_restriction'],
    severity_default: 'high',
    evidence_requirements: 'User request type, account restriction status, agent action',
    verification_checks: [
      { check_id: 'verify_account_restriction', description: 'Check if account has SE/RG restriction', internal_tool_action: 'Check account roles and restriction history', required_when: 'Closure or reopening requested' }
    ],
    source_location: { source_name: 'RG New Procedure Announcement', section: 'Account Closure and Reopening Requests' }
  },

  // ===========================================
  // RULE 7: Data Deletion Legal Response
  // ===========================================
  {
    subcategory: 'Data Deletion Requests (GDPR) (NEW)',
    title: 'Data Deletion - Legal Retention Response',
    intent: 'Ensure agents explain legal data retention requirements and redirect to account closure.',
    rule_text: 'For data deletion requests, explain legal retention requirements and redirect to account closure process. Data deletion is now a valid reason for account closure, not actual data deletion.',
    steps: [
      { step_number: 1, action: 'Explain legal retention requirement', note: '"We are legally required to retain records for a certain period of time under our licensing obligations..."' },
      { step_number: 2, action: 'Inform request cannot be accepted as data deletion', note: '' },
      { step_number: 3, action: 'Check account age', note: 'Over or under 5 years?' },
      { step_number: 4, action: 'If under 5 years: Redirect to account closure via accountclosure@stake.com', note: '' },
      { step_number: 5, action: 'If over 5 years: Tag Complaints for Compliance', note: '' }
    ],
    allowed_actions: ['Explain legal retention', 'Redirect to account closure', 'Forward to accountclosure@stake.com', 'Tag Complaints for 5+ year accounts'],
    disallowed_actions: ['Actually delete user data', 'Process without explaining legal retention', 'Ignore account age check'],
    conditions: [
      {
        if: [{ field: 'request_type', operator: 'equals', value: 'data_deletion' }, { field: 'account_age', operator: 'equals', value: 'under_5_years' }],
        then: 'Explain legal retention, redirect to accountclosure@stake.com for closure',
        certainty: 'hard'
      },
      {
        if: [{ field: 'request_type', operator: 'equals', value: 'data_deletion' }, { field: 'account_age', operator: 'equals', value: 'over_5_years' }],
        then: 'Tag Complaints who will raise with Compliance',
        certainty: 'hard'
      }
    ],
    exceptions: [],
    examples_good: [
      'User requests data deletion (account 2 years old) → Agent explains legal retention, forwards to accountclosure@stake.com',
      'User requests data deletion (account 6 years old) → Agent explains and tags Complaints'
    ],
    examples_bad: [
      'User requests data deletion → Agent tries to delete data (WRONG - not possible)',
      'User requests data deletion → Agent proceeds without checking account age (WRONG)'
    ],
    tags: ['data_deletion', 'gdpr', 'legal_retention', 'account_closure', '5_year_check', 'compliance'],
    severity_default: 'high',
    evidence_requirements: 'Data deletion request, agent explanation of legal retention, account age check, forwarding action',
    verification_checks: [
      { check_id: 'verify_account_age', description: 'Check if account is over or under 5 years old', internal_tool_action: 'Check account creation date', required_when: 'Data deletion requested' }
    ],
    source_location: { source_name: 'Data Deletion New Process', section: 'Support Response to Data Deletion Requests' }
  },

  // ===========================================
  // RULE 8: Data Deletion RTP Process
  // ===========================================
  {
    subcategory: 'Data Deletion Requests (GDPR) (NEW)',
    title: 'Data Deletion - Return to Play Process',
    intent: 'Ensure proper RTP process for accounts closed due to data deletion request.',
    rule_text: 'Users can request RTP 24 hours after data deletion closure. Verification requires selfie with ID and note with username and date. Account Closure Team handles verification.',
    steps: [
      { step_number: 1, action: 'Confirm 24 hours have passed since closure', note: '' },
      { step_number: 2, action: 'Direct user to contact Recovery Team', note: '' },
      { step_number: 3, action: 'Explain required documents: selfie holding ID + note with username and date', note: 'Similar to KYC-Fraud/account recovery' },
      { step_number: 4, action: 'Account Closure Team handles verification', note: '' },
      { step_number: 5, action: 'When approved, tag "RTP – Data Deletion Approved" is added', note: '' }
    ],
    allowed_actions: ['Explain RTP process', 'Direct to Recovery Team', 'Explain verification requirements'],
    disallowed_actions: ['Allow RTP before 24h', 'Handle verification in support', 'Skip proof of ownership'],
    conditions: [
      {
        if: [{ field: 'time_since_closure', operator: 'equals', value: 'under_24h' }],
        then: 'Inform user must wait 24 hours from closure',
        certainty: 'hard'
      },
      {
        if: [{ field: 'time_since_closure', operator: 'equals', value: 'over_24h' }, { field: 'closure_reason', operator: 'equals', value: 'data_deletion' }],
        then: 'Direct to Recovery Team for verification',
        certainty: 'hard'
      }
    ],
    exceptions: [
      { description: 'Previously blocked accounts not eligible', when: 'Account was blocked for data deletion before new procedure' }
    ],
    examples_good: [
      'User wants RTP after data deletion (25h ago) → Agent directs to Recovery Team, explains selfie + ID + note required',
      'User wants RTP after data deletion (12h ago) → Agent explains must wait 24h'
    ],
    examples_bad: [
      'User wants RTP after 10h → Agent proceeds with RTP (WRONG - must wait 24h)',
      'User wants RTP → Agent does not mention verification requirements (WRONG)'
    ],
    tags: ['rtp', 'return_to_play', 'data_deletion', 'verification', 'selfie', '24_hours', 'recovery_team'],
    severity_default: 'medium',
    evidence_requirements: 'RTP request, time since closure, agent explanation of verification',
    verification_checks: [
      { check_id: 'verify_closure_time', description: 'Verify 24 hours have passed since closure', internal_tool_action: 'Check account closure timestamp', required_when: 'RTP requested after data deletion closure' }
    ],
    source_location: { source_name: 'Data Deletion New Process', section: 'Return to Play (RTP) Process' }
  },

  // ===========================================
  // RULE 9: SE + Data Deletion Combined Case
  // ===========================================
  {
    subcategory: 'Data Deletion Requests (GDPR) (NEW)',
    title: 'SE and Data Deletion Combined Cases',
    intent: 'Handle cases where user has both SE and data deletion request properly.',
    rule_text: 'If user has SE and requests data deletion, forward to Account Closure Team. If user has BOTH SE and AC with data deletion tag, Account Closure Team forwards to RG Team.',
    steps: [
      { step_number: 1, action: 'Check if user has existing SE', note: '' },
      { step_number: 2, action: 'If SE + data deletion request: Forward to Account Closure Team', note: 'They can still be forwarded' },
      { step_number: 3, action: 'If SE + AC with data deletion tag: Account Closure Team forwards to RG Team', note: 'RG Team continues process' }
    ],
    allowed_actions: ['Forward SE + data deletion to Account Closure Team', 'Explain process for combined cases'],
    disallowed_actions: ['Refuse to forward SE cases for data deletion', 'Handle SE + data deletion in support alone'],
    conditions: [
      {
        if: [{ field: 'has_se', operator: 'equals', value: true }, { field: 'request_type', operator: 'equals', value: 'data_deletion' }],
        then: 'Forward to Account Closure Team',
        certainty: 'hard'
      },
      {
        if: [{ field: 'has_se', operator: 'equals', value: true }, { field: 'has_ac_data_deletion_tag', operator: 'equals', value: true }],
        then: 'Account Closure Team forwards to RG Team',
        certainty: 'hard'
      }
    ],
    exceptions: [],
    examples_good: [
      'User has SE, requests data deletion → Agent forwards to Account Closure Team',
      'User has SE + AC (data deletion tag) → Account Closure Team handles, then forwards to RG Team'
    ],
    examples_bad: [
      'User has SE, requests data deletion → Agent refuses to forward (WRONG - can still forward)',
      'User has SE + AC with data deletion → Support tries to handle entirely (WRONG - needs team escalation)'
    ],
    tags: ['se_data_deletion', 'combined_case', 'account_closure_team', 'rg_team', 'escalation'],
    severity_default: 'medium',
    evidence_requirements: 'SE status, data deletion request, escalation to appropriate team',
    verification_checks: [
      { check_id: 'verify_se_status', description: 'Check if user has existing SE', internal_tool_action: 'Check account for SE/B role', required_when: 'Data deletion requested' }
    ],
    source_location: { source_name: 'Data Deletion New Process', section: 'Key Notes' }
  },

  // ===========================================
  // RULE 10: Gambling Limits USD Conversion
  // ===========================================
  {
    subcategory: 'RG Management Tools',
    title: 'Gambling Limits USD Conversion Requirement',
    intent: 'Ensure gambling limits are set correctly in USD when customer uses non-USD currency.',
    rule_text: 'When setting gambling limits in ACP, amounts are calculated in USD. Agent must convert to USD if customer currency is non-USD.',
    steps: [
      { step_number: 1, action: 'Determine customer currency', note: '' },
      { step_number: 2, action: 'If non-USD: Convert requested limit to USD', note: 'Use current exchange rate' },
      { step_number: 3, action: 'Set limit in ACP using USD amount', note: '' },
      { step_number: 4, action: 'Educate user how to set limits themselves for future', note: '' }
    ],
    allowed_actions: ['Convert to USD', 'Set limit in ACP', 'Educate on self-service'],
    disallowed_actions: ['Set limit without USD conversion', 'Ignore currency difference'],
    conditions: [
      {
        if: [{ field: 'customer_currency', operator: 'not_equals', value: 'USD' }],
        then: 'Convert limit amount to USD before setting in ACP',
        certainty: 'hard'
      }
    ],
    exceptions: [],
    examples_good: [
      'User wants €100 limit → Agent converts to ~$110 USD and sets in ACP',
      'User wants BTC limit → Agent converts to USD equivalent'
    ],
    examples_bad: [
      'User wants €100 limit → Agent sets $100 (WRONG - needs conversion)',
      'User uses crypto → Agent sets limit without USD conversion (WRONG)'
    ],
    tags: ['gambling_limits', 'usd_conversion', 'acp', 'currency'],
    severity_default: 'medium',
    evidence_requirements: 'Customer currency, requested limit amount, actual limit set in ACP',
    verification_checks: [
      { check_id: 'verify_currency_conversion', description: 'Verify limit was correctly converted to USD', internal_tool_action: 'Check ACP limit value against customer request', required_when: 'Customer currency is not USD' }
    ],
    source_location: { source_name: 'Responsible Gambling Stake.com', page: 4, section: 'Management tools - Gambling Limits' }
  },

  // ===========================================
  // RULE 11: 24h Cooling Off for Limit Changes
  // ===========================================
  {
    subcategory: 'RG Management Tools',
    title: '24h Cooling Off for Limit Increases/Removal',
    intent: 'Ensure agents correctly explain cooling-off periods for limit changes.',
    rule_text: 'Setting or lowering limits takes effect immediately. Increasing or removing limits requires 24-hour cooling-off period. Platinum 5+ may request immediate removal through support.',
    steps: [
      { step_number: 1, action: 'Identify type of limit change requested', note: 'Set/lower vs increase/remove' },
      { step_number: 2, action: 'If setting or lowering: Inform takes effect immediately', note: '' },
      { step_number: 3, action: 'If increasing or removing: Inform about 24h cooling-off', note: '' },
      { step_number: 4, action: 'Check VIP status for Platinum 5+ exception', note: 'Immediate removal possible for P5+' }
    ],
    allowed_actions: ['Set/lower limits immediately', 'Explain 24h cooling off', 'Process immediate removal for Platinum 5+'],
    disallowed_actions: ['Immediately increase limits without cooling off', 'Skip VIP check for exception'],
    conditions: [
      {
        if: [{ field: 'limit_action', operator: 'in', value: ['set', 'lower'] }],
        then: 'Process immediately',
        certainty: 'hard'
      },
      {
        if: [{ field: 'limit_action', operator: 'in', value: ['increase', 'remove'] }],
        then: '24-hour cooling-off period required',
        certainty: 'hard'
      },
      {
        if: [{ field: 'limit_action', operator: 'equals', value: 'remove' }, { field: 'vip_status', operator: 'equals', value: 'platinum_5_plus' }],
        then: 'May process immediate removal upon request',
        certainty: 'hard'
      }
    ],
    exceptions: [
      { description: 'Platinum 5+ VIP exception', when: 'User is Platinum 5 or higher and requests immediate limit removal' }
    ],
    examples_good: [
      'User wants to increase limit → Agent explains 24h cooling-off required',
      'Platinum 5 user wants immediate limit removal → Agent processes it'
    ],
    examples_bad: [
      'User wants to increase limit → Agent processes immediately (WRONG - needs 24h)',
      'Regular user wants immediate removal → Agent processes it (WRONG - only P5+)'
    ],
    tags: ['cooling_off', '24_hours', 'limit_increase', 'limit_removal', 'platinum_5', 'vip'],
    severity_default: 'medium',
    evidence_requirements: 'Type of limit change, agent response about cooling-off, VIP status if relevant',
    verification_checks: [
      { check_id: 'verify_vip_status', description: 'Check if user is Platinum 5+', internal_tool_action: 'Check VIP tier in account', required_when: 'Immediate limit removal requested' }
    ],
    source_location: { source_name: 'Responsible Gambling Stake.com', page: 4, section: 'Management tools - Gambling Limits' }
  },

  // ===========================================
  // RULE 12: No Manual SE Setting
  // ===========================================
  {
    subcategory: 'Self-Exclusion & Account Closure Process (NEW)',
    title: 'No Manual Self-Exclusion Setting',
    intent: 'Ensure agents do not manually set self-exclusion for users.',
    rule_text: 'Agents must NOT set self-exclusion manually. Guide users to the Self-Exclusion page on the site to set it themselves.',
    steps: [
      { step_number: 1, action: 'Receive SE request from user', note: '' },
      { step_number: 2, action: 'Send RG2 macro with instructions', note: 'How to set SE on site' },
      { step_number: 3, action: 'DO NOT set SE manually in ACP', note: '' }
    ],
    allowed_actions: ['Send RG2 with SE instructions', 'Guide to Self-Exclusion page'],
    disallowed_actions: ['Manually set SE in ACP', 'Set B role directly for SE request'],
    conditions: [
      {
        if: [{ field: 'request_type', operator: 'equals', value: 'self_exclusion' }],
        then: 'Send RG2 macro - guide user to set SE themselves on site',
        certainty: 'hard'
      }
    ],
    exceptions: [
      { description: 'High-risk RG statements', when: 'User makes high-risk statement (suicide, addiction) - SE required immediately by support' }
    ],
    examples_good: [
      'User: "I want to self-exclude" → Agent sends RG2 with instructions to set on site'
    ],
    examples_bad: [
      'User: "I want to self-exclude" → Agent sets SE manually (WRONG - user should do it)'
    ],
    tags: ['no_manual_se', 'self_exclusion', 'RG2', 'user_self_service'],
    severity_default: 'high',
    evidence_requirements: 'SE request and whether agent set it manually or guided to self-service',
    verification_checks: [],
    source_location: { source_name: 'RG New Procedure Announcement', section: 'Self-Exclusion and Account Closures – New Process' }
  }
];

// ===========================================
// SEED FUNCTION
// ===========================================

async function seedResponsibleGambling() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/clara';
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    // ========== STEP 1: Create/Update QACategory ==========
    console.log('\n📚 Creating/Updating QACategory...');

    let category;
    const existing = await QACategory.findOne({
      name: { $regex: new RegExp(`^${RESPONSIBLE_GAMBLING_CATEGORY.name}$`, 'i') }
    });

    if (existing) {
      console.log('   Responsible Gambling category exists. Updating...');
      existing.description = RESPONSIBLE_GAMBLING_CATEGORY.description;
      existing.knowledge = RESPONSIBLE_GAMBLING_CATEGORY.knowledge;
      existing.keywords = RESPONSIBLE_GAMBLING_CATEGORY.keywords;
      existing.evaluationCriteria = RESPONSIBLE_GAMBLING_CATEGORY.evaluationCriteria;
      existing.subcategories = RESPONSIBLE_GAMBLING_CATEGORY.subcategories;
      existing.isActive = true;
      await existing.save();
      category = existing;
      console.log('   ✅ Category UPDATED');
    } else {
      category = await QACategory.create({
        ...RESPONSIBLE_GAMBLING_CATEGORY,
        isActive: true
      });
      console.log('   ✅ Category CREATED');
    }

    console.log(`   - ID: ${category._id}`);
    console.log(`   - ${category.subcategories.length} subcategories`);

    // ========== STEP 2: Create Rules ==========
    console.log('\n📋 Creating Rules...');

    // Delete existing rules for this category first
    const deletedCount = await Rule.deleteMany({ category: category._id });
    console.log(`   Deleted ${deletedCount.deletedCount} existing rules`);

    // Create new rules
    let rulesCreated = 0;
    for (const ruleData of RULES) {
      const rule_id = Rule.generateRuleId(RESPONSIBLE_GAMBLING_CATEGORY.name, ruleData.title);

      const rule = await Rule.create({
        rule_id,
        category: category._id,
        category_name: RESPONSIBLE_GAMBLING_CATEGORY.name,
        ...ruleData,
        isActive: true
      });

      rulesCreated++;
      console.log(`   ✅ Rule: ${rule.title.substring(0, 50)}...`);
    }

    console.log(`\n   Total rules created: ${rulesCreated}`);

    // ========== SUMMARY ==========
    console.log('\n' + '='.repeat(60));
    console.log('🎉 SEED COMPLETED SUCCESSFULLY!');
    console.log('='.repeat(60));
    console.log(`\n📚 QACategory: ${category.name}`);
    console.log(`   - ${category.subcategories.length} subcategories:`);
    category.subcategories.forEach((sub, i) => {
      console.log(`     ${i + 1}. ${sub.name}`);
    });
    console.log(`\n📋 Rules: ${rulesCreated} created`);
    RULES.forEach((rule, i) => {
      console.log(`     ${i + 1}. ${rule.title}`);
    });

    // Disconnect
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');

  } catch (error) {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  seedResponsibleGambling();
}

module.exports = { seedResponsibleGambling, RESPONSIBLE_GAMBLING_CATEGORY, RULES };
