/**
 * Seed Script: Account Management Knowledge Base
 *
 * This script adds Account Management knowledge including Phone Number Removal procedure.
 * Can be extended with other account-related procedures (email changes, 2FA, etc.)
 *
 * Run with: node seeds/seedAccountManagement.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const QACategory = require('../models/QACategory');
const Rule = require('../models/Rule');

// ===========================================
// QA CATEGORY DATA
// ===========================================

const ACCOUNT_MANAGEMENT_CATEGORY = {
  name: 'Account Management',
  description: 'Procedures for managing user accounts including phone number removal, suspended user withdrawals, hacked account reports, security settings, and account modifications.',
  knowledge: `## Account Management Overview

This category covers procedures for managing and modifying user account settings and information.

### Key Areas:
1. **Phone Number Management**: Adding, removing, and transferring phone numbers between accounts
2. **Suspended User Withdrawals**: Helping suspended users withdraw their funds (with exceptions)
3. **Hacked Account Reports**: Handling users who report being hacked and potential hacker accounts
4. **Account Verification**: KYC verification and identity confirmation
5. **Account Restrictions**: Handling restricted accounts (SE, Fiat-Suspended, etc.)

### Important Principles:
- Always verify KYC before making account changes
- Check for restrictions before removing phone numbers
- Suspended users CAN withdraw, EXCEPT Self-excluded users and minors
- Escalate to appropriate teams when needed (Payments, Compliance, Recovery)
- Balance adjustments for minimum withdrawal are ONE TIME only
- We CANNOT compensate for hacking losses - forward to recovery@stake.com`,

  keywords: [
    'account management', 'phone number', 'phone removal', 'KYC', 'verification',
    'fiat', 'fiat-supported', 'restriction', 'self-exclusion', 'fiat-suspended',
    'ACP', 'backoffice', 'payments team', 'duplicate account', 'linked account',
    'suspended', 'withdrawal', 'minimum withdrawal', 'adjustment', 'minor', 'underage',
    'bonus', 'rakeback', 'affiliate', 'money laundering',
    'hacked', 'hacker', 'phishing', 'compromised', 'recovery', 'fraud', 'tip', 'stolen'
  ],

  evaluationCriteria: `When evaluating Account Management tickets, verify:
1. Agent correctly identified the account linked to the phone number via ACP search
2. Agent tagged Specialist/Supervisor to check KYC on both accounts
3. For KYC match: Agent checked for restrictions before removing phone number
4. For KYC match with restriction: Agent did NOT remove phone and applied same restriction to duplicates
5. For KYC mismatch: Agent checked if fiat-supported country and transaction history
6. Agent escalated to Payments Team via Backoffice when fiat transactions existed
7. Agent used correct ACP path: Actions > Remove the phone number
8. For suspended withdrawals: Agent correctly applied 50% minimum rule for adjustments
9. Agent did NOT make adjustment for underage users
10. Agent checked if adjustment was already done before (ONE TIME only)
11. For hacked reports: Agent tagged SS/SL to set suspended+frozen roles on recipient account
12. For potential hacker: Agent guided to KYC level 4 and forwarded to fraud-abuse-kyc channel
13. For compromised account: Agent checked both conditions (linked email + funds/bonuses) before applying C role
14. Agent forwarded hacking victims to recovery@stake.com
15. Agent did NOT promise compensation for hacking losses`,

  subcategories: [
    // ===========================================
    // SUBCATEGORY 1: Phone Number Removal
    // ===========================================
    {
      name: 'Phone Number Removal',
      description: 'Procedure for handling user requests to remove phone numbers that are linked to other accounts.',
      knowledge: `## Phone Number Removal Procedure

### Why Phone Numbers Matter:
- Required for **fiat transactions**
- Required for **marketing purposes**
- Users may be unable to register if number is linked to another account

---

## How to Remove Phone Number in ACP:

**Path**: ACP > Actions > Remove the phone number

---

## How to Identify the Account Linked to Phone Number:

### Step 1: Search in ACP
1. Go to ACP > Search > Phone
2. Enter the phone number
3. **TIP**: If no result with full number, **remove the first digit** and search again

### Step 2: Tag for KYC Check
Once linked account is found, **tag a Specialist or Supervisor** to check KYC on both accounts to determine the owner.

---

## Phone Number Removal Decision Tree:

### Scenario A: KYC MATCHES (Same Owner)

Check for restrictions on the account:

| Restriction Status | Action |
|-------------------|--------|
| **No restriction** | Remove the phone number from the account |
| **Restriction exists** (SE, Fiat-Suspended, etc.) | **DO NOT remove** the phone number. Apply the **same restriction** on any duplicate accounts |

### Scenario B: KYC DOES NOT MATCH (Different Owners)

#### Step 1: Check Fiat-Supported Country
| Country Status | Action |
|---------------|--------|
| **NOT fiat-supported** | Remove the phone number |
| **Fiat-supported** | Proceed to Step 2 |

#### Step 2: Review Transaction History (for fiat-supported countries)
| Transaction History | Action |
|--------------------|--------|
| **No fiat transactions** OR **account inactive** | Remove the phone number |
| **Fiat transactions exist** | Open a **Backoffice ticket** to escalate to Payments Team |

---

## Quick Reference Flowchart:

\`\`\`
Phone Removal Request
        ↓
Search ACP > Phone (remove first digit if needed)
        ↓
Tag SS/SL to check KYC on both accounts
        ↓
    KYC Match?
    /        \\
  YES         NO
   ↓           ↓
Restriction?  Fiat-supported country?
 /    \\        /          \\
NO    YES    NO           YES
 ↓      ↓      ↓            ↓
Remove  DON'T  Remove    Fiat transactions?
        remove              /        \\
        + apply           NO         YES
        restriction       ↓           ↓
        to dupes        Remove    Backoffice
                                  → Payments Team
\`\`\``,
      keywords: ['phone removal', 'phone number', 'linked account', 'ACP', 'KYC match', 'fiat-supported', 'restriction', 'backoffice', 'payments team'],
      examples: [
        'User can\'t register phone - already linked → Search ACP, tag SS/SL for KYC check',
        'KYC matches, no restriction → Remove phone number',
        'KYC matches, has SE → DO NOT remove, apply SE to duplicates',
        'KYC doesn\'t match, fiat country, has transactions → Backoffice to Payments Team',
        'KYC doesn\'t match, non-fiat country → Remove phone number'
      ],
      evaluationCriteria: 'Agent followed correct decision tree based on KYC match/mismatch and restriction/fiat status. Agent tagged SS/SL for KYC check. Agent did not remove phone from restricted accounts. Agent escalated to Payments when fiat transactions existed.'
    },

    // ===========================================
    // SUBCATEGORY 2: Suspended Users Withdrawal
    // ===========================================
    {
      name: 'Suspended Users Withdrawal',
      description: 'Procedure for handling withdrawal requests from suspended users, including bonuses and minimum balance adjustments.',
      knowledge: `## Suspended Users Withdrawal Procedure

### Overview:
Suspended users CAN:
- Claim unclaimed bonuses on their accounts
- Withdraw crypto/fiat funds

Suspended users CANNOT:
- Bet or deposit extra funds
- Access platform normally

### EXCEPTIONS - Cannot Withdraw:
- **Self-excluded users** (voluntary)
- **Minors** (underage users)

**Note**: The suspended Sportsbook role is EXCLUDED from this procedure.

---

## 1. Minors (Underage Users)

### Suspension:
- If user admits to being a minor → Account should be suspended
- KYC team applies **Suspended** or **FiatWithdrawalOnly** role

### Fiat Withdrawal for Minors:
**Checkpoints before escalation:**
1. Account has **Suspended** or **FiatWithdrawalOnly** role
   - If not → Tag SS/SL to set the necessary role
2. KYC is confirmed to the necessary level to withdraw
   - If not → Advise to upload documents for Level 2, then escalate in mebit-kyc channel

**If still having issues after checkpoints**: Escalate to payment support via back-office ticket

**IMPORTANT**: Minors must wait until they are 18 (of legal age) before any balance adjustment can be made.

---

## 2. Bonuses Accessible to Suspended Users

### Eligibility:
- ✅ **Mitigated users** - ARE eligible
- ❌ **Voluntary Self-excluded users** - NOT eligible
- ❌ **Minors** - Excluded from bonus procedure

### Important Rules:
- Only **outstanding bonuses** are eligible
- NOT for future bonuses during inactive periods

### Bonus Types:

| Bonus Type | Action |
|------------|--------|
| **Level-up bonus** | Manually credit if user hasn't received it |
| **Monthly bonuses** | Share outstanding bonus link up to suspension month (within 30 days only) |
| **Weekly bonuses** | Direct to VIP Telegram channel (suspension week only). DO NOT share internal bonus link |
| **Active reload** | Share reload bonus page link if user has active reload |
| **Promotion bonus** | Send link to any unclaimed available bonuses |
| **Rakeback** | If not enabled for users above Bronze level, enable it and allow claim |
| **Affiliate Commission** | Can be redeemed and withdrawn |

---

## 3. Below Minimum Withdrawal - NEW SIMPLIFIED PROCEDURE

### Decision Tree:

| Balance vs Min Withdrawal | Action |
|--------------------------|--------|
| **Less than 50%** of minimum | Cannot do anything - inform user balance is below minimum |
| **50% or more** of minimum | Adjust to minimum - ONE TIME EXCEPTION only |

### Key Rules:
- Applies to **BOTH crypto and fiat**
- Applies to **ALL suspension reasons EXCEPT underage**
- **ONE TIME ONLY** - check Intercom notes if adjustment was already done
- Tag Senior to add remaining amount to minimum
- Leave note on Intercom: when and how much was added

### For Underage Users:
**NO adjustment can be made** - they must wait until they are of legal age (18+)

### Crypto vs Fiat:
- **Fiat**: Must meet minimum withdrawal amount
- **Crypto**: Can withdraw any amount IF fees can be covered
- For suspended roles, minimum withdrawal limit does NOT apply for crypto

---

## 4. Money Laundering Flag on ACP

### Issue:
Outstanding flag in Money Laundering section of ACP may prevent withdrawals.

### Action:
Tag a **supervisor to cancel** the amount.

---

## Quick Reference:

| Scenario | Action |
|----------|--------|
| Suspended user wants to withdraw | Check if SE or minor → If not, assist with withdrawal |
| Balance < 50% of minimum | Inform cannot withdraw, below minimum |
| Balance >= 50% of minimum (first time) | Tag Senior to adjust to minimum, leave Intercom note |
| Balance >= 50% of minimum (already adjusted before) | Inform ONE TIME exception already used |
| Minor wants adjustment | Cannot adjust - must wait until 18 |
| Money laundering flag blocking | Tag supervisor to cancel |`,
      keywords: ['suspended', 'withdrawal', 'minimum withdrawal', 'adjustment', 'bonus', 'minor', 'underage', 'self-exclusion', 'rakeback', 'affiliate', 'money laundering', '50%', 'one time'],
      examples: [
        'Suspended user with $30 balance (min $50) → 60% of min → Tag Senior to adjust to $50, note in Intercom',
        'Suspended user with $20 balance (min $50) → 40% of min → Cannot adjust, below 50%',
        'Minor wants withdrawal adjustment → Cannot do, must wait until 18',
        'User already had adjustment before → ONE TIME only, cannot do again',
        'Suspended user has unclaimed monthly bonus → Share outstanding bonus link (within 30 days)'
      ],
      evaluationCriteria: 'Agent correctly identified user status (suspended, SE, minor). For balance below 50% minimum, agent informed user correctly. For balance 50%+ minimum, agent checked if adjustment was already done and either processed ONE TIME adjustment or declined. Agent did NOT adjust for minors. Agent left Intercom note when adjustment was made.'
    },

    // ===========================================
    // SUBCATEGORY 3: Hacked Accounts / Report Being Hacked
    // ===========================================
    {
      name: 'Hacked Accounts',
      description: 'Procedure for handling users who report being hacked and managing accounts flagged as potential hackers.',
      knowledge: `## Report Being Hacked Procedure

### Overview - How Hacking Happens:
The most common hacking technique on Stake.com is **phishing over email**:
- Generic emails promising lucrative deals, big prizes, huge bonuses
- Email contains link to **phishing website** that looks exactly like Stake.com
- Users enter login credentials on fake site
- **Users must always double-check the website URL**

### What Hackers Can Do:
- ❌ **Cannot withdraw** without access to user's email or 2FA app
- ✅ **CAN send tips** if account only protected with compromised password

---

## 1. When Users Report Being Hacked (Victim Side)

### Scenario: User reports missing money due to tip or withdrawal to another Stake account

**Action:**
1. Tag a **Specialist/Supervisor** to set roles on the RECIPIENT account:
   - Set \`suspended\` role
   - Set \`frozen\` role
   - Add tag: **'Potentially a hacker'**

---

## 1-1. When Potential Hacker Contacts Us (Recipient with tag)

**Action:**
- Guide them to complete **KYC level 4**
- Forward to **fraud-abuse-kyc** channel **IMMEDIATELY** (don't wait 48 hours)

**Macro to use:**
> Your account is currently restricted due to possible fraudulent activity, and withdrawal cannot be processed until KYC level 4 is completed on your account.
> Once you've completed uploading the documents, reach out to us, and we will do our best to speed it up.

### After Completing KYC Level 4:

**Action:**
- Send them to **recovery@stake.com** to prove ownership
- They can potentially have roles and tags removed

**Macro to use:**
> Thanks for your co-operation so far. We also need you to ask for one more step to remove the restriction on your account.
> Please contact recovery@stake.com using your registered address to prove your ownership of this account.
> After completing the next step, you will fully regain your account.

---

## 2. Hacked Accounts Side (Victim Reporting)

### When to Apply C (Compromised) Role:

A Specialist/Supervisor will apply the **C (Compromised)** role when BOTH conditions are met:
1. User contacts us from their **linked email address**
2. User has:
   - **Funds on balance** (at least minimum withdrawal amount: Crypto / Fiat), OR
   - **Unclaimed bonuses**

**After applying C role:** Forward to recovery team at **recovery@stake.com**

### For All Other Cases:
- Do NOT set any roles
- Do NOT investigate further
- Send user **directly** to recovery team at **recovery@stake.com**

---

## 2-1. When User Asks for Compensation

**Action:**
We **CANNOT compensate** for their loss of funds due to being hacked.

---

## 2-2. Multiple Players Claiming Ownership of One Account

**Action:**
Forward them to **recovery@stake.com**

---

## Quick Reference Table:

| Scenario | Action |
|----------|--------|
| User reports being hacked | Tag SS/SL to set suspended+frozen on recipient, add 'Potentially a hacker' tag |
| Potential hacker contacts us | Guide to KYC level 4, forward to fraud-abuse-kyc IMMEDIATELY |
| After potential hacker completes KYC 4 | Send to recovery@stake.com to prove ownership |
| Victim with linked email + funds/bonuses | Apply C role, forward to recovery@stake.com |
| Victim without funds (or not linked email) | Send directly to recovery@stake.com (no roles) |
| User asks for compensation | Cannot compensate for hacking losses |
| Multiple people claim same account | Forward to recovery@stake.com |`,
      keywords: ['hacked', 'hacker', 'phishing', 'compromised', 'recovery', 'fraud', 'tip', 'stolen', 'suspended', 'frozen', 'KYC level 4', 'fraud-abuse-kyc', 'ownership'],
      examples: [
        'User reports funds stolen via tip → Tag SS/SL to set suspended+frozen on recipient',
        'Potential hacker contacts us → Guide to KYC level 4, forward to fraud-abuse-kyc immediately',
        'Victim with funds and linked email → Apply C role, forward to recovery@stake.com',
        'Victim without funds → Send directly to recovery@stake.com (no roles)',
        'User asks for compensation → Explain we cannot compensate for hacking'
      ],
      evaluationCriteria: 'Agent tagged SS/SL to restrict recipient account when user reported being hacked. Agent guided potential hackers to KYC level 4 and fraud-abuse-kyc channel (no 48h wait). Agent checked both conditions (linked email + funds/bonuses) before applying C role. Agent did NOT promise compensation. Agent forwarded to recovery@stake.com appropriately.'
    }
  ]
};

// ===========================================
// RULES DATA
// ===========================================

const RULES = [
  // ===========================================
  // RULE 1: Phone Search in ACP
  // ===========================================
  {
    subcategory: 'Phone Number Removal',
    title: 'Phone Number Search in ACP',
    intent: 'Ensure agents correctly search for phone numbers in ACP to find linked accounts.',
    rule_text: 'To find the account linked to a phone number, search in ACP > Search > Phone. If no result appears with the full number, remove the first digit and search again.',
    steps: [
      { step_number: 1, action: 'Go to ACP > Search > Phone', note: '' },
      { step_number: 2, action: 'Enter the phone number', note: '' },
      { step_number: 3, action: 'If no result: Remove the first digit and search again', note: 'Common issue with country codes' }
    ],
    allowed_actions: ['Search with full number', 'Search without first digit', 'Tag SS/SL for KYC check'],
    disallowed_actions: ['Skip phone search', 'Remove phone without finding linked account'],
    conditions: [
      {
        if: [{ field: 'search_result', operator: 'equals', value: 'no_result' }],
        then: 'Remove the first digit from phone number and search again',
        certainty: 'hard'
      }
    ],
    exceptions: [],
    examples_good: [
      'Agent searches +1234567890, no result → searches 234567890, finds account',
      'Agent finds linked account and tags Specialist to check KYC'
    ],
    examples_bad: [
      'Agent cannot find account and gives up without trying without first digit',
      'Agent removes phone without searching for linked account first'
    ],
    tags: ['phone_search', 'acp', 'linked_account', 'first_digit'],
    severity_default: 'medium',
    evidence_requirements: 'Evidence that agent searched in ACP for the phone number',
    verification_checks: [
      { check_id: 'verify_acp_search', description: 'Verify agent searched in ACP', internal_tool_action: 'Check agent actions for ACP search', required_when: 'Phone removal requested' }
    ],
    source_location: { source_name: 'Phone Number Removal', page: 1, section: 'How to Identify the Account Linked to the Phone Number' }
  },

  // ===========================================
  // RULE 2: Tag SS/SL for KYC Check
  // ===========================================
  {
    subcategory: 'Phone Number Removal',
    title: 'Tag Specialist/Supervisor for KYC Check',
    intent: 'Ensure KYC is verified on both accounts before phone number removal decision.',
    rule_text: 'Once the linked account is found, agent MUST tag a Specialist or Supervisor to check KYC on both accounts to determine the owner.',
    steps: [
      { step_number: 1, action: 'Find the linked account via ACP search', note: '' },
      { step_number: 2, action: 'Tag a Specialist or Supervisor', note: '' },
      { step_number: 3, action: 'Wait for KYC check on BOTH accounts', note: 'Requesting account AND linked account' }
    ],
    allowed_actions: ['Tag SS/SL for KYC check', 'Wait for KYC verification result'],
    disallowed_actions: ['Remove phone without KYC check', 'Check KYC yourself without proper access', 'Proceed without tagging'],
    conditions: [
      {
        if: [{ field: 'linked_account_found', operator: 'equals', value: true }],
        then: 'Tag Specialist or Supervisor to check KYC on both accounts',
        certainty: 'hard'
      }
    ],
    exceptions: [],
    examples_good: [
      'Agent finds linked account → tags @Specialist to verify KYC on both accounts'
    ],
    examples_bad: [
      'Agent removes phone number without tagging anyone for KYC check',
      'Agent only checks KYC on one account, not both'
    ],
    tags: ['kyc_check', 'tag_specialist', 'tag_supervisor', 'verification'],
    severity_default: 'high',
    evidence_requirements: 'Evidence that agent tagged SS/SL for KYC verification before proceeding',
    verification_checks: [
      { check_id: 'verify_ss_sl_tagged', description: 'Verify Specialist/Supervisor was tagged', internal_tool_action: 'Check ticket for SS/SL tags', required_when: 'Linked account found' }
    ],
    source_location: { source_name: 'Phone Number Removal', page: 1, section: 'How to Identify the Account Linked to the Phone Number' }
  },

  // ===========================================
  // RULE 3: KYC Matches - Check Restrictions
  // ===========================================
  {
    subcategory: 'Phone Number Removal',
    title: 'KYC Matches - Check Restrictions Before Removal',
    intent: 'When KYC matches, agent must check for restrictions before removing phone number.',
    rule_text: 'When KYC matches (same owner), check for restrictions (Self-exclusion, Fiat-Suspended, etc). If no restriction, remove phone. If restriction exists, DO NOT remove phone and apply same restriction to duplicate accounts.',
    steps: [
      { step_number: 1, action: 'Confirm KYC matches (same owner)', note: '' },
      { step_number: 2, action: 'Check for any restrictions on the account', note: 'SE, Fiat-Suspended, etc.' },
      { step_number: 3, action: 'If no restriction: Remove phone number', note: 'ACP > Actions > Remove the phone number' },
      { step_number: 4, action: 'If restriction exists: DO NOT remove phone', note: '' },
      { step_number: 5, action: 'Apply same restriction to any duplicate accounts', note: 'Critical step when restriction exists' }
    ],
    allowed_actions: ['Remove phone when no restriction', 'Apply restriction to duplicates'],
    disallowed_actions: ['Remove phone from restricted account', 'Ignore restrictions', 'Skip applying restriction to duplicates'],
    conditions: [
      {
        if: [{ field: 'kyc_match', operator: 'equals', value: true }, { field: 'has_restriction', operator: 'equals', value: false }],
        then: 'Remove the phone number from the account',
        certainty: 'hard'
      },
      {
        if: [{ field: 'kyc_match', operator: 'equals', value: true }, { field: 'has_restriction', operator: 'equals', value: true }],
        then: 'DO NOT remove phone number. Apply same restriction to duplicate accounts.',
        certainty: 'hard'
      }
    ],
    exceptions: [],
    examples_good: [
      'KYC matches, no restriction → Agent removes phone number',
      'KYC matches, has SE → Agent does NOT remove phone, applies SE to duplicate accounts'
    ],
    examples_bad: [
      'KYC matches, has SE → Agent removes phone anyway (WRONG)',
      'KYC matches, has restriction → Agent doesn\'t apply restriction to duplicates (WRONG)'
    ],
    tags: ['kyc_match', 'restriction', 'self_exclusion', 'fiat_suspended', 'duplicate_account'],
    severity_default: 'critical',
    evidence_requirements: 'KYC match status, restriction check, and appropriate action taken',
    verification_checks: [
      { check_id: 'verify_restriction_check', description: 'Verify agent checked for restrictions', internal_tool_action: 'Check account roles and restrictions', required_when: 'KYC matches' },
      { check_id: 'verify_restriction_applied', description: 'Verify restriction was applied to duplicates', internal_tool_action: 'Check duplicate account roles', required_when: 'KYC matches and restriction exists' }
    ],
    source_location: { source_name: 'Phone Number Removal', page: 2, section: 'The KYC matches' }
  },

  // ===========================================
  // RULE 4: KYC Does Not Match - Fiat Country Check
  // ===========================================
  {
    subcategory: 'Phone Number Removal',
    title: 'KYC Does Not Match - Check Fiat-Supported Country',
    intent: 'When KYC does not match, determine action based on fiat-supported country status.',
    rule_text: 'When KYC does not match (different owners), first check if the account is from a fiat-supported country. If NOT fiat-supported, remove phone. If fiat-supported, check transaction history.',
    steps: [
      { step_number: 1, action: 'Confirm KYC does NOT match (different owners)', note: '' },
      { step_number: 2, action: 'Check if account is from fiat-supported country', note: '' },
      { step_number: 3, action: 'If NOT fiat-supported: Remove phone number', note: '' },
      { step_number: 4, action: 'If fiat-supported: Proceed to check transaction history', note: 'Next rule' }
    ],
    allowed_actions: ['Remove phone for non-fiat countries', 'Proceed to transaction check for fiat countries'],
    disallowed_actions: ['Skip fiat country check', 'Remove phone from fiat country without checking transactions'],
    conditions: [
      {
        if: [{ field: 'kyc_match', operator: 'equals', value: false }, { field: 'fiat_supported_country', operator: 'equals', value: false }],
        then: 'Remove the phone number',
        certainty: 'hard'
      },
      {
        if: [{ field: 'kyc_match', operator: 'equals', value: false }, { field: 'fiat_supported_country', operator: 'equals', value: true }],
        then: 'Check fiat transaction history before deciding',
        certainty: 'hard'
      }
    ],
    exceptions: [],
    examples_good: [
      'KYC doesn\'t match, non-fiat country → Agent removes phone',
      'KYC doesn\'t match, fiat country → Agent checks transaction history'
    ],
    examples_bad: [
      'KYC doesn\'t match → Agent removes phone without checking fiat country (WRONG)',
      'KYC doesn\'t match, fiat country → Agent removes without checking transactions (WRONG)'
    ],
    tags: ['kyc_mismatch', 'fiat_supported', 'country_check'],
    severity_default: 'high',
    evidence_requirements: 'KYC mismatch confirmation and fiat country check',
    verification_checks: [
      { check_id: 'verify_fiat_country', description: 'Verify agent checked fiat-supported country status', internal_tool_action: 'Check account country and fiat support', required_when: 'KYC does not match' }
    ],
    source_location: { source_name: 'Phone Number Removal', page: 2, section: 'The KYC does not match' }
  },

  // ===========================================
  // RULE 5: KYC Does Not Match - Transaction History Check
  // ===========================================
  {
    subcategory: 'Phone Number Removal',
    title: 'KYC Does Not Match - Fiat Transaction History Check',
    intent: 'For fiat-supported countries with KYC mismatch, check transaction history before phone removal.',
    rule_text: 'For fiat-supported countries with KYC mismatch: If no fiat transactions or account is inactive, remove phone. If fiat transactions exist, open Backoffice ticket to escalate to Payments Team.',
    steps: [
      { step_number: 1, action: 'Confirm fiat-supported country with KYC mismatch', note: '' },
      { step_number: 2, action: 'Review fiat transaction history', note: '' },
      { step_number: 3, action: 'If no transactions OR inactive: Remove phone number', note: '' },
      { step_number: 4, action: 'If fiat transactions exist: Open Backoffice ticket', note: 'Escalate to Payments Team' }
    ],
    allowed_actions: ['Remove phone when no transactions', 'Open Backoffice ticket when transactions exist'],
    disallowed_actions: ['Remove phone when fiat transactions exist', 'Skip transaction check for fiat countries', 'Handle fiat cases without escalation'],
    conditions: [
      {
        if: [{ field: 'kyc_match', operator: 'equals', value: false }, { field: 'fiat_supported_country', operator: 'equals', value: true }, { field: 'fiat_transactions', operator: 'equals', value: false }],
        then: 'Remove the phone number',
        certainty: 'hard'
      },
      {
        if: [{ field: 'kyc_match', operator: 'equals', value: false }, { field: 'fiat_supported_country', operator: 'equals', value: true }, { field: 'fiat_transactions', operator: 'equals', value: true }],
        then: 'Open Backoffice ticket to escalate to Payments Team',
        certainty: 'hard'
      }
    ],
    exceptions: [],
    examples_good: [
      'Fiat country, no transactions → Agent removes phone',
      'Fiat country, has fiat deposits → Agent opens Backoffice ticket for Payments Team'
    ],
    examples_bad: [
      'Fiat country, has transactions → Agent removes phone anyway (WRONG)',
      'Fiat country, has transactions → Agent handles without escalating (WRONG)'
    ],
    tags: ['fiat_transactions', 'backoffice', 'payments_team', 'escalation'],
    severity_default: 'high',
    evidence_requirements: 'Fiat transaction check and appropriate action (removal or escalation)',
    verification_checks: [
      { check_id: 'verify_transaction_check', description: 'Verify agent checked fiat transaction history', internal_tool_action: 'Check transaction history in account', required_when: 'KYC mismatch and fiat-supported country' },
      { check_id: 'verify_backoffice_ticket', description: 'Verify Backoffice ticket was opened', internal_tool_action: 'Check for Backoffice ticket creation', required_when: 'Fiat transactions exist' }
    ],
    source_location: { source_name: 'Phone Number Removal', page: 2, section: 'The KYC does not match' }
  },

  // ===========================================
  // RULE 6: Correct ACP Path for Phone Removal
  // ===========================================
  {
    subcategory: 'Phone Number Removal',
    title: 'Correct ACP Path for Phone Number Removal',
    intent: 'Ensure agents use the correct ACP path to remove phone numbers.',
    rule_text: 'To remove a phone number, use the path: ACP > Actions > Remove the phone number.',
    steps: [
      { step_number: 1, action: 'Navigate to the account in ACP', note: '' },
      { step_number: 2, action: 'Go to Actions menu', note: '' },
      { step_number: 3, action: 'Click "Remove the phone number"', note: '' }
    ],
    allowed_actions: ['Use ACP > Actions > Remove the phone number'],
    disallowed_actions: ['Use incorrect path', 'Manually edit phone field'],
    conditions: [],
    exceptions: [],
    examples_good: [
      'Agent removes phone via ACP > Actions > Remove the phone number'
    ],
    examples_bad: [
      'Agent tries to edit phone number directly instead of using removal action'
    ],
    tags: ['acp_path', 'phone_removal', 'actions_menu'],
    severity_default: 'low',
    evidence_requirements: 'Agent used correct ACP path for removal',
    verification_checks: [],
    source_location: { source_name: 'Phone Number Removal', page: 1, section: 'How to remove the registered phone number' }
  },

  // ===========================================
  // SUSPENDED USERS WITHDRAWAL RULES
  // ===========================================

  // RULE 7: Suspended Users Can Withdraw (with exceptions)
  {
    subcategory: 'Suspended Users Withdrawal',
    title: 'Suspended Users Withdrawal Eligibility',
    intent: 'Ensure agents understand which suspended users can and cannot withdraw.',
    rule_text: 'Suspended users can claim unclaimed bonuses and withdraw crypto/fiat funds. EXCEPTIONS: Self-excluded users and minors CANNOT withdraw. Suspended Sportsbook role is excluded from this procedure.',
    steps: [
      { step_number: 1, action: 'Identify user suspension type', note: 'Check if regular suspended, SE, or minor' },
      { step_number: 2, action: 'If Self-excluded: User CANNOT withdraw', note: 'Voluntary SE restriction' },
      { step_number: 3, action: 'If Minor: Special procedure applies', note: 'May need to wait until 18' },
      { step_number: 4, action: 'If regular Suspended: Assist with withdrawal', note: 'Can withdraw crypto/fiat' }
    ],
    allowed_actions: ['Assist suspended users with withdrawal', 'Explain SE restriction', 'Explain minor restrictions'],
    disallowed_actions: ['Allow SE users to withdraw', 'Process withdrawal for voluntary SE users'],
    conditions: [
      {
        if: [{ field: 'account_status', operator: 'equals', value: 'self_excluded' }],
        then: 'User CANNOT withdraw - explain SE restriction',
        certainty: 'hard'
      },
      {
        if: [{ field: 'account_status', operator: 'equals', value: 'suspended' }, { field: 'is_minor', operator: 'equals', value: false }],
        then: 'User CAN withdraw - assist with withdrawal process',
        certainty: 'hard'
      }
    ],
    exceptions: [
      { description: 'Suspended Sportsbook role', when: 'User has suspended Sportsbook role - excluded from this procedure' }
    ],
    examples_good: [
      'Suspended user wants to withdraw → Agent assists with withdrawal',
      'Self-excluded user wants to withdraw → Agent explains SE restriction prevents withdrawal'
    ],
    examples_bad: [
      'Self-excluded user → Agent processes withdrawal anyway (WRONG)',
      'Suspended user → Agent refuses to help without checking SE status (WRONG)'
    ],
    tags: ['suspended', 'withdrawal', 'self_exclusion', 'eligibility'],
    severity_default: 'high',
    evidence_requirements: 'User suspension status verification and appropriate action',
    verification_checks: [
      { check_id: 'verify_suspension_type', description: 'Verify if user is regular suspended, SE, or minor', internal_tool_action: 'Check account roles', required_when: 'Suspended user requests withdrawal' }
    ],
    source_location: { source_name: 'Suspended users cannot withdraw', page: 1, section: 'Intro' }
  },

  // RULE 8: Below 50% Minimum - Cannot Adjust
  {
    subcategory: 'Suspended Users Withdrawal',
    title: 'Below 50% Minimum Withdrawal - No Adjustment',
    intent: 'Ensure agents do not adjust balance when user has less than 50% of minimum withdrawal.',
    rule_text: 'If suspended user balance is LESS than 50% of minimum withdrawal limit, we cannot do anything. Inform user balance is below minimum and withdrawal cannot be processed.',
    steps: [
      { step_number: 1, action: 'Check user balance', note: '' },
      { step_number: 2, action: 'Check minimum withdrawal limit for currency', note: '' },
      { step_number: 3, action: 'Calculate if balance is 50% or more of minimum', note: '' },
      { step_number: 4, action: 'If less than 50%: Inform user cannot withdraw', note: 'Balance is below minimum' }
    ],
    allowed_actions: ['Inform user balance is below minimum', 'Explain minimum withdrawal requirements'],
    disallowed_actions: ['Adjust balance when below 50%', 'Promise future adjustment possibility'],
    conditions: [
      {
        if: [{ field: 'balance_percentage_of_minimum', operator: 'equals', value: 'below_50' }],
        then: 'Inform user cannot withdraw - balance is below minimum',
        certainty: 'hard'
      }
    ],
    exceptions: [],
    examples_good: [
      'User has $20, minimum is $50 (40%) → Agent informs cannot withdraw, below minimum',
      'User has $24, minimum is $50 (48%) → Agent informs cannot withdraw, below 50%'
    ],
    examples_bad: [
      'User has $20, minimum is $50 → Agent adjusts to $50 (WRONG - below 50%)',
      'User has 40% of minimum → Agent tags Senior to adjust (WRONG)'
    ],
    tags: ['minimum_withdrawal', 'below_50', 'no_adjustment', 'suspended'],
    severity_default: 'high',
    evidence_requirements: 'Balance amount, minimum withdrawal limit, calculation showing below 50%',
    verification_checks: [
      { check_id: 'verify_balance_percentage', description: 'Calculate balance as percentage of minimum', internal_tool_action: 'Check balance and minimum limit', required_when: 'Suspended user withdrawal with low balance' }
    ],
    source_location: { source_name: 'Suspended users cannot withdraw - Slack Update', section: 'New Simplified Procedure' }
  },

  // RULE 9: 50%+ Minimum - One Time Adjustment
  {
    subcategory: 'Suspended Users Withdrawal',
    title: '50%+ Minimum Withdrawal - One Time Adjustment',
    intent: 'Ensure agents correctly process one-time adjustment for users with 50%+ of minimum balance.',
    rule_text: 'If suspended user balance is 50% OR MORE of minimum withdrawal limit, we adjust to minimum ONE TIME only. Tag Senior to add remaining amount. Leave Intercom note with date and amount adjusted. Check notes first to ensure adjustment was not already done.',
    steps: [
      { step_number: 1, action: 'Calculate balance percentage of minimum', note: 'Must be 50% or more' },
      { step_number: 2, action: 'Check Intercom notes for previous adjustment', note: 'ONE TIME only' },
      { step_number: 3, action: 'If no previous adjustment: Tag Senior to adjust to minimum', note: '' },
      { step_number: 4, action: 'Leave Intercom note with date and amount added', note: 'For future reference' },
      { step_number: 5, action: 'Inform user this is ONE TIME exception', note: '' }
    ],
    allowed_actions: ['Tag Senior for adjustment', 'Leave Intercom note', 'Inform about one time exception'],
    disallowed_actions: ['Adjust without checking for previous adjustment', 'Skip Intercom note', 'Adjust more than once'],
    conditions: [
      {
        if: [{ field: 'balance_percentage_of_minimum', operator: 'equals', value: '50_or_more' }, { field: 'previous_adjustment', operator: 'equals', value: false }],
        then: 'Tag Senior to adjust to minimum, leave Intercom note, inform ONE TIME exception',
        certainty: 'hard'
      },
      {
        if: [{ field: 'balance_percentage_of_minimum', operator: 'equals', value: '50_or_more' }, { field: 'previous_adjustment', operator: 'equals', value: true }],
        then: 'Inform user ONE TIME exception was already used, cannot adjust again',
        certainty: 'hard'
      }
    ],
    exceptions: [
      { description: 'Underage users', when: 'User is minor - cannot adjust, must wait until 18' }
    ],
    examples_good: [
      'User has $30, min $50 (60%), no previous adjustment → Tag Senior to add $20, leave note',
      'User has $35, min $50, had adjustment 2 months ago → Inform ONE TIME already used'
    ],
    examples_bad: [
      'User has $30, min $50 → Agent adjusts without checking previous adjustment (WRONG)',
      'Agent adjusts but does not leave Intercom note (WRONG)',
      'User had previous adjustment → Agent adjusts again (WRONG)'
    ],
    tags: ['minimum_withdrawal', '50_percent', 'one_time_adjustment', 'intercom_note', 'tag_senior'],
    severity_default: 'critical',
    evidence_requirements: 'Balance calculation, Intercom note check, adjustment action, note left',
    verification_checks: [
      { check_id: 'verify_previous_adjustment', description: 'Check Intercom notes for previous adjustment', internal_tool_action: 'Review Intercom conversation notes', required_when: 'User qualifies for adjustment' },
      { check_id: 'verify_note_left', description: 'Verify agent left Intercom note after adjustment', internal_tool_action: 'Check Intercom notes for new entry', required_when: 'Adjustment was made' }
    ],
    source_location: { source_name: 'Suspended users cannot withdraw - Slack Update', section: 'New Simplified Procedure' }
  },

  // RULE 10: Underage Users Cannot Get Adjustment
  {
    subcategory: 'Suspended Users Withdrawal',
    title: 'Underage Users Cannot Get Balance Adjustment',
    intent: 'Ensure agents do not adjust balance for underage users.',
    rule_text: 'Underage (minor) users CANNOT receive balance adjustment to meet minimum withdrawal. They must wait until they are of legal age (18+). This applies regardless of balance percentage.',
    steps: [
      { step_number: 1, action: 'Identify if user is underage', note: 'Check KYC/suspension reason' },
      { step_number: 2, action: 'If underage: Explain cannot adjust balance', note: '' },
      { step_number: 3, action: 'Inform user must wait until 18', note: 'Legal age requirement' }
    ],
    allowed_actions: ['Explain legal age requirement', 'Inform user to return when 18'],
    disallowed_actions: ['Adjust balance for minor', 'Process withdrawal exception for minor'],
    conditions: [
      {
        if: [{ field: 'is_minor', operator: 'equals', value: true }],
        then: 'Cannot adjust balance - user must wait until 18',
        certainty: 'hard'
      }
    ],
    exceptions: [],
    examples_good: [
      'Minor with $30, min $50 → Agent explains cannot adjust, must wait until 18',
      'Minor asks for help withdrawing → Agent explains age restriction'
    ],
    examples_bad: [
      'Minor with 60% of minimum → Agent adjusts anyway (WRONG)',
      'Minor asks for adjustment → Agent processes it (WRONG)'
    ],
    tags: ['minor', 'underage', 'no_adjustment', 'age_restriction'],
    severity_default: 'critical',
    evidence_requirements: 'User age verification and appropriate denial of adjustment',
    verification_checks: [
      { check_id: 'verify_minor_status', description: 'Verify if user is underage', internal_tool_action: 'Check KYC and suspension reason', required_when: 'Suspended user requests adjustment' }
    ],
    source_location: { source_name: 'Suspended users cannot withdraw - Slack Update', section: 'New Simplified Procedure' }
  },

  // RULE 11: Suspended Users Bonus Eligibility
  {
    subcategory: 'Suspended Users Withdrawal',
    title: 'Suspended Users Bonus Eligibility',
    intent: 'Ensure agents correctly identify which suspended users can claim bonuses.',
    rule_text: 'Mitigated users ARE eligible for outstanding bonuses. Voluntary Self-excluded users are NOT eligible. Minors are excluded. Only OUTSTANDING bonuses qualify - not future bonuses during inactive periods.',
    steps: [
      { step_number: 1, action: 'Identify suspension type', note: 'Mitigated, SE, or minor' },
      { step_number: 2, action: 'If Mitigated: User IS eligible for outstanding bonuses', note: '' },
      { step_number: 3, action: 'If Voluntary SE: User is NOT eligible', note: '' },
      { step_number: 4, action: 'If Minor: Excluded from bonus procedure', note: '' },
      { step_number: 5, action: 'Only process OUTSTANDING bonuses', note: 'Not future bonuses' }
    ],
    allowed_actions: ['Credit level-up bonus', 'Share monthly bonus link (30 days)', 'Direct to VIP Telegram for weekly', 'Share reload bonus link', 'Enable rakeback for Bronze+'],
    disallowed_actions: ['Give bonuses to voluntary SE users', 'Give bonuses to minors', 'Share internal bonus links for weekly bonuses', 'Give future bonuses'],
    conditions: [
      {
        if: [{ field: 'suspension_type', operator: 'equals', value: 'mitigated' }],
        then: 'User IS eligible for outstanding bonuses',
        certainty: 'hard'
      },
      {
        if: [{ field: 'suspension_type', operator: 'equals', value: 'voluntary_self_exclusion' }],
        then: 'User is NOT eligible for bonuses',
        certainty: 'hard'
      }
    ],
    exceptions: [],
    examples_good: [
      'Mitigated user missed level-up bonus → Agent manually credits it',
      'Voluntary SE user asks for bonus → Agent explains not eligible'
    ],
    examples_bad: [
      'Voluntary SE user → Agent gives bonus anyway (WRONG)',
      'Agent shares internal weekly bonus link (WRONG - use VIP Telegram)'
    ],
    tags: ['bonus', 'suspended', 'mitigated', 'self_exclusion', 'rakeback', 'outstanding_bonus'],
    severity_default: 'medium',
    evidence_requirements: 'User suspension type verification and appropriate bonus handling',
    verification_checks: [
      { check_id: 'verify_suspension_type_bonus', description: 'Check if mitigated or voluntary SE', internal_tool_action: 'Check account suspension reason', required_when: 'Suspended user asks about bonuses' }
    ],
    source_location: { source_name: 'Suspended users cannot withdraw', page: 2, section: 'Bonuses Accessible to Suspended Users' }
  },

  // RULE 12: Money Laundering Flag Resolution
  {
    subcategory: 'Suspended Users Withdrawal',
    title: 'Money Laundering Flag Blocking Withdrawal',
    intent: 'Ensure agents correctly handle money laundering flags blocking withdrawals.',
    rule_text: 'An outstanding flag in the Money Laundering section of ACP may prevent withdrawals. Tag a supervisor to cancel the amount.',
    steps: [
      { step_number: 1, action: 'Check ACP for Money Laundering flags', note: 'Outstanding amounts' },
      { step_number: 2, action: 'If flag exists and blocking withdrawal: Tag supervisor', note: '' },
      { step_number: 3, action: 'Supervisor will cancel the amount', note: '' }
    ],
    allowed_actions: ['Tag supervisor to cancel ML flag amount'],
    disallowed_actions: ['Ignore ML flag', 'Try to process withdrawal without resolving flag'],
    conditions: [
      {
        if: [{ field: 'money_laundering_flag', operator: 'equals', value: true }],
        then: 'Tag supervisor to cancel the amount',
        certainty: 'hard'
      }
    ],
    exceptions: [],
    examples_good: [
      'User cannot withdraw, ML flag on ACP → Agent tags supervisor to cancel'
    ],
    examples_bad: [
      'ML flag blocking withdrawal → Agent ignores and tries to process (WRONG)'
    ],
    tags: ['money_laundering', 'acp_flag', 'supervisor', 'withdrawal_blocked'],
    severity_default: 'high',
    evidence_requirements: 'ML flag identification and supervisor tag for resolution',
    verification_checks: [
      { check_id: 'verify_ml_flag', description: 'Check ACP Money Laundering section for flags', internal_tool_action: 'Review ACP ML section', required_when: 'Suspended user withdrawal issues' }
    ],
    source_location: { source_name: 'Suspended users cannot withdraw', page: 3, section: 'Outstanding in Money Laundering on ACP' }
  },

  // ===========================================
  // HACKED ACCOUNTS RULES
  // ===========================================

  // RULE 13: User Reports Being Hacked - Restrict Recipient
  {
    subcategory: 'Hacked Accounts',
    title: 'User Reports Being Hacked - Restrict Recipient Account',
    intent: 'Ensure agents properly restrict the account that received stolen funds when user reports being hacked.',
    rule_text: 'When a user reports missing money due to a tip or withdrawal transfer to another Stake account, tag a Specialist/Supervisor to set the suspended and frozen roles on the RECIPIENT account, and add the tag "Potentially a hacker".',
    steps: [
      { step_number: 1, action: 'Identify the recipient account (where funds were sent)', note: 'From tip or withdrawal transfer' },
      { step_number: 2, action: 'Tag Specialist/Supervisor', note: '' },
      { step_number: 3, action: 'Request to set "suspended" role on recipient', note: '' },
      { step_number: 4, action: 'Request to set "frozen" role on recipient', note: '' },
      { step_number: 5, action: 'Request to add tag "Potentially a hacker"', note: '' }
    ],
    allowed_actions: ['Tag SS/SL to restrict recipient', 'Request suspended role', 'Request frozen role', 'Request potentially a hacker tag'],
    disallowed_actions: ['Ignore hacking report', 'Set roles without tagging SS/SL', 'Restrict the victim account instead of recipient'],
    conditions: [
      {
        if: [{ field: 'user_reports_hacked', operator: 'equals', value: true }, { field: 'funds_sent_to_stake_account', operator: 'equals', value: true }],
        then: 'Tag SS/SL to set suspended+frozen roles and "Potentially a hacker" tag on recipient account',
        certainty: 'hard'
      }
    ],
    exceptions: [],
    examples_good: [
      'User reports $500 tipped to unknown account → Agent tags Supervisor to set suspended+frozen on recipient with "Potentially a hacker" tag'
    ],
    examples_bad: [
      'User reports being hacked → Agent ignores and doesn\'t escalate (WRONG)',
      'User reports tip to hacker → Agent restricts victim\'s account instead (WRONG)'
    ],
    tags: ['hacked', 'hacker', 'recipient', 'suspended', 'frozen', 'tip', 'stolen_funds'],
    severity_default: 'critical',
    evidence_requirements: 'User reported being hacked, agent tagged SS/SL to restrict recipient account',
    verification_checks: [
      { check_id: 'verify_recipient_identified', description: 'Verify recipient account was identified', internal_tool_action: 'Check tip/transfer records', required_when: 'User reports being hacked' },
      { check_id: 'verify_ss_sl_tagged_hack', description: 'Verify SS/SL was tagged to restrict recipient', internal_tool_action: 'Check ticket for SS/SL tag', required_when: 'User reports hacking' }
    ],
    source_location: { source_name: 'Report being hacked', page: 1, section: '1. When users reported hackers' }
  },

  // RULE 14: Potential Hacker Contacts Us - KYC Level 4
  {
    subcategory: 'Hacked Accounts',
    title: 'Potential Hacker Contacts Us - Require KYC Level 4',
    intent: 'Ensure agents guide potential hackers through KYC level 4 verification before any account access.',
    rule_text: 'When a user with the "Potentially a hacker" tag and suspended/frozen roles contacts us, guide them to complete KYC level 4. Forward to fraud-abuse-kyc channel IMMEDIATELY - do not wait 48 hours.',
    steps: [
      { step_number: 1, action: 'Identify user has "Potentially a hacker" tag and roles', note: '' },
      { step_number: 2, action: 'Explain account is restricted due to possible fraudulent activity', note: '' },
      { step_number: 3, action: 'Guide user to complete KYC level 4', note: '' },
      { step_number: 4, action: 'Forward to fraud-abuse-kyc channel IMMEDIATELY', note: 'Do NOT wait 48 hours' },
      { step_number: 5, action: 'Use the appropriate macro explaining restriction and KYC requirement', note: '' }
    ],
    allowed_actions: ['Guide to KYC level 4', 'Forward to fraud-abuse-kyc immediately', 'Use restriction explanation macro'],
    disallowed_actions: ['Remove restrictions without KYC', 'Wait 48 hours before forwarding', 'Process any withdrawal requests'],
    conditions: [
      {
        if: [{ field: 'has_potentially_hacker_tag', operator: 'equals', value: true }],
        then: 'Guide to KYC level 4, forward to fraud-abuse-kyc IMMEDIATELY (no 48h wait)',
        certainty: 'hard'
      }
    ],
    exceptions: [],
    examples_good: [
      'User with hacker tag contacts us → Agent explains restriction, guides to KYC level 4, forwards to fraud-abuse-kyc immediately'
    ],
    examples_bad: [
      'Potential hacker asks for help → Agent waits 48 hours before forwarding (WRONG)',
      'Potential hacker contacts us → Agent removes restrictions without KYC verification (WRONG)'
    ],
    tags: ['potential_hacker', 'kyc_level_4', 'fraud_abuse_kyc', 'verification', 'immediate_forward'],
    severity_default: 'critical',
    evidence_requirements: 'Agent guided to KYC level 4 and forwarded to fraud-abuse-kyc without 48h wait',
    verification_checks: [
      { check_id: 'verify_kyc4_guidance', description: 'Verify agent guided user to KYC level 4', internal_tool_action: 'Check agent response for KYC guidance', required_when: 'Potential hacker contacts support' },
      { check_id: 'verify_immediate_forward', description: 'Verify forwarded immediately without 48h wait', internal_tool_action: 'Check ticket forward timing', required_when: 'Potential hacker case' }
    ],
    source_location: { source_name: 'Report being hacked', page: 2, section: '1-1. A Potential hacker contacts us' }
  },

  // RULE 15: After KYC Level 4 - Send to Recovery
  {
    subcategory: 'Hacked Accounts',
    title: 'After Potential Hacker Completes KYC 4 - Send to Recovery',
    intent: 'Ensure agents send potential hackers to recovery@stake.com after KYC level 4 completion to prove account ownership.',
    rule_text: 'After a potential hacker completes KYC level 4, send them to recovery@stake.com so they can prove ownership of the account and potentially have roles and tags removed.',
    steps: [
      { step_number: 1, action: 'Confirm KYC level 4 is completed', note: '' },
      { step_number: 2, action: 'Inform user of next step to remove restriction', note: '' },
      { step_number: 3, action: 'Direct user to contact recovery@stake.com', note: 'Using registered email address' },
      { step_number: 4, action: 'Explain they can prove ownership to have roles/tags removed', note: '' }
    ],
    allowed_actions: ['Send to recovery@stake.com', 'Use ownership verification macro'],
    disallowed_actions: ['Remove roles/tags yourself', 'Skip recovery team involvement', 'Promise restrictions will be removed'],
    conditions: [
      {
        if: [{ field: 'has_potentially_hacker_tag', operator: 'equals', value: true }, { field: 'kyc_level_4_completed', operator: 'equals', value: true }],
        then: 'Send to recovery@stake.com to prove ownership and potentially remove roles/tags',
        certainty: 'hard'
      }
    ],
    exceptions: [],
    examples_good: [
      'Potential hacker completes KYC 4 → Agent directs to recovery@stake.com using registered email to prove ownership'
    ],
    examples_bad: [
      'KYC 4 completed → Agent removes restrictions without recovery team (WRONG)',
      'KYC 4 completed → Agent promises tags will definitely be removed (WRONG - say "potentially")'
    ],
    tags: ['kyc_level_4', 'recovery_team', 'ownership_verification', 'restrictions_removal'],
    severity_default: 'high',
    evidence_requirements: 'Agent directed user to recovery@stake.com after KYC 4 completion',
    verification_checks: [
      { check_id: 'verify_recovery_referral', description: 'Verify agent sent to recovery@stake.com', internal_tool_action: 'Check agent response for recovery email', required_when: 'Potential hacker completes KYC 4' }
    ],
    source_location: { source_name: 'Report being hacked', page: 2, section: 'After completing KYC level 4' }
  },

  // RULE 16: Compromised Role - Two Conditions Required
  {
    subcategory: 'Hacked Accounts',
    title: 'Compromised Role - Both Conditions Must Be Met',
    intent: 'Ensure agents verify both conditions before requesting C (Compromised) role for hacking victims.',
    rule_text: 'A Specialist/Supervisor will apply the C (Compromised) role ONLY when BOTH conditions are met: 1) User contacts from their linked email address, AND 2) User has funds on balance (at least minimum withdrawal) OR unclaimed bonuses. After C role, forward to recovery@stake.com.',
    steps: [
      { step_number: 1, action: 'Verify user is contacting from linked email address', note: 'Condition 1' },
      { step_number: 2, action: 'Check if user has funds on balance (minimum withdrawal amount+)', note: 'Condition 2a' },
      { step_number: 3, action: 'OR check if user has unclaimed bonuses', note: 'Condition 2b' },
      { step_number: 4, action: 'If BOTH conditions met: Tag SS/SL to apply C role', note: '' },
      { step_number: 5, action: 'After C role applied: Forward to recovery@stake.com', note: '' }
    ],
    allowed_actions: ['Verify linked email', 'Check balance/bonuses', 'Tag SS/SL for C role if both conditions met', 'Forward to recovery'],
    disallowed_actions: ['Apply C role without both conditions', 'Apply C role if not linked email', 'Skip recovery team forward'],
    conditions: [
      {
        if: [{ field: 'contact_from_linked_email', operator: 'equals', value: true }, { field: 'has_funds_or_bonuses', operator: 'equals', value: true }],
        then: 'Tag SS/SL to apply C (Compromised) role, then forward to recovery@stake.com',
        certainty: 'hard'
      },
      {
        if: [{ field: 'contact_from_linked_email', operator: 'equals', value: false }],
        then: 'Do NOT apply C role - send directly to recovery@stake.com',
        certainty: 'hard'
      },
      {
        if: [{ field: 'contact_from_linked_email', operator: 'equals', value: true }, { field: 'has_funds_or_bonuses', operator: 'equals', value: false }],
        then: 'Do NOT apply C role - send directly to recovery@stake.com',
        certainty: 'hard'
      }
    ],
    exceptions: [],
    examples_good: [
      'User from linked email + has $100 balance → Tag SS/SL for C role, forward to recovery',
      'User from linked email + has unclaimed bonus → Tag SS/SL for C role, forward to recovery',
      'User NOT from linked email → Send directly to recovery (no C role)'
    ],
    examples_bad: [
      'User reports hack but not from linked email → Agent requests C role anyway (WRONG)',
      'User from linked email but no funds/bonuses → Agent requests C role (WRONG)'
    ],
    tags: ['compromised', 'c_role', 'linked_email', 'funds', 'bonuses', 'recovery_team'],
    severity_default: 'high',
    evidence_requirements: 'Both conditions verified (linked email + funds/bonuses) before C role request',
    verification_checks: [
      { check_id: 'verify_linked_email', description: 'Verify user contacted from linked email', internal_tool_action: 'Check contact email vs account email', required_when: 'Hacking victim reporting' },
      { check_id: 'verify_funds_bonuses', description: 'Verify user has funds or unclaimed bonuses', internal_tool_action: 'Check account balance and bonus status', required_when: 'C role consideration' }
    ],
    source_location: { source_name: 'Report being hacked', page: 3, section: '2. Hacked accounts side' }
  },

  // RULE 17: No Conditions Met - Direct to Recovery
  {
    subcategory: 'Hacked Accounts',
    title: 'Hacking Victim Without Funds/Linked Email - Direct to Recovery',
    intent: 'Ensure agents send hacking victims directly to recovery team when conditions for C role are not met.',
    rule_text: 'For hacking victims who do NOT meet both conditions (linked email + funds/bonuses), do NOT set any roles and do NOT investigate further. Send user directly to recovery@stake.com.',
    steps: [
      { step_number: 1, action: 'Verify conditions are NOT met', note: 'Not linked email OR no funds/bonuses' },
      { step_number: 2, action: 'Do NOT set any roles', note: '' },
      { step_number: 3, action: 'Do NOT investigate further', note: '' },
      { step_number: 4, action: 'Send user directly to recovery@stake.com', note: '' }
    ],
    allowed_actions: ['Send to recovery@stake.com'],
    disallowed_actions: ['Set roles without conditions met', 'Investigate without authority', 'Keep user waiting for investigation'],
    conditions: [
      {
        if: [{ field: 'conditions_for_c_role_met', operator: 'equals', value: false }],
        then: 'Send directly to recovery@stake.com - no roles, no investigation',
        certainty: 'hard'
      }
    ],
    exceptions: [],
    examples_good: [
      'User reports hack but no funds → Send directly to recovery@stake.com (no C role)',
      'User reports hack from different email → Send directly to recovery@stake.com'
    ],
    examples_bad: [
      'User without funds → Agent tries to investigate and set roles (WRONG)',
      'User not from linked email → Agent keeps them waiting for investigation (WRONG)'
    ],
    tags: ['recovery_team', 'no_investigation', 'direct_referral'],
    severity_default: 'medium',
    evidence_requirements: 'Agent sent user directly to recovery without setting roles when conditions not met',
    verification_checks: [],
    source_location: { source_name: 'Report being hacked', page: 3, section: '2. Hacked accounts side' }
  },

  // RULE 18: No Compensation for Hacking
  {
    subcategory: 'Hacked Accounts',
    title: 'No Compensation for Hacking Losses',
    intent: 'Ensure agents do not promise or offer compensation for funds lost due to hacking.',
    rule_text: 'We CANNOT compensate for loss of funds due to being hacked. Do not promise, suggest, or imply that compensation is possible.',
    steps: [
      { step_number: 1, action: 'If user asks for compensation', note: '' },
      { step_number: 2, action: 'Explain we cannot compensate for hacking losses', note: '' },
      { step_number: 3, action: 'Continue with standard procedure (recovery team referral)', note: '' }
    ],
    allowed_actions: ['Explain no compensation policy', 'Show empathy', 'Continue with recovery process'],
    disallowed_actions: ['Promise compensation', 'Suggest compensation might be possible', 'Escalate for compensation review'],
    conditions: [
      {
        if: [{ field: 'user_asks_compensation', operator: 'equals', value: true }, { field: 'reason', operator: 'equals', value: 'hacking' }],
        then: 'Explain we cannot compensate for loss of funds due to being hacked',
        certainty: 'hard'
      }
    ],
    exceptions: [],
    examples_good: [
      'User: Can I get my money back? → Agent: Unfortunately, we cannot compensate for funds lost due to being hacked.'
    ],
    examples_bad: [
      'User asks for compensation → Agent says "let me check if we can do something" (WRONG)',
      'User asks for compensation → Agent escalates for possible reimbursement (WRONG)'
    ],
    tags: ['compensation', 'no_refund', 'hacking_loss', 'policy'],
    severity_default: 'critical',
    evidence_requirements: 'Agent clearly stated no compensation for hacking when user asked',
    verification_checks: [
      { check_id: 'verify_no_compensation_stated', description: 'Verify agent explained no compensation policy', internal_tool_action: 'Check agent response for compensation denial', required_when: 'User asks for hacking compensation' }
    ],
    source_location: { source_name: 'Report being hacked', page: 3, section: '2-1. When the user asks for the compensate' }
  },

  // RULE 19: Multiple Ownership Claims - Forward to Recovery
  {
    subcategory: 'Hacked Accounts',
    title: 'Multiple Players Claiming Same Account - Forward to Recovery',
    intent: 'Ensure agents forward multiple ownership claims to recovery team without making decisions.',
    rule_text: 'When multiple players are claiming ownership of one account, forward them all to recovery@stake.com. Do not make ownership determination yourself.',
    steps: [
      { step_number: 1, action: 'Identify multiple people claiming same account', note: '' },
      { step_number: 2, action: 'Forward all parties to recovery@stake.com', note: '' },
      { step_number: 3, action: 'Do NOT make ownership determination', note: '' }
    ],
    allowed_actions: ['Forward to recovery@stake.com'],
    disallowed_actions: ['Determine ownership yourself', 'Give account access to any party', 'Make judgments about who is the real owner'],
    conditions: [
      {
        if: [{ field: 'multiple_ownership_claims', operator: 'equals', value: true }],
        then: 'Forward all parties to recovery@stake.com',
        certainty: 'hard'
      }
    ],
    exceptions: [],
    examples_good: [
      'Two people claim same account → Agent forwards both to recovery@stake.com'
    ],
    examples_bad: [
      'Two people claim account → Agent decides one is the real owner (WRONG)',
      'Multiple claims → Agent gives access to first person who contacted (WRONG)'
    ],
    tags: ['multiple_claims', 'ownership_dispute', 'recovery_team'],
    severity_default: 'high',
    evidence_requirements: 'Agent forwarded multiple claimants to recovery team without making ownership decisions',
    verification_checks: [],
    source_location: { source_name: 'Report being hacked', page: 3, section: '2-2. Multiple players are claiming ownership of one account' }
  }
];

// ===========================================
// SEED FUNCTION
// ===========================================

async function seedAccountManagement() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/clara';
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    // ========== STEP 1: Create/Update QACategory ==========
    console.log('\n📚 Creating/Updating QACategory...');

    let category;
    const existing = await QACategory.findOne({
      name: { $regex: new RegExp(`^${ACCOUNT_MANAGEMENT_CATEGORY.name}$`, 'i') }
    });

    if (existing) {
      console.log('   Account Management category exists. Updating...');
      existing.description = ACCOUNT_MANAGEMENT_CATEGORY.description;
      existing.knowledge = ACCOUNT_MANAGEMENT_CATEGORY.knowledge;
      existing.keywords = ACCOUNT_MANAGEMENT_CATEGORY.keywords;
      existing.evaluationCriteria = ACCOUNT_MANAGEMENT_CATEGORY.evaluationCriteria;
      existing.subcategories = ACCOUNT_MANAGEMENT_CATEGORY.subcategories;
      existing.isActive = true;
      await existing.save();
      category = existing;
      console.log('   ✅ Category UPDATED');
    } else {
      category = await QACategory.create({
        ...ACCOUNT_MANAGEMENT_CATEGORY,
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
      const rule_id = Rule.generateRuleId(ACCOUNT_MANAGEMENT_CATEGORY.name, ruleData.title);

      const rule = await Rule.create({
        rule_id,
        category: category._id,
        category_name: ACCOUNT_MANAGEMENT_CATEGORY.name,
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
  seedAccountManagement();
}

module.exports = { seedAccountManagement, ACCOUNT_MANAGEMENT_CATEGORY, RULES };
