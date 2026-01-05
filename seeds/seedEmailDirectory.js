/**
 * Seed Script: Email Directory & Escalation Knowledge Base
 *
 * This script adds Email Directory knowledge - when to direct users to which email
 * and procedures for email escalations.
 *
 * Run with: node seeds/seedEmailDirectory.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const QACategory = require('../models/QACategory');
const Rule = require('../models/Rule');

// ===========================================
// EMAIL REFERENCE DATA
// ===========================================

const EMAILS = {
  // Account & Recovery
  accounts: { email: 'accounts@stake.com', purpose: 'SuspendedSportsbook users', response_time: null },
  accountclosure: { email: 'accountclosure@stake.com', purpose: 'Account closure/reopening requests', response_time: null },
  recovery: { email: 'recovery@stake.com', purpose: '2FA issues, email change, Telegram verification, hacked accounts, OAuth', response_time: '24 hours' },
  safergambling: { email: 'Safergambling@stake.com', purpose: 'Banned users recovery requests', response_time: null },

  // Complaints & Compliance
  complaints: { email: 'complaints@stake.com', purpose: 'GDPR, persistent complaints (country restrictions, minors, SE)', response_time: '10 business days' },
  compliance: { email: 'compliance@stake.com', purpose: 'ONLY for authorities - NOT for customers', response_time: null, internal_only: true },
  escalation_support: { email: 'escalation-support@stake.com', purpose: 'Third-party review platform complaints', response_time: null },

  // Community & Forum
  community: { email: 'community@stake.com', purpose: 'Forum questions (registration, confirmation, access)', response_time: null },
  communitycomplaints: { email: 'communitycomplaints@stake.com', purpose: 'Moderator complaints, community management concerns', response_time: null },

  // Finance & Payments
  fundsrecovery: { email: 'fundsrecovery@stake.com', purpose: 'Crypto deposit issues (wrong tag/memo)', response_time: '72 hours' },
  payments: { email: 'payments@stake.com', purpose: 'Fiat inquiries (only after back-office ticket)', response_time: null },

  // Technical & Support
  support: { email: 'support@stake.com', purpose: 'General customer support via email', response_time: null },
  techsupport: { email: 'techsupport@stake.com', purpose: 'Technical issues, game malfunctions, bug bounty', response_time: null },
  gameplay: { email: 'gameplay@stake.com', purpose: 'Suspected fraudulent activity (only when role notes instruct)', response_time: null, conditional: true },

  // VIP & Partners
  partners: { email: 'partners@stake.com', purpose: 'Affiliate Manager contact', response_time: null },
  vipbackuphost: { email: 'vipbackuphost@stake.com', purpose: 'Serbian VIP host users', response_time: null, avoid_sharing: true },
  vip_feedback: { email: 'VIP.feedback@stake.com', purpose: 'VIP feedback', response_time: null },
  vip_tipping: { email: 'vip.tipping@stake.com', purpose: 'VIP host tipping requests', response_time: null },

  // Automated/System
  noreply: { email: 'noreply@stake.com', purpose: 'Transactional emails (login codes, 2FA, password reset)', response_time: null, system: true },
  noreply_mail: { email: 'noreply@mail.stake.com', purpose: 'Marketing/promotional emails', response_time: null, system: true },
  onboarding: { email: 'onboarding@stake.com', purpose: 'KYC verification issues (only when KYC team advises)', response_time: null, avoid_sharing: true },

  // Regional
  afiliados_co: { email: 'afiliados@stake.com.co', purpose: 'Partnership queries for Stake Colombia', response_time: null },
  office: { email: 'office@stake.com', purpose: 'Job applications', response_time: null, rarely_shared: true }
};

// ===========================================
// QA CATEGORY DATA
// ===========================================

const EMAIL_DIRECTORY_CATEGORY = {
  name: 'Email Directory & Escalation',
  description: 'Reference guide for all Stake platform email addresses, when to direct users to each email, and proper escalation procedures.',
  knowledge: `## Email Directory Overview

This category provides clarification on what email to use when issues cannot be resolved on live support and require other team assistance.

### Quick Reference - Most Common Emails:

| Email | Use Case | Response Time |
|-------|----------|---------------|
| **recovery@stake.com** | 2FA, email change, hacked accounts, OAuth | 24 hours |
| **complaints@stake.com** | GDPR, country restrictions, minors, SE complaints | 10 business days |
| **fundsrecovery@stake.com** | Crypto deposit issues (wrong tag/memo) | 72 hours |
| **accountclosure@stake.com** | Account closure/reopening | - |
| **support@stake.com** | General email support, ownership verification | - |
| **techsupport@stake.com** | Technical issues, game malfunctions | - |

### Emails NOT to Share with Customers:
- **compliance@stake.com** - ONLY for authorities (regulators, police)
- **onboarding@stake.com** - Only when KYC team advises
- **vipbackuphost@stake.com** - Avoid sharing on CS end
- **gameplay@stake.com** - Only when role notes specifically instruct

### Important Principles:
1. Always try to resolve issues on live support FIRST
2. Use correct email for the specific issue type
3. Inform users of expected response times
4. Never share internal-only emails with customers
5. Escalate to appropriate Slack channels if no response within expected time`,

  keywords: [
    'email', 'escalation', 'forward', 'contact', 'support', 'recovery', 'complaints',
    'fundsrecovery', 'techsupport', 'compliance', 'community', 'payments', 'partners',
    'accountclosure', 'safergambling', 'vip', 'gdpr', '2fa', 'hacked', 'oauth'
  ],

  evaluationCriteria: `When evaluating Email Directory tickets, verify:
1. Agent directed user to correct email for their issue type
2. Agent informed user of expected response time when applicable
3. Agent did NOT share internal-only emails (compliance@, gameplay@, onboarding@)
4. Agent attempted to resolve issue first before forwarding to email
5. For recovery@: Agent confirmed issue requires recovery team (not tech support)
6. For complaints@: Agent followed standard complaint-handling procedure first
7. For fundsrecovery@: Agent used correct macro with required information
8. Agent provided correct escalation channel if team didn't respond in time`,

  subcategories: [
    // ===========================================
    // SUBCATEGORY 1: Account & Recovery Emails
    // ===========================================
    {
      name: 'Account & Recovery Emails',
      description: 'Emails for account-related issues including recovery, closure, and special account statuses.',
      knowledge: `## Account & Recovery Emails

### recovery@stake.com
**Purpose:** Account recovery and security issues
**Response Time:** 24 hours

**Forward users for:**
- 2FA issues (lost authenticator, can't access 2FA)
- Email change requests
- Telegram verification cases
- Hacked account reports / Account sale reports
- Users who lost access to OAuth accounts (Google, Facebook)

**NOT for:**
- Password changes (users can do via login page or account settings)
- Login codes not arriving (open Jira ticket for Tech Support first)
- Withdrawal confirmation emails not arriving (Jira ticket first)

**VIP Users with lost Telegram access:**
Forward to VIP host on Telegram - VIP team decides if TG verification needed.

**Escalation:** If no reply within 24 hours → cs-account-recovery channel

---

### accountclosure@stake.com
**Purpose:** Account closure and reopening requests
**Response Time:** Not defined

Users must contact this email DIRECTLY for:
- Closing their account
- Reopening their account
- Any requests related to account closure

---

### accounts@stake.com
**Purpose:** SuspendedSportsbook users
**Response Time:** Not defined

Used for users assigned with SuspendedSportsbook reasons.
Refer to specific roles for guidance on handling each situation.

---

### Safergambling@stake.com
**Purpose:** Banned users account recovery
**Response Time:** Not defined

Managed by Customer Welfare team.
Used for banned users' requests to recover their accounts.`,
      keywords: ['recovery', 'accountclosure', 'accounts', 'safergambling', '2fa', 'email change', 'hacked', 'oauth', 'telegram', 'banned'],
      examples: [
        'User lost 2FA access → recovery@stake.com (24h response)',
        'User wants to close account → accountclosure@stake.com',
        'User has SuspendedSportsbook → accounts@stake.com',
        'Banned user wants account back → Safergambling@stake.com'
      ],
      evaluationCriteria: 'Agent used correct account/recovery email for the issue. Agent informed of 24h response time for recovery. Agent did not send password issues to recovery (use login page). Agent escalated to cs-account-recovery if no reply in 24h.'
    },

    // ===========================================
    // SUBCATEGORY 2: Complaints & Compliance Emails
    // ===========================================
    {
      name: 'Complaints & Compliance Emails',
      description: 'Emails for formal complaints, GDPR requests, and compliance matters.',
      knowledge: `## Complaints & Compliance Emails

### complaints@stake.com
**Purpose:** Formal complaints and GDPR requests
**Response Time:** Up to 10 business days

**Forward users for:**
1. **GDPR information requests** - Always forward to this email
2. **Persistent complaints** about (after following standard procedure):
   - Country Restrictions
   - Minors
   - Self-exclusion
   - User explicitly requests complaints email

**Standard Complaint-Handling Procedure:**
1. If customer complains about above issues, direct to support@stake.com first
2. After receiving email, continue to converse with user
3. Efforts should be made to resolve issue directly on our end first
4. Only forward to complaints@ if cannot resolve

**How to handle after forwarding:**
1. When CS confirms user is forwarded to complaints@stake.com, close the conversation on Intercom
2. Can tag complaints@stake.com in Intercom note for reference

---

### compliance@stake.com
**Purpose:** Communications from authorities ONLY
**Response Time:** Not defined

⚠️ **THIS EMAIL IS ONLY FOR AUTHORITIES - SHALL NOT BE PROVIDED TO CUSTOMERS**

Use when receiving communications from:
- Regulators
- Police
- Other authorities

Especially when emails are only sent to support@stake.com inbox.

**When unsure where to escalate:** Use complaints@stake.com

**Action:** Can tag "Compliance Stake" in Intercom note

---

### escalation-support@stake.com
**Purpose:** Third-party review platform complaints
**Response Time:** Not defined

Used to communicate with users who have submitted complaints about Stake on third-party review platforms (Trustpilot, etc.).`,
      keywords: ['complaints', 'compliance', 'escalation', 'gdpr', 'authorities', 'regulator', 'police', 'trustpilot', 'review'],
      examples: [
        'User requests GDPR data → complaints@stake.com (10 business days)',
        'User persistently complains about country restriction → Follow procedure first, then complaints@stake.com',
        'Email from regulator/police → compliance@stake.com (internal only)',
        'User complained on Trustpilot → escalation-support@stake.com'
      ],
      evaluationCriteria: 'Agent followed standard complaint procedure before forwarding to complaints@. Agent did NOT share compliance@ with customers. Agent informed of 10 business day response time for complaints@. Agent tagged Compliance Stake in note when appropriate.'
    },

    // ===========================================
    // SUBCATEGORY 3: Community & Forum Emails
    // ===========================================
    {
      name: 'Community & Forum Emails',
      description: 'Emails for forum-related inquiries and community concerns.',
      knowledge: `## Community & Forum Emails

### community@stake.com
**Purpose:** General Forum questions and assistance
**Response Time:** Not defined

**Use for:**
- Issues registering for the Forum
- Problems receiving Forum confirmation email
- User requesting help with Forum access or profile

---

### communitycomplaints@stake.com
**Purpose:** Community complaints including moderator issues
**Response Time:** Not defined

**Use for:**
- Complaints about moderator behavior
- Concerns about how the Community is being managed
- Reports of inappropriate moderation in Forum or chat

---

## When NOT to Use These Emails:

| Issue | Correct Action |
|-------|----------------|
| **Mute Appeals** | Direct to Forum Appeal Page |
| **Chat Issues** | Escalate to Supervisors or Seniors |
| **Forum Promotions** | Handled by Customer Support, not community email |

**Unsure where to escalate?** Use the **cm-support channel**`,
      keywords: ['community', 'forum', 'moderator', 'chat', 'mute', 'appeal'],
      examples: [
        'User can\'t register for Forum → community@stake.com',
        'User complains about moderator → communitycomplaints@stake.com',
        'User wants mute appeal → Forum Appeal Page (NOT email)',
        'Chat issue → Escalate to Supervisor/Senior (NOT email)'
      ],
      evaluationCriteria: 'Agent used correct community email for the issue type. Agent did NOT use community emails for mute appeals, chat issues, or forum promotions. Agent escalated to cm-support channel when unsure.'
    },

    // ===========================================
    // SUBCATEGORY 4: Finance & Payments Emails
    // ===========================================
    {
      name: 'Finance & Payments Emails',
      description: 'Emails for crypto fund recovery and fiat payment issues.',
      knowledge: `## Finance & Payments Emails

### fundsrecovery@stake.com
**Purpose:** Crypto deposit issues that CS cannot resolve
**Response Time:** 72 hours

**Use for:**
- Deposits sent without destination tag/memo
- Deposits with wrong destination tag/memo
- Crypto deposit issues that cannot be resolved by CS

**Required Information from User:**
1. Transaction hash of deposit
2. Screenshot from personal wallet (NOT from Explorer)
3. Stake username

**Screenshot must contain:**
- Date and time
- Amount
- Recipient address

**Macro to Use:** "G) Funds Recovery" - translate for each market

**Escalation:** If no reply after 72 hours → payment-support channel (include user's email)

---

### payments@stake.com
**Purpose:** Fiat-related inquiries
**Response Time:** Not defined

⚠️ **Only use when payment team suggests after opening a back-office ticket**

Do NOT proactively send users to this email - only when instructed by payments team.`,
      keywords: ['fundsrecovery', 'payments', 'crypto', 'deposit', 'fiat', 'transaction', 'tag', 'memo', '72 hours'],
      examples: [
        'User sent crypto without memo → fundsrecovery@stake.com with macro (72h response)',
        'Fiat payment issue → Open back-office ticket first, only use payments@ if team suggests',
        'No reply from fundsrecovery after 72h → Escalate to payment-support channel'
      ],
      evaluationCriteria: 'Agent used Funds Recovery macro with correct required information. Agent informed user of 72h response time. Agent did NOT send fiat issues to fundsrecovery@. Agent only used payments@ when payment team instructed.'
    },

    // ===========================================
    // SUBCATEGORY 5: Technical & Support Emails
    // ===========================================
    {
      name: 'Technical & Support Emails',
      description: 'Emails for technical issues, general support, and gameplay concerns.',
      knowledge: `## Technical & Support Emails

### support@stake.com
**Purpose:** General customer support via email
**Response Time:** Not defined

**Use when:**
- Users need to contact support via email
- Need to verify ownership of account
- General inquiries that require email communication

---

### techsupport@stake.com
**Purpose:** Technical issues requiring expertise
**Response Time:** Not defined

**Use for:**
- Game malfunctions that CS cannot resolve due to limited data access
- Issues requiring technical expertise
- Crucial bug bounty reports

**Important:** Generally open a Jira case on Intercom FIRST when user experiences technical issues. Only forward to email if Jira cannot resolve.

---

### gameplay@stake.com
**Purpose:** Suspected fraudulent activity
**Response Time:** Not defined (instruct user to wait)

⚠️ **Only use when role notes SPECIFICALLY instruct us to do so**

This email is sent to users suspected of fraudulent activity.

**Do NOT proactively share this email** - only when account role notes require it.`,
      keywords: ['support', 'techsupport', 'gameplay', 'technical', 'bug', 'malfunction', 'jira', 'fraudulent'],
      examples: [
        'User needs email support → support@stake.com',
        'Game malfunction, CS can\'t resolve → techsupport@stake.com (after Jira ticket)',
        'User has fraudulent activity role note → gameplay@stake.com (only if notes say so)',
        'Bug report → techsupport@stake.com'
      ],
      evaluationCriteria: 'Agent opened Jira ticket first for technical issues before using techsupport@. Agent only used gameplay@ when role notes specifically instructed. Agent did NOT proactively share gameplay@ email.'
    },

    // ===========================================
    // SUBCATEGORY 6: VIP & Partners Emails
    // ===========================================
    {
      name: 'VIP & Partners Emails',
      description: 'Emails for VIP users, affiliate managers, and partnership inquiries.',
      knowledge: `## VIP & Partners Emails

### partners@stake.com
**Purpose:** Affiliate Manager contact
**Response Time:** Not defined

**Use when:**
- Official affiliate doesn't know their manager's contact
- Official affiliate claims to have received bonus offers from their manager
- User complains about unlinking their registered affiliate

---

### vip.tipping@stake.com
**Purpose:** VIP host tipping requests
**Response Time:** Not defined

Used when users want to request tipping their VIP host.

---

### vipbackuphost@stake.com
**Purpose:** Serbian VIP host users
**Response Time:** Not defined

⚠️ **Avoid sharing this email on CS end - reference only**

Used for users with:
- Serbian VIP host
- Tagged "VIP host email convo" on ACP

Users with this tag must contact this email for VIP host inquiries.

---

### VIP.feedback@stake.com
**Purpose:** VIP feedback
**Response Time:** Not defined

---

## Regional Emails

### afiliados@stake.com.co
**Purpose:** Partnership queries for Stake Colombia
**Response Time:** Not defined

---

### office@stake.com
**Purpose:** Job applications
**Response Time:** Not defined

⚠️ **Rarely share this email** - consult with supervisors if needed.`,
      keywords: ['vip', 'partners', 'affiliate', 'tipping', 'colombia', 'job', 'office', 'serbian'],
      examples: [
        'Affiliate doesn\'t know their manager → partners@stake.com',
        'User wants to tip VIP host → vip.tipping@stake.com',
        'Serbian VIP host user → vipbackuphost@stake.com (avoid sharing proactively)',
        'Colombia partnership query → afiliados@stake.com.co'
      ],
      evaluationCriteria: 'Agent used correct VIP/partner email for the situation. Agent avoided sharing vipbackuphost@ proactively. Agent consulted supervisor before sharing office@.'
    },

    // ===========================================
    // SUBCATEGORY 7: System & Automated Emails
    // ===========================================
    {
      name: 'System & Automated Emails',
      description: 'Information about automated transactional and marketing emails from the platform.',
      knowledge: `## System & Automated Emails

### noreply@stake.com
**Purpose:** Transactional emails (automated)
**Response Time:** N/A - System generated

**Types of emails sent:**
- Confirm Email
- Login Codes
- Enable 2FA
- Password Reset
- Creditos OTP
- Verification Code
- Session Alert
- Sportsbook Suspended
- Suspended
- User Snapshot Summary

**If user not receiving these emails:**
1. Ensure they check spam folder and subfolders
2. Report by opening case to technical support via Jira on Intercom

---

### noreply@mail.stake.com
**Purpose:** Marketing/promotional emails
**Response Time:** N/A - System generated

**Types of emails sent:**
- Monthly Bonus
- Post-Monthly Bonus
- Promotional Wagering Offer
- CRM Casino & Sports Promotion
- Deposit Bonuses
- Welcome Bonus
- Birthday Bonus

**If user not receiving these emails:**
1. Ensure they check spam folder and subfolders
2. Report in marketing-support channel
3. OR forward to supervisors to resubscribe on ACP

---

### onboarding@stake.com
**Purpose:** KYC verification issues
**Response Time:** Not defined

⚠️ **We don't actively share this email with users on CS end**

Only use when:
- Customers have issues uploading KYC verification
- KYC team advises us to do so

The Veriff link (additional KYC process measure) is sent from this email.`,
      keywords: ['noreply', 'transactional', 'marketing', 'promotional', 'bonus', 'onboarding', 'kyc', 'veriff', 'spam'],
      examples: [
        'User not receiving login codes → Check spam, then Jira ticket (NOT recovery@)',
        'User not receiving monthly bonus email → Check spam, then marketing-support channel',
        'KYC upload issues and KYC team advises → onboarding@stake.com'
      ],
      evaluationCriteria: 'Agent advised to check spam folder first. Agent opened Jira ticket for transactional email issues. Agent used marketing-support channel for promotional email issues. Agent did NOT proactively share onboarding@.'
    }
  ]
};

// ===========================================
// RULES DATA
// ===========================================

const RULES = [
  // ===========================================
  // RECOVERY EMAIL RULES
  // ===========================================
  {
    subcategory: 'Account & Recovery Emails',
    title: 'Recovery Email - Correct Use Cases',
    intent: 'Ensure agents use recovery@stake.com only for appropriate cases.',
    rule_text: 'recovery@stake.com is for 2FA issues, email change requests, Telegram verification, hacked accounts, account sale reports, and OAuth access issues. It is NOT for password changes or login code issues (use Jira first). Response time is 24 hours.',
    steps: [
      { step_number: 1, action: 'Identify if issue requires Recovery team', note: '2FA, email change, hacked, OAuth' },
      { step_number: 2, action: 'For login codes not arriving: Open Jira ticket first', note: 'Tech Support can resolve' },
      { step_number: 3, action: 'If Recovery team needed: Direct to recovery@stake.com', note: '' },
      { step_number: 4, action: 'Inform user of 24 hour response time', note: '' },
      { step_number: 5, action: 'If no reply in 24h: Escalate to cs-account-recovery channel', note: '' }
    ],
    allowed_actions: ['Send to recovery@ for 2FA/email change/hacked/OAuth', 'Open Jira for login code issues', 'Inform 24h response time'],
    disallowed_actions: ['Send password changes to recovery@', 'Send login code issues directly to recovery@', 'Skip Jira for tech issues'],
    conditions: [
      {
        if: [{ field: 'issue_type', operator: 'in', value: ['2fa_lost', 'email_change', 'hacked', 'oauth_lost', 'telegram_verification'] }],
        then: 'Direct to recovery@stake.com, inform 24h response time',
        certainty: 'hard'
      },
      {
        if: [{ field: 'issue_type', operator: 'equals', value: 'login_codes_not_arriving' }],
        then: 'Open Jira ticket for Tech Support first, NOT recovery@',
        certainty: 'hard'
      }
    ],
    exceptions: [
      { description: 'User with VIP host lost Telegram access', when: 'Forward to VIP host on Telegram instead - VIP team decides' }
    ],
    examples_good: [
      'User lost 2FA authenticator → recovery@stake.com (24h response)',
      'User not receiving login codes → Open Jira ticket first'
    ],
    examples_bad: [
      'User wants password change → Agent sends to recovery@ (WRONG - use login page)',
      'Login codes not arriving → Agent sends directly to recovery@ without Jira (WRONG)'
    ],
    tags: ['recovery', '2fa', 'email_change', 'hacked', 'oauth', '24_hours', 'jira'],
    severity_default: 'high',
    evidence_requirements: 'Agent used recovery@ only for correct cases, opened Jira for tech issues',
    verification_checks: [
      { check_id: 'verify_correct_email_use', description: 'Verify recovery@ used for correct issue type', internal_tool_action: 'Check issue type vs email used', required_when: 'User directed to recovery@' }
    ],
    source_location: { source_name: 'List of emails on Stake', page: 8, section: 'recovery@stake.com' }
  },

  // ===========================================
  // COMPLAINTS EMAIL RULES
  // ===========================================
  {
    subcategory: 'Complaints & Compliance Emails',
    title: 'Complaints Email - Follow Standard Procedure First',
    intent: 'Ensure agents follow standard complaint-handling procedure before forwarding to complaints@stake.com.',
    rule_text: 'Before forwarding to complaints@stake.com, agents must follow standard complaint-handling procedure and try to resolve the issue first. Only forward for GDPR requests, or persistent complaints about country restrictions, minors, or self-exclusion that cannot be resolved. Response time is 10 business days.',
    steps: [
      { step_number: 1, action: 'If GDPR request: Forward directly to complaints@stake.com', note: 'Always forward GDPR' },
      { step_number: 2, action: 'For other complaints: Follow standard procedure first', note: '' },
      { step_number: 3, action: 'Direct to support@stake.com first for formal handling', note: '' },
      { step_number: 4, action: 'Try to resolve on our end', note: '' },
      { step_number: 5, action: 'If cannot resolve and user persists: Forward to complaints@stake.com', note: '' },
      { step_number: 6, action: 'Close Intercom conversation after confirming forward', note: '' }
    ],
    allowed_actions: ['Forward GDPR directly', 'Follow standard procedure for other complaints', 'Tag complaints@ in Intercom note'],
    disallowed_actions: ['Forward non-GDPR complaints without trying to resolve first', 'Skip standard procedure'],
    conditions: [
      {
        if: [{ field: 'request_type', operator: 'equals', value: 'gdpr' }],
        then: 'Forward directly to complaints@stake.com',
        certainty: 'hard'
      },
      {
        if: [{ field: 'complaint_type', operator: 'in', value: ['country_restriction', 'minor', 'self_exclusion'] }],
        then: 'Follow standard procedure first, only forward to complaints@ if cannot resolve',
        certainty: 'hard'
      }
    ],
    exceptions: [
      { description: 'User explicitly requests complaints email', when: 'Can forward to complaints@stake.com' }
    ],
    examples_good: [
      'User requests GDPR data → Forward to complaints@stake.com directly',
      'User complains about country restriction → Try to resolve first, then complaints@ if persistent'
    ],
    examples_bad: [
      'User complains about restriction → Agent immediately forwards to complaints@ without trying to resolve (WRONG)'
    ],
    tags: ['complaints', 'gdpr', 'standard_procedure', 'country_restriction', 'minor', 'self_exclusion', '10_business_days'],
    severity_default: 'high',
    evidence_requirements: 'Agent followed standard procedure for non-GDPR complaints before forwarding',
    verification_checks: [
      { check_id: 'verify_procedure_followed', description: 'Verify standard procedure was followed', internal_tool_action: 'Check conversation for resolution attempts', required_when: 'Non-GDPR complaint forwarded to complaints@' }
    ],
    source_location: { source_name: 'List of emails on Stake', page: 2, section: 'complaints@stake.com' }
  },

  // ===========================================
  // COMPLIANCE EMAIL - INTERNAL ONLY
  // ===========================================
  {
    subcategory: 'Complaints & Compliance Emails',
    title: 'Compliance Email - NEVER Share with Customers',
    intent: 'Ensure agents never share compliance@stake.com with customers.',
    rule_text: 'compliance@stake.com is ONLY for communications from authorities (regulators, police). This email SHALL NOT BE PROVIDED TO CUSTOMERS under any circumstances.',
    steps: [
      { step_number: 1, action: 'If communication from regulators/police/authorities', note: '' },
      { step_number: 2, action: 'Forward to compliance@stake.com internally', note: '' },
      { step_number: 3, action: 'Tag "Compliance Stake" in Intercom note', note: '' },
      { step_number: 4, action: 'NEVER share this email with customers', note: '' }
    ],
    allowed_actions: ['Use internally for authority communications', 'Tag Compliance Stake in notes'],
    disallowed_actions: ['Share compliance@ with customers', 'Give compliance@ to any user'],
    conditions: [
      {
        if: [{ field: 'communication_from', operator: 'in', value: ['regulator', 'police', 'authority'] }],
        then: 'Forward to compliance@stake.com internally, tag Compliance Stake',
        certainty: 'hard'
      }
    ],
    exceptions: [],
    examples_good: [
      'Email from regulator → Forward to compliance@stake.com, tag Compliance Stake in note'
    ],
    examples_bad: [
      'User asks for compliance email → Agent provides compliance@stake.com (WRONG - NEVER share)',
      'User wants to contact compliance → Agent gives email (WRONG)'
    ],
    tags: ['compliance', 'internal_only', 'authorities', 'regulator', 'police', 'never_share'],
    severity_default: 'critical',
    evidence_requirements: 'Agent NEVER shared compliance@ email with customer',
    verification_checks: [
      { check_id: 'verify_not_shared', description: 'Verify compliance@ was not shared with customer', internal_tool_action: 'Check agent messages for compliance@ mention', required_when: 'Any conversation' }
    ],
    source_location: { source_name: 'List of emails on Stake', page: 4, section: 'compliance@stake.com' }
  },

  // ===========================================
  // FUNDS RECOVERY EMAIL RULES
  // ===========================================
  {
    subcategory: 'Finance & Payments Emails',
    title: 'Funds Recovery Email - Required Information and Macro',
    intent: 'Ensure agents use correct macro and collect required information for fundsrecovery@stake.com.',
    rule_text: 'When directing users to fundsrecovery@stake.com for crypto deposit issues, use the "G) Funds Recovery" macro and ensure user provides: 1) Transaction hash, 2) Screenshot from personal wallet (NOT Explorer), 3) Stake username. Screenshot must show date/time, amount, and recipient address. Response time is 72 hours.',
    steps: [
      { step_number: 1, action: 'Identify crypto deposit issue (wrong tag/memo)', note: '' },
      { step_number: 2, action: 'Use "G) Funds Recovery" macro', note: 'Translate for each market' },
      { step_number: 3, action: 'Ensure user knows required info: TX hash, wallet screenshot, username', note: '' },
      { step_number: 4, action: 'Inform 72 hour response time', note: '' },
      { step_number: 5, action: 'If no reply after 72h: Escalate to payment-support channel', note: 'Include user email' }
    ],
    allowed_actions: ['Use Funds Recovery macro', 'Inform of required documents', 'Inform 72h response time'],
    disallowed_actions: ['Forget to mention required info', 'Accept Explorer screenshots', 'Send fiat issues to fundsrecovery@'],
    conditions: [
      {
        if: [{ field: 'issue_type', operator: 'equals', value: 'crypto_deposit_wrong_tag' }],
        then: 'Use Funds Recovery macro, inform 72h response, require TX hash + wallet screenshot + username',
        certainty: 'hard'
      }
    ],
    exceptions: [],
    examples_good: [
      'User sent crypto without memo → Agent uses macro, explains TX hash + wallet screenshot (not Explorer) + username needed, 72h wait'
    ],
    examples_bad: [
      'Agent sends to fundsrecovery@ without explaining required documents (WRONG)',
      'Agent accepts Explorer screenshot (WRONG - must be from personal wallet)'
    ],
    tags: ['fundsrecovery', 'crypto', 'deposit', 'tag', 'memo', 'macro', '72_hours', 'transaction_hash'],
    severity_default: 'high',
    evidence_requirements: 'Agent used correct macro, informed of required documents and 72h response time',
    verification_checks: [
      { check_id: 'verify_macro_used', description: 'Verify Funds Recovery macro was used', internal_tool_action: 'Check for macro text in response', required_when: 'User directed to fundsrecovery@' }
    ],
    source_location: { source_name: 'List of emails on Stake', page: 5, section: 'fundsrecovery@stake.com' }
  },

  // ===========================================
  // GAMEPLAY EMAIL - CONDITIONAL USE
  // ===========================================
  {
    subcategory: 'Technical & Support Emails',
    title: 'Gameplay Email - Only When Role Notes Instruct',
    intent: 'Ensure agents only use gameplay@stake.com when specifically instructed by role notes.',
    rule_text: 'gameplay@stake.com is for suspected fraudulent activity users. ONLY use this email when the account role notes SPECIFICALLY instruct us to do so. Do not proactively share this email.',
    steps: [
      { step_number: 1, action: 'Check if user has specific role notes', note: '' },
      { step_number: 2, action: 'Only share gameplay@ if role notes explicitly say to', note: '' },
      { step_number: 3, action: 'Instruct user to wait for team response', note: 'No defined response time' }
    ],
    allowed_actions: ['Share gameplay@ only when role notes instruct'],
    disallowed_actions: ['Proactively share gameplay@', 'Use gameplay@ without role note instruction'],
    conditions: [
      {
        if: [{ field: 'role_notes_instruct_gameplay', operator: 'equals', value: true }],
        then: 'Share gameplay@stake.com as instructed',
        certainty: 'hard'
      },
      {
        if: [{ field: 'role_notes_instruct_gameplay', operator: 'equals', value: false }],
        then: 'Do NOT share gameplay@stake.com',
        certainty: 'hard'
      }
    ],
    exceptions: [],
    examples_good: [
      'Role notes say "Direct user to gameplay@stake.com" → Agent shares email'
    ],
    examples_bad: [
      'User seems suspicious → Agent proactively sends to gameplay@ (WRONG - only when notes instruct)',
      'No role note instruction → Agent shares gameplay@ anyway (WRONG)'
    ],
    tags: ['gameplay', 'fraudulent', 'role_notes', 'conditional'],
    severity_default: 'critical',
    evidence_requirements: 'Agent only used gameplay@ when role notes specifically instructed',
    verification_checks: [
      { check_id: 'verify_role_notes', description: 'Verify role notes instructed gameplay@ use', internal_tool_action: 'Check account role notes', required_when: 'gameplay@ shared with user' }
    ],
    source_location: { source_name: 'List of emails on Stake', page: 6, section: 'gameplay@stake.com' }
  },

  // ===========================================
  // COMMUNITY EMAIL RULES
  // ===========================================
  {
    subcategory: 'Community & Forum Emails',
    title: 'Community Emails - Correct Routing',
    intent: 'Ensure agents use correct community email and know what NOT to use them for.',
    rule_text: 'community@stake.com is for Forum questions (registration, confirmation, access). communitycomplaints@stake.com is for moderator complaints. Do NOT use these for mute appeals (Forum Appeal Page), chat issues (escalate to Supervisors), or forum promotions (CS handles).',
    steps: [
      { step_number: 1, action: 'Identify community/forum issue type', note: '' },
      { step_number: 2, action: 'Forum registration/access issues → community@stake.com', note: '' },
      { step_number: 3, action: 'Moderator complaints → communitycomplaints@stake.com', note: '' },
      { step_number: 4, action: 'Mute appeals → Forum Appeal Page', note: 'NOT email' },
      { step_number: 5, action: 'Chat issues → Supervisors/Seniors', note: 'NOT email' },
      { step_number: 6, action: 'Unsure → cm-support channel', note: '' }
    ],
    allowed_actions: ['Use community@ for forum access', 'Use communitycomplaints@ for mod complaints', 'Direct mute appeals to Forum Appeal Page'],
    disallowed_actions: ['Use community emails for mute appeals', 'Use community emails for chat issues', 'Use community emails for forum promotions'],
    conditions: [
      {
        if: [{ field: 'issue_type', operator: 'equals', value: 'forum_access' }],
        then: 'Direct to community@stake.com',
        certainty: 'hard'
      },
      {
        if: [{ field: 'issue_type', operator: 'equals', value: 'moderator_complaint' }],
        then: 'Direct to communitycomplaints@stake.com',
        certainty: 'hard'
      },
      {
        if: [{ field: 'issue_type', operator: 'equals', value: 'mute_appeal' }],
        then: 'Direct to Forum Appeal Page, NOT email',
        certainty: 'hard'
      }
    ],
    exceptions: [],
    examples_good: [
      'User can\'t register for Forum → community@stake.com',
      'User complains about moderator → communitycomplaints@stake.com',
      'User wants mute appeal → Forum Appeal Page'
    ],
    examples_bad: [
      'User wants mute appeal → Agent sends to community@ (WRONG - use Forum Appeal Page)',
      'Chat issue → Agent sends to communitycomplaints@ (WRONG - escalate to Supervisor)'
    ],
    tags: ['community', 'forum', 'moderator', 'mute_appeal', 'chat'],
    severity_default: 'medium',
    evidence_requirements: 'Agent used correct email/page for the community issue type',
    verification_checks: [],
    source_location: { source_name: 'List of emails on Stake', page: 3, section: 'Forum / Community-related Emails' }
  },

  // ===========================================
  // TRANSACTIONAL EMAIL ISSUES
  // ===========================================
  {
    subcategory: 'System & Automated Emails',
    title: 'User Not Receiving System Emails - Jira First',
    intent: 'Ensure agents handle email delivery issues correctly with Jira tickets.',
    rule_text: 'When users are not receiving transactional emails (login codes, 2FA, etc.), first ensure they check spam folder, then open Jira ticket for technical support. Do NOT send directly to recovery@ for login code issues.',
    steps: [
      { step_number: 1, action: 'Ask user to check spam folder and subfolders', note: '' },
      { step_number: 2, action: 'If still not receiving: Open Jira ticket for technical support', note: 'Via Intercom' },
      { step_number: 3, action: 'Do NOT send to recovery@ for login code issues', note: 'Tech can resolve' },
      { step_number: 4, action: 'If user demands quick resolution: Can send to recovery@ with warning', note: 'Takes longer than Tech' }
    ],
    allowed_actions: ['Check spam folder', 'Open Jira ticket', 'Send to recovery@ only if user insists (with warning)'],
    disallowed_actions: ['Skip spam folder check', 'Send directly to recovery@ without Jira'],
    conditions: [
      {
        if: [{ field: 'issue_type', operator: 'in', value: ['login_codes_missing', 'withdrawal_email_missing', 'statistics_email_missing'] }],
        then: 'Check spam first, then open Jira ticket for Tech Support',
        certainty: 'hard'
      }
    ],
    exceptions: [
      { description: 'User insists on quick resolution', when: 'Can send to recovery@ but warn it takes longer than Tech Support' }
    ],
    examples_good: [
      'Login codes not arriving → Check spam → Open Jira ticket',
      'User insists on recovery@ → Agent warns it takes longer, then sends to recovery@'
    ],
    examples_bad: [
      'Login codes missing → Agent sends directly to recovery@ (WRONG - Jira first)'
    ],
    tags: ['transactional_email', 'login_codes', 'jira', 'spam', 'tech_support'],
    severity_default: 'medium',
    evidence_requirements: 'Agent checked spam folder and opened Jira before recovery@',
    verification_checks: [],
    source_location: { source_name: 'List of emails on Stake', page: 9, section: '2FA issues, email change requests and Telegram verification cases' }
  },

  // ===========================================
  // ACCOUNT CLOSURE EMAIL
  // ===========================================
  {
    subcategory: 'Account & Recovery Emails',
    title: 'Account Closure - Direct to accountclosure@stake.com',
    intent: 'Ensure agents direct all account closure requests to the correct email.',
    rule_text: 'All requests related to account closure, closing, or reopening accounts must be directed to accountclosure@stake.com. Users must contact this email directly.',
    steps: [
      { step_number: 1, action: 'Identify account closure/reopening request', note: '' },
      { step_number: 2, action: 'Direct user to accountclosure@stake.com', note: '' },
      { step_number: 3, action: 'User must contact directly', note: '' }
    ],
    allowed_actions: ['Direct to accountclosure@stake.com'],
    disallowed_actions: ['Handle closure requests on live chat', 'Send closure requests to other emails'],
    conditions: [
      {
        if: [{ field: 'request_type', operator: 'in', value: ['account_closure', 'account_reopen'] }],
        then: 'Direct to accountclosure@stake.com',
        certainty: 'hard'
      }
    ],
    exceptions: [],
    examples_good: [
      'User wants to close account → accountclosure@stake.com',
      'User wants to reopen closed account → accountclosure@stake.com'
    ],
    examples_bad: [
      'User wants account closure → Agent tries to handle on chat (WRONG - direct to email)'
    ],
    tags: ['accountclosure', 'closure', 'reopen'],
    severity_default: 'high',
    evidence_requirements: 'Agent directed closure/reopen requests to accountclosure@stake.com',
    verification_checks: [],
    source_location: { source_name: 'List of emails on Stake', page: 1, section: 'accountclosure@stake.com' }
  }
];

// ===========================================
// SEED FUNCTION
// ===========================================

async function seedEmailDirectory() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/clara';
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    // ========== STEP 1: Create/Update QACategory ==========
    console.log('\n📚 Creating/Updating QACategory...');

    let category;
    const existing = await QACategory.findOne({
      name: { $regex: new RegExp(`^${EMAIL_DIRECTORY_CATEGORY.name}$`, 'i') }
    });

    if (existing) {
      console.log('   Email Directory category exists. Updating...');
      existing.description = EMAIL_DIRECTORY_CATEGORY.description;
      existing.knowledge = EMAIL_DIRECTORY_CATEGORY.knowledge;
      existing.keywords = EMAIL_DIRECTORY_CATEGORY.keywords;
      existing.evaluationCriteria = EMAIL_DIRECTORY_CATEGORY.evaluationCriteria;
      existing.subcategories = EMAIL_DIRECTORY_CATEGORY.subcategories;
      existing.isActive = true;
      await existing.save();
      category = existing;
      console.log('   ✅ Category UPDATED');
    } else {
      category = await QACategory.create({
        ...EMAIL_DIRECTORY_CATEGORY,
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
      const rule_id = Rule.generateRuleId(EMAIL_DIRECTORY_CATEGORY.name, ruleData.title);

      const rule = await Rule.create({
        rule_id,
        category: category._id,
        category_name: EMAIL_DIRECTORY_CATEGORY.name,
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

    console.log('\n📧 Email Reference:');
    console.log(`   Total emails documented: ${Object.keys(EMAILS).length}`);

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
  seedEmailDirectory();
}

module.exports = {
  seedEmailDirectory,
  EMAIL_DIRECTORY_CATEGORY,
  RULES,
  EMAILS
};
