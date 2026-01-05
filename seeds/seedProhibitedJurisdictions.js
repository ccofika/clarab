/**
 * Seed Script: Prohibited Jurisdictions Knowledge Base
 *
 * This script adds Prohibited Jurisdictions knowledge including country flag classifications
 * and procedures for handling users from restricted regions.
 *
 * Run with: node seeds/seedProhibitedJurisdictions.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const QACategory = require('../models/QACategory');
const Rule = require('../models/Rule');

// ===========================================
// COUNTRY LISTS
// ===========================================

const RED_FLAG_COUNTRIES = [
  'Afghanistan', 'Australia', 'Brazil', 'Colombia', 'Côte d\'Ivoire', 'Cuba', 'Curaçao',
  'Democratic Republic of the Congo', 'Iran', 'Iraq', 'Italy', 'Liberia', 'Libya',
  'Netherlands', 'North Korea', 'Ontario', 'Peru', 'Portugal', 'Puerto Rico', 'Serbia',
  'South Sudan', 'Spain', 'Sudan', 'Switzerland', 'Syria', 'United Kingdom', 'United States', 'Zimbabwe'
];

const ORANGE_FLAG_COUNTRIES = [
  'Argentina', 'Austria', 'Belgium', 'Croatia', 'Cyprus', 'Czech Republic', 'Denmark',
  'France', 'Germany', 'Greece', 'Israel', 'Lithuania', 'Malta', 'Poland', 'Slovakia'
];

const YELLOW_FLAG_COUNTRIES = [
  'Sweden'
];

// ===========================================
// QA CATEGORY DATA
// ===========================================

const PROHIBITED_JURISDICTIONS_CATEGORY = {
  name: 'Prohibited Jurisdictions',
  description: 'Procedures for handling users from restricted regions including RED, ORANGE, YELLOW, and GREEN flag countries. Covers compliance protocols, account restrictions, and proper communication guidelines.',
  knowledge: `## Prohibited Jurisdictions Overview

Our platform operates in a dynamic legal environment requiring compliance with diverse regulations across different jurisdictions. Laws regarding online gambling and betting vary significantly from region to region.

### Country Flag Classification System:

| Flag | Restriction Level | Action Required |
|------|------------------|-----------------|
| **RED** | Fully Prohibited | Restrict account, set Suspendedlevel3 |
| **ORANGE** | Medium Restriction | Do NOT restrict, troubleshoot access issues, advise on local laws |
| **YELLOW** | Soft Restriction | Do NOT restrict, forward to local laws + TOS |
| **GREEN** | Not Restricted | Advise to check local laws + TOS, do NOT confirm with Yes/No |

### Key Principles:
1. **Never use internal terminology** with customers (RED/HARD, ORANGE/MEDIUM, YELLOW/SOFT)
2. **Always say "restricted areas"** - never specify the flag color
3. **Do NOT send screenshots** of ToS restricted jurisdiction section
4. **Do NOT copy/paste** the full list of restricted jurisdictions
5. **Customer is obligated** to check local laws themselves
6. **Compliance protocols** are handled by Compliance Team - do not disclose ACP roles/tags

### RED Flag Countries:
${RED_FLAG_COUNTRIES.join(', ')}

### ORANGE Flag Countries:
${ORANGE_FLAG_COUNTRIES.join(', ')}

### YELLOW Flag Countries:
${YELLOW_FLAG_COUNTRIES.join(', ')}`,

  keywords: [
    'prohibited', 'jurisdiction', 'restricted', 'country', 'region', 'flag',
    'RED', 'ORANGE', 'YELLOW', 'GREEN', 'compliance', 'suspendedlevel3',
    'withdrawal-only', 'KYC', 'level 3', 'level 4', 'verification',
    'local laws', 'terms of service', 'TOS', 'whitelist', 'troubleshoot',
    ...RED_FLAG_COUNTRIES.map(c => c.toLowerCase()),
    ...ORANGE_FLAG_COUNTRIES.map(c => c.toLowerCase()),
    ...YELLOW_FLAG_COUNTRIES.map(c => c.toLowerCase())
  ],

  evaluationCriteria: `When evaluating Prohibited Jurisdictions tickets, verify:
1. Agent correctly identified the country flag classification (RED/ORANGE/YELLOW/GREEN)
2. For RED countries: Agent tagged Senior to restrict user and set Suspendedlevel3
3. For RED countries: Agent used "restricted areas" wording, NOT "RED" or "HARD"
4. For ORANGE countries: Agent did NOT restrict account
5. For ORANGE countries: Agent provided troubleshooting steps before whitelist
6. For ORANGE/YELLOW: Agent did NOT mention the flag color to customer
7. Agent did NOT send screenshot of ToS restricted jurisdictions
8. Agent did NOT confirm Yes/No if country is allowed
9. Agent advised to check local laws and Terms of Service
10. For Compliance Protocol users: Agent did not disclose ACP role/tag
11. For Compliance Protocol users: Agent referred to email and complaints@stake.com if needed`,

  subcategories: [
    // ===========================================
    // SUBCATEGORY 1: RED Flag Countries
    // ===========================================
    {
      name: 'RED Flag Countries',
      description: 'Procedure for handling users from fully prohibited RED flag countries. These users must be restricted with Suspendedlevel3 role.',
      knowledge: `## RED Flag Countries Procedure

### RED Flag Country List:
${RED_FLAG_COUNTRIES.join(', ')}

---

## Scenario 1: Customer MENTIONS they are from RED country

**What to do:**
1. Support agent contacts **Senior to restrict** the user
2. Senior sets the role **Suspendedlevel3**
3. Assist with account verification to remove restrictions after providing appropriate documents
4. Mention they are from "**one of the restricted areas**" - do NOT say "RED" or "HARD"

**Macro message:**
> "Since you claimed that your place of residence is one of the forbidden/restricted regions, your account has been moved to withdrawal-only mode.
> If you do not live in a restricted area, please upload the proof of address at level 3.
> In the following article, you may see the list of acceptable documents for this level: (insert article)
> If there is anything else that we can do for you, please let us know."

**What NOT to do:**
- ❌ Ignore the customer
- ❌ Forward to local law and Terms of Service WITHOUT restricting account first

---

## Scenario 2: Customer SUSPENDED by KYC for RED country documents

**What to do:**
1. Assist them properly with account verification
2. Agent is free to notify them the country is one of the restricted areas

**Macro message:**
> "Your account has been placed in withdrawal-only status as you have provided documentation indicating that you reside in one of the restricted regions on our website.
> If you do not live in a restricted area, please upload the proof of address at level 3.
> In the following article, you may see the list of acceptable documents for this level: (insert article)
> If there is anything else that we can do for you, please let us know."

**What NOT to do:**
- ❌ Refuse to speed up verification process

---

## Scenario 3: Customer claims living in non-restricted country but has RED country documents

**What to do:**
1. Support agent contacts **Senior to restrict** the user
2. Senior sets the role **Suspendedlevel3**
3. Assist with account verification to remove restrictions after providing appropriate documents

**What NOT to do:**
- ❌ Leave account open without restricting it

---

## Important Rules:
- NEVER use "RED" or "HARD" terminology with customers
- ALWAYS say "restricted areas" or "restricted regions"
- DO NOT send screenshot of ToS restricted jurisdictions section
- DO NOT copy/paste full list of restricted countries`,
      keywords: ['red flag', 'prohibited', 'suspendedlevel3', 'restricted', 'withdrawal-only', 'verification', ...RED_FLAG_COUNTRIES.map(c => c.toLowerCase())],
      examples: [
        'User says "I am from USA" → Tag Senior to restrict, set Suspendedlevel3, say "restricted areas"',
        'User suspended for UK documents → Assist with verification, can say "restricted areas"',
        'User claims living in Canada but has Australian ID → Tag Senior to restrict first'
      ],
      evaluationCriteria: 'Agent tagged Senior to restrict RED country user. Agent set Suspendedlevel3 role. Agent used "restricted areas" wording, NOT "RED/HARD". Agent did NOT ignore or forward to TOS without restricting.'
    },

    // ===========================================
    // SUBCATEGORY 2: ORANGE Flag Countries
    // ===========================================
    {
      name: 'ORANGE Flag Countries',
      description: 'Procedure for handling users from ORANGE flag countries. These users should NOT be restricted but may need troubleshooting assistance.',
      knowledge: `## ORANGE Flag Countries Procedure

### ORANGE Flag Country List:
${ORANGE_FLAG_COUNTRIES.join(', ')}

**IMPORTANT: ORANGE countries CANNOT be treated as RED flag countries!**

---

## Scenario 1: Customer MENTIONS they are from ORANGE country

**What to do:**
1. Advise them to be up to date on local laws before using the service
2. Forward them the TOS to check everything themselves

**What NOT to do:**
- ❌ Do NOT restrict the account
- ❌ Do NOT mention they are from one of the ORANGE countries

---

## Scenario 2: Customer UNABLE TO LOGIN from ORANGE country

**What to do (troubleshooting steps in order):**
1. Ask user to try another IP address
2. Ask user to try Opera browser / Tenta Private browser
3. Ask user to try mobile data
4. Ask user to restart the router
5. **If nothing works AND user has funds:** Tag Senior to set **whitelist role for 30 minutes** so they can withdraw
6. Forward to state law and Terms of Service, explaining decision is on regulators

**What NOT to do:**
- ❌ Do NOT restrict the account
- ❌ Do NOT mention they are from one of the ORANGE countries

---

## Key Rules:
- **Never restrict** ORANGE country accounts
- **Never mention** ORANGE flag to customers
- Whitelist role is for **30 minutes only** - just for withdrawal
- Tag Senior for whitelist role
- Do NOT send screenshot of ToS restricted jurisdictions
- Do NOT copy/paste restricted countries list`,
      keywords: ['orange flag', 'medium restriction', 'troubleshoot', 'whitelist', 'vpn', 'cannot login', 'cannot access', ...ORANGE_FLAG_COUNTRIES.map(c => c.toLowerCase())],
      examples: [
        'User from France can\'t access → Troubleshoot (IP, Opera, mobile data, router) → If still blocked with funds, whitelist 30 mins',
        'User mentions they are from Germany → Advise local laws + TOS, do NOT restrict',
        'User from Israel asks if allowed → Forward to TOS, do NOT confirm yes/no'
      ],
      evaluationCriteria: 'Agent did NOT restrict ORANGE country account. Agent did NOT mention ORANGE flag to customer. Agent provided troubleshooting steps. Agent tagged Senior for whitelist role if needed. Agent forwarded to local laws and TOS.'
    },

    // ===========================================
    // SUBCATEGORY 3: YELLOW Flag Countries
    // ===========================================
    {
      name: 'YELLOW Flag Countries',
      description: 'Procedure for handling users from YELLOW flag countries (soft restriction). These users should NOT be restricted.',
      knowledge: `## YELLOW Flag Countries Procedure

### YELLOW Flag Country List:
${YELLOW_FLAG_COUNTRIES.join(', ')}

---

## Scenario: Customer claims they are from YELLOW country

**What to do:**
1. Forward them to thoroughly read the law of their country before using services
2. Forward link to Terms of Service to check everything themselves
3. Do NOT explain/confirm if the country is one of the YELLOW flag countries

**What NOT to do:**
- ❌ Do NOT restrict the account
- ❌ Do NOT mention they are from one of the YELLOW countries
- ❌ Do NOT confirm if the country is restricted
- ❌ Do NOT suspend the user

---

## Scenario: Customer ASKS if they are allowed from YELLOW country

**What to do:**
1. Advise them to be up to date on local laws before using the service
2. Forward them the TOS to check everything themselves

**What NOT to do:**
- ❌ Do NOT confirm if the country is restricted
- ❌ Do NOT suspend the user

---

## Key Rules:
- **Never restrict** YELLOW country accounts
- **Never mention** YELLOW flag to customers
- **Never confirm** if country is restricted or allowed
- Do NOT send screenshot of ToS restricted jurisdictions`,
      keywords: ['yellow flag', 'soft restriction', 'sweden', 'local laws', 'terms of service'],
      examples: [
        'User from Sweden asks about access → Forward to local laws + TOS, do NOT confirm/deny',
        'User mentions Sweden → Advise local laws + TOS, do NOT restrict, do NOT mention YELLOW'
      ],
      evaluationCriteria: 'Agent did NOT restrict YELLOW country account. Agent did NOT mention YELLOW flag to customer. Agent did NOT confirm if country is restricted. Agent forwarded to local laws and TOS.'
    },

    // ===========================================
    // SUBCATEGORY 4: GREEN Countries (Not Restricted)
    // ===========================================
    {
      name: 'GREEN Countries (Not Restricted)',
      description: 'Procedure for handling users from GREEN (non-restricted) countries asking about service availability.',
      knowledge: `## GREEN Countries Procedure

GREEN countries are countries that are NOT on any restricted list.

---

## Scenario: Customer asks if allowed to use services from GREEN country

**What to do:**
1. Advise them to be up to date on local laws before using the service
2. Forward them the TOS to check everything themselves
3. Use "should" if necessary (e.g., "you should be fine")

**What NOT to do:**
- ❌ Do NOT confirm with Yes/No answer
- ❌ Customer is obligated to check everything by themselves

---

## Why no Yes/No confirmation:
- Legal environment is dynamic
- Laws can change
- Customer responsibility to verify
- Platform cannot guarantee legality in every jurisdiction

---

## Example Response:
> "We advise you to be up to date on local laws before using the service. You can find our Terms of Service here: [link]. Please review everything to ensure compliance with your local regulations."`,
      keywords: ['green country', 'not restricted', 'allowed', 'can i use', 'available'],
      examples: [
        'User asks "Can I use Stake from Japan?" → Forward to local laws + TOS, do NOT say Yes/No',
        'User from allowed country asks → Advise to check local laws, use "should" if necessary'
      ],
      evaluationCriteria: 'Agent did NOT confirm with Yes/No answer. Agent advised to check local laws and TOS. Agent used "should" wording if needed.'
    },

    // ===========================================
    // SUBCATEGORY 5: Compliance Jurisdiction Protocols
    // ===========================================
    {
      name: 'Compliance Jurisdiction Protocols',
      description: 'Procedure for handling users identified by Compliance Team protocols for potential prohibited jurisdiction access.',
      knowledge: `## Compliance Jurisdiction Protocols

### Overview:
The Compliance Team periodically reviews accounts that are likely to be located in a Prohibited Jurisdiction. They:
1. Gather data from various business units
2. Combine with independent reviews
3. Assess whether customer has accessed from prohibited jurisdiction

---

## Protocol Process:

### Step 1: CRM Email
When user is suspected of accessing from Prohibited Jurisdiction:
- CRM team sends email encouraging KYC Level 3 (or 4) verification within **14 days**
- User can continue using account as normal until deadline

### Step 2: After 14 Days (if not verified)
If user fails to verify within time:
- **suspendedLevel3** role is assigned
- Compliance message added: "Compliance - potentially [COUNTRY CODE]" or "Prohibited Jurisdiction Protocol - Level 3/4 Required"
- Tag added: "Prohibited Jurisdiction Protocol - Actioned" or "Prohibited Jurisdiction Protocol - Reviewed/No Action"

---

## How to Handle User Inquiries:

**What to do:**
1. Assist user as usual in uploading required KYC documents (typically Level 3)
2. If they ask why this is needed: **Do NOT disclose ACP role or tag**
3. Advise them to refer to the email they received at their registered email address
4. If they continue seeking clarification: Forward to **complaints@stake.com**

**What NOT to do:**
- ❌ Do NOT disclose information about ACP role or tag
- ❌ Do NOT explain the compliance protocol details
- ❌ Do NOT mention the country code from the role message

---

## Response template:
> "Please refer to the email you received at the email address registered with your account for more information. If you have further questions, you can contact complaints@stake.com and the team will assist you."`,
      keywords: ['compliance', 'protocol', 'prohibited jurisdiction', 'suspendedlevel3', 'kyc level 3', 'kyc level 4', '14 days', 'complaints@stake.com', 'crm'],
      examples: [
        'User asks why they need KYC Level 3 suddenly → Refer to email they received, do NOT disclose ACP role',
        'User has "Prohibited Jurisdiction Protocol" tag → Assist with KYC, forward to complaints@stake.com if persistent',
        'User asks about "Compliance - potentially US" note → Do NOT disclose, refer to email'
      ],
      evaluationCriteria: 'Agent did NOT disclose ACP role or tag. Agent referred user to their email. Agent assisted with KYC upload. Agent forwarded to complaints@stake.com when needed.'
    }
  ]
};

// ===========================================
// RULES DATA
// ===========================================

const RULES = [
  // ===========================================
  // RED FLAG COUNTRY RULES
  // ===========================================

  // RULE 1: Customer Mentions RED Country - Must Restrict
  {
    subcategory: 'RED Flag Countries',
    title: 'Customer Mentions RED Country - Must Restrict Account',
    intent: 'Ensure agents immediately restrict accounts when customers claim to be from RED flag countries.',
    rule_text: 'When a customer mentions or claims they are from a RED flag country, the support agent MUST contact Senior to restrict the user and set the Suspendedlevel3 role. The account must be placed in withdrawal-only mode.',
    steps: [
      { step_number: 1, action: 'Identify that customer mentioned RED flag country', note: 'USA, UK, Australia, etc.' },
      { step_number: 2, action: 'Tag Senior to restrict the user', note: '' },
      { step_number: 3, action: 'Senior sets Suspendedlevel3 role', note: '' },
      { step_number: 4, action: 'Inform customer using "restricted areas" wording', note: 'Never say RED or HARD' },
      { step_number: 5, action: 'Assist with verification if they want to prove different residence', note: 'Level 3 proof of address' }
    ],
    allowed_actions: ['Tag Senior to restrict', 'Use restricted areas terminology', 'Assist with KYC Level 3', 'Offer verification option'],
    disallowed_actions: ['Ignore the claim', 'Forward to TOS without restricting', 'Say RED or HARD to customer', 'Leave account unrestricted'],
    conditions: [
      {
        if: [{ field: 'customer_country_mentioned', operator: 'in', value: RED_FLAG_COUNTRIES }],
        then: 'Tag Senior to restrict and set Suspendedlevel3 role',
        certainty: 'hard'
      }
    ],
    exceptions: [],
    examples_good: [
      'User: "I am from USA" → Agent tags Senior, account restricted with Suspendedlevel3',
      'User mentions UK → Agent says "your residence is one of the restricted areas"'
    ],
    examples_bad: [
      'User says they are from Australia → Agent ignores and continues helping (WRONG)',
      'User mentions USA → Agent forwards to TOS without restricting (WRONG)',
      'Agent tells user "you are from a RED country" (WRONG terminology)'
    ],
    tags: ['red_flag', 'restriction', 'suspendedlevel3', 'prohibited', 'must_restrict', ...RED_FLAG_COUNTRIES.map(c => c.toLowerCase().replace(/\s+/g, '_'))],
    severity_default: 'critical',
    evidence_requirements: 'Customer mentioned RED flag country, agent tagged Senior to restrict, Suspendedlevel3 set',
    verification_checks: [
      { check_id: 'verify_senior_tagged', description: 'Verify Senior was tagged to restrict', internal_tool_action: 'Check ticket for Senior tag', required_when: 'RED country mentioned' },
      { check_id: 'verify_role_set', description: 'Verify Suspendedlevel3 role was set', internal_tool_action: 'Check account roles', required_when: 'RED country customer' }
    ],
    source_location: { source_name: 'Countries, Restrictions and Their Process', page: 2, section: 'Customer mentions they are from Red country' }
  },

  // RULE 2: Never Use RED/HARD Terminology
  {
    subcategory: 'RED Flag Countries',
    title: 'Never Use RED/HARD Terminology with Customers',
    intent: 'Ensure agents never disclose internal flag classification terminology to customers.',
    rule_text: 'Agents must NEVER use the words "RED", "HARD", "ORANGE", "MEDIUM", "YELLOW", or "SOFT" when communicating with customers about restricted countries. Always use "restricted areas" or "restricted regions" instead.',
    steps: [
      { step_number: 1, action: 'When informing about restrictions', note: '' },
      { step_number: 2, action: 'Use "restricted areas" or "restricted regions"', note: '' },
      { step_number: 3, action: 'Never mention flag colors or restriction levels', note: '' }
    ],
    allowed_actions: ['Say "restricted areas"', 'Say "restricted regions"', 'Say "forbidden regions"'],
    disallowed_actions: ['Say "RED country"', 'Say "HARD restricted"', 'Say "ORANGE country"', 'Say "MEDIUM restricted"', 'Say "YELLOW country"', 'Say "SOFT restricted"'],
    conditions: [
      {
        if: [{ field: 'discussing_country_restrictions', operator: 'equals', value: true }],
        then: 'Use "restricted areas/regions" terminology only',
        certainty: 'hard'
      }
    ],
    exceptions: [],
    examples_good: [
      '"Your place of residence is one of the restricted areas"',
      '"You reside in one of the restricted regions on our website"'
    ],
    examples_bad: [
      '"You are from a RED country"',
      '"Your country is HARD restricted"',
      '"This is an ORANGE flag country"'
    ],
    tags: ['terminology', 'communication', 'restricted_areas', 'wording'],
    severity_default: 'high',
    evidence_requirements: 'Agent used correct terminology without revealing internal flag system',
    verification_checks: [
      { check_id: 'verify_terminology', description: 'Check agent did not use RED/ORANGE/YELLOW/HARD/MEDIUM/SOFT', internal_tool_action: 'Review agent messages for prohibited terms', required_when: 'Discussing country restrictions' }
    ],
    source_location: { source_name: 'Countries, Restrictions and Their Process', page: 4, section: 'In this case, there is no reason to tell if the country in question is one of the RED' }
  },

  // RULE 3: RED Country Documents - Already Suspended
  {
    subcategory: 'RED Flag Countries',
    title: 'Customer Suspended for RED Country Documents - Assist Verification',
    intent: 'Ensure agents properly assist users who were suspended by KYC team for RED country documents.',
    rule_text: 'When a customer has been suspended by KYC team for uploading documents from a RED country, assist them properly with account verification. Agent is free to notify them that the country is one of the restricted areas.',
    steps: [
      { step_number: 1, action: 'Identify user was suspended by KYC for RED country docs', note: '' },
      { step_number: 2, action: 'Assist with account verification process', note: '' },
      { step_number: 3, action: 'Explain documents indicated restricted region', note: 'Can say "restricted areas"' },
      { step_number: 4, action: 'Offer option to upload proof of different residence', note: 'Level 3 proof of address' }
    ],
    allowed_actions: ['Assist with verification', 'Explain restricted region status', 'Guide to Level 3 KYC'],
    disallowed_actions: ['Refuse to help', 'Refuse to speed up verification'],
    conditions: [
      {
        if: [{ field: 'suspended_by_kyc', operator: 'equals', value: true }, { field: 'documents_from_red_country', operator: 'equals', value: true }],
        then: 'Assist with verification, can notify about restricted areas',
        certainty: 'hard'
      }
    ],
    exceptions: [],
    examples_good: [
      'User suspended for UK passport → Agent explains "documents indicate restricted region", assists with verification'
    ],
    examples_bad: [
      'User asks for help with suspended account → Agent refuses to assist (WRONG)',
      'User wants faster verification → Agent refuses to speed up (WRONG)'
    ],
    tags: ['kyc_suspension', 'red_country_documents', 'verification', 'assistance'],
    severity_default: 'medium',
    evidence_requirements: 'Agent assisted with verification and explained restricted region status',
    verification_checks: [],
    source_location: { source_name: 'Countries, Restrictions and Their Process', page: 2, section: 'Customer has been suspended by the KYC team' }
  },

  // RULE 4: Living Elsewhere but RED Documents - Must Restrict First
  {
    subcategory: 'RED Flag Countries',
    title: 'RED Country Documents Despite Living Elsewhere - Must Restrict First',
    intent: 'Ensure agents restrict accounts when RED country documents are found, even if customer claims to live elsewhere.',
    rule_text: 'When a customer claims to be living in a non-restricted country BUT has documents proving they are from a RED country, the account MUST be restricted first with Suspendedlevel3, then assist with verification.',
    steps: [
      { step_number: 1, action: 'Identify RED country documents exist', note: '' },
      { step_number: 2, action: 'Tag Senior to restrict user FIRST', note: 'Even if claims to live elsewhere' },
      { step_number: 3, action: 'Senior sets Suspendedlevel3 role', note: '' },
      { step_number: 4, action: 'Then assist with verification to prove different residence', note: 'Level 3 proof of address' }
    ],
    allowed_actions: ['Restrict first', 'Then assist with verification'],
    disallowed_actions: ['Leave account open without restricting', 'Trust claim without restricting', 'Skip restriction step'],
    conditions: [
      {
        if: [{ field: 'has_red_country_documents', operator: 'equals', value: true }],
        then: 'Must restrict with Suspendedlevel3 first, then assist with verification',
        certainty: 'hard'
      }
    ],
    exceptions: [],
    examples_good: [
      'User has Australian ID but says lives in Japan → Agent restricts FIRST, then assists with proof of Japan residence'
    ],
    examples_bad: [
      'User has USA passport but claims living in Canada → Agent leaves account open without restricting (WRONG)'
    ],
    tags: ['red_documents', 'living_elsewhere', 'restrict_first', 'verification'],
    severity_default: 'critical',
    evidence_requirements: 'Agent restricted account first despite claim of living elsewhere',
    verification_checks: [
      { check_id: 'verify_restricted_first', description: 'Verify account was restricted before verification assistance', internal_tool_action: 'Check restriction timing', required_when: 'RED documents found' }
    ],
    source_location: { source_name: 'Countries, Restrictions and Their Process', page: 2, section: 'Customer claims living in non-restricted country but has documents from RED country' }
  },

  // ===========================================
  // ORANGE FLAG COUNTRY RULES
  // ===========================================

  // RULE 5: ORANGE Country - Do NOT Restrict
  {
    subcategory: 'ORANGE Flag Countries',
    title: 'ORANGE Country Mentioned - Do NOT Restrict Account',
    intent: 'Ensure agents do not restrict accounts for ORANGE flag countries.',
    rule_text: 'When a customer mentions they are from an ORANGE flag country, do NOT restrict the account. Do NOT mention they are from an ORANGE country. Advise them to check local laws and Terms of Service.',
    steps: [
      { step_number: 1, action: 'Identify ORANGE flag country mentioned', note: 'France, Germany, etc.' },
      { step_number: 2, action: 'Do NOT restrict the account', note: 'ORANGE ≠ RED' },
      { step_number: 3, action: 'Do NOT mention ORANGE flag to customer', note: '' },
      { step_number: 4, action: 'Advise to check local laws before using service', note: '' },
      { step_number: 5, action: 'Forward to Terms of Service', note: '' }
    ],
    allowed_actions: ['Advise on local laws', 'Forward to TOS', 'Continue assisting normally'],
    disallowed_actions: ['Restrict the account', 'Mention ORANGE flag', 'Treat as RED country'],
    conditions: [
      {
        if: [{ field: 'customer_country_mentioned', operator: 'in', value: ORANGE_FLAG_COUNTRIES }],
        then: 'Do NOT restrict. Advise local laws + TOS. Do NOT mention ORANGE.',
        certainty: 'hard'
      }
    ],
    exceptions: [],
    examples_good: [
      'User says "I am from France" → Agent advises to check local laws, forwards TOS, does NOT restrict'
    ],
    examples_bad: [
      'User mentions Germany → Agent restricts account (WRONG - not RED)',
      'Agent tells user "you are from an ORANGE country" (WRONG)'
    ],
    tags: ['orange_flag', 'no_restriction', 'local_laws', 'tos', ...ORANGE_FLAG_COUNTRIES.map(c => c.toLowerCase().replace(/\s+/g, '_'))],
    severity_default: 'high',
    evidence_requirements: 'Agent did not restrict ORANGE country account, did not mention ORANGE flag',
    verification_checks: [
      { check_id: 'verify_no_restriction', description: 'Verify account was NOT restricted', internal_tool_action: 'Check account restriction status', required_when: 'ORANGE country mentioned' }
    ],
    source_location: { source_name: 'Countries, Restrictions and Their Process', page: 2, section: 'The customer mentions they are from Orange country' }
  },

  // RULE 6: ORANGE Country - Cannot Login - Troubleshoot Steps
  {
    subcategory: 'ORANGE Flag Countries',
    title: 'ORANGE Country User Cannot Login - Troubleshooting Steps',
    intent: 'Ensure agents provide proper troubleshooting for ORANGE country users with access issues.',
    rule_text: 'When a user from an ORANGE country cannot log in or access their account, provide troubleshooting steps: 1) Try another IP, 2) Try Opera/Tenta browser, 3) Try mobile data, 4) Restart router. If nothing works AND user has funds, tag Senior for 30-minute whitelist role to withdraw.',
    steps: [
      { step_number: 1, action: 'Ask user to try another IP address', note: '' },
      { step_number: 2, action: 'Ask user to try Opera browser or Tenta Private browser', note: '' },
      { step_number: 3, action: 'Ask user to try mobile data', note: '' },
      { step_number: 4, action: 'Ask user to restart the router', note: '' },
      { step_number: 5, action: 'If nothing works AND has funds: Tag Senior for whitelist role (30 mins)', note: 'For withdrawal only' },
      { step_number: 6, action: 'Forward to state law and TOS, explain decision is on regulators', note: '' }
    ],
    allowed_actions: ['Troubleshoot access', 'Tag Senior for whitelist (if has funds)', 'Forward to TOS'],
    disallowed_actions: ['Restrict account', 'Mention ORANGE flag', 'Skip troubleshooting steps'],
    conditions: [
      {
        if: [{ field: 'customer_country', operator: 'in', value: ORANGE_FLAG_COUNTRIES }, { field: 'cannot_access', operator: 'equals', value: true }],
        then: 'Provide troubleshooting steps. If still blocked with funds, whitelist 30 mins.',
        certainty: 'hard'
      }
    ],
    exceptions: [],
    examples_good: [
      'User from France cannot login → Agent: Try different IP → Opera browser → mobile data → restart router → still blocked with $500 → Tag Senior for 30-min whitelist'
    ],
    examples_bad: [
      'User from Germany cannot access → Agent immediately restricts account (WRONG)',
      'User from Israel cannot login → Agent skips troubleshooting, just says "check local laws" (WRONG)'
    ],
    tags: ['orange_flag', 'cannot_login', 'troubleshoot', 'whitelist', 'opera_browser', 'vpn'],
    severity_default: 'high',
    evidence_requirements: 'Agent provided troubleshooting steps before whitelist consideration',
    verification_checks: [
      { check_id: 'verify_troubleshooting', description: 'Verify agent provided troubleshooting steps', internal_tool_action: 'Check agent messages for troubleshooting', required_when: 'ORANGE user cannot access' }
    ],
    source_location: { source_name: 'Countries, Restrictions and Their Process', page: 5, section: 'Process and handling tickets for ORANGE flag countries' }
  },

  // RULE 7: ORANGE Country - Whitelist Role Requirements
  {
    subcategory: 'ORANGE Flag Countries',
    title: 'ORANGE Country Whitelist - Only With Funds After Troubleshooting',
    intent: 'Ensure whitelist role is only used appropriately for ORANGE country users.',
    rule_text: 'Whitelist role for ORANGE country users should ONLY be set if: 1) All troubleshooting steps failed, 2) User has funds on balance. Tag Senior to set whitelist role for 30 minutes only - just for withdrawal.',
    steps: [
      { step_number: 1, action: 'Confirm all troubleshooting steps failed', note: 'IP, browser, mobile data, router' },
      { step_number: 2, action: 'Confirm user has funds on balance', note: '' },
      { step_number: 3, action: 'Tag Senior to set whitelist role', note: '' },
      { step_number: 4, action: 'Whitelist is for 30 minutes only', note: 'For withdrawal purpose' }
    ],
    allowed_actions: ['Tag Senior for whitelist after troubleshooting failed'],
    disallowed_actions: ['Set whitelist without troubleshooting', 'Set whitelist for user without funds', 'Set whitelist permanently'],
    conditions: [
      {
        if: [{ field: 'troubleshooting_failed', operator: 'equals', value: true }, { field: 'has_funds', operator: 'equals', value: true }],
        then: 'Tag Senior for 30-minute whitelist role',
        certainty: 'hard'
      }
    ],
    exceptions: [],
    examples_good: [
      'All troubleshooting failed, user has $200 → Tag Senior for 30-min whitelist to withdraw'
    ],
    examples_bad: [
      'User cannot login → Agent immediately requests whitelist without troubleshooting (WRONG)',
      'User has no funds → Agent requests whitelist (WRONG - no funds to withdraw)'
    ],
    tags: ['whitelist', 'orange_flag', 'withdrawal', 'senior_tag', '30_minutes'],
    severity_default: 'medium',
    evidence_requirements: 'Whitelist only requested after troubleshooting failed and user had funds',
    verification_checks: [
      { check_id: 'verify_whitelist_conditions', description: 'Verify troubleshooting done and funds exist before whitelist', internal_tool_action: 'Check ticket flow', required_when: 'Whitelist requested for ORANGE user' }
    ],
    source_location: { source_name: 'Countries, Restrictions and Their Process', page: 5, section: 'If none of this works, set whitelist role for 30 minutes' }
  },

  // ===========================================
  // YELLOW FLAG COUNTRY RULES
  // ===========================================

  // RULE 8: YELLOW Country - Do NOT Restrict or Confirm
  {
    subcategory: 'YELLOW Flag Countries',
    title: 'YELLOW Country - Do NOT Restrict or Confirm Status',
    intent: 'Ensure agents do not restrict YELLOW country accounts and do not confirm/deny country restriction status.',
    rule_text: 'When a customer mentions they are from a YELLOW flag country or asks if they can use services from that country, do NOT restrict the account, do NOT mention YELLOW flag, and do NOT confirm if the country is restricted. Forward to local laws and TOS.',
    steps: [
      { step_number: 1, action: 'Identify YELLOW flag country mentioned', note: 'Sweden' },
      { step_number: 2, action: 'Do NOT restrict the account', note: '' },
      { step_number: 3, action: 'Do NOT mention YELLOW flag or SOFT restriction', note: '' },
      { step_number: 4, action: 'Do NOT confirm if country is restricted', note: '' },
      { step_number: 5, action: 'Forward to local laws and Terms of Service', note: '' }
    ],
    allowed_actions: ['Advise on local laws', 'Forward to TOS'],
    disallowed_actions: ['Restrict account', 'Mention YELLOW/SOFT', 'Confirm if restricted', 'Say yes/no about availability'],
    conditions: [
      {
        if: [{ field: 'customer_country_mentioned', operator: 'in', value: YELLOW_FLAG_COUNTRIES }],
        then: 'Do NOT restrict. Do NOT confirm status. Forward to local laws + TOS.',
        certainty: 'hard'
      }
    ],
    exceptions: [],
    examples_good: [
      'User asks "Can I use Stake from Sweden?" → Agent: "Please check your local laws and our Terms of Service"'
    ],
    examples_bad: [
      'User from Sweden → Agent restricts account (WRONG)',
      'User asks about Sweden → Agent says "Sweden is YELLOW flag" (WRONG)',
      'User asks if Sweden is allowed → Agent says "Yes" or "No" (WRONG)'
    ],
    tags: ['yellow_flag', 'sweden', 'no_restriction', 'no_confirmation'],
    severity_default: 'medium',
    evidence_requirements: 'Agent did not restrict, did not mention YELLOW, did not confirm status',
    verification_checks: [],
    source_location: { source_name: 'Countries, Restrictions and Their Process', page: 3, section: 'Customer claims they are from Yellow country' }
  },

  // ===========================================
  // GREEN COUNTRY RULES
  // ===========================================

  // RULE 9: GREEN Country - Do NOT Confirm Yes/No
  {
    subcategory: 'GREEN Countries (Not Restricted)',
    title: 'GREEN Country - Never Confirm Yes/No Availability',
    intent: 'Ensure agents do not give yes/no confirmations about service availability even for non-restricted countries.',
    rule_text: 'When a customer asks if they can use services from a GREEN (non-restricted) country, do NOT confirm with Yes/No answer. Customer is obligated to check local laws themselves. Advise to check local laws and TOS, use "should" if necessary.',
    steps: [
      { step_number: 1, action: 'Customer asks about GREEN country availability', note: '' },
      { step_number: 2, action: 'Do NOT say Yes or No', note: '' },
      { step_number: 3, action: 'Advise to check local laws', note: '' },
      { step_number: 4, action: 'Forward to Terms of Service', note: '' },
      { step_number: 5, action: 'Use "should" if necessary', note: 'e.g., "you should be fine"' }
    ],
    allowed_actions: ['Advise on local laws', 'Forward to TOS', 'Use "should" wording'],
    disallowed_actions: ['Say "Yes, you can use"', 'Say "No, you cannot"', 'Confirm availability directly'],
    conditions: [
      {
        if: [{ field: 'asks_about_country_availability', operator: 'equals', value: true }],
        then: 'Do NOT confirm Yes/No. Advise local laws + TOS. Use "should" if needed.',
        certainty: 'hard'
      }
    ],
    exceptions: [],
    examples_good: [
      'User: "Can I use Stake from Japan?" → Agent: "Please check your local laws and our Terms of Service. You should be fine after reviewing."'
    ],
    examples_bad: [
      'User asks about Japan → Agent says "Yes, Japan is allowed" (WRONG - no Yes/No)',
      'User asks about country → Agent confirms availability directly (WRONG)'
    ],
    tags: ['green_country', 'no_confirmation', 'local_laws', 'tos', 'should_wording'],
    severity_default: 'medium',
    evidence_requirements: 'Agent did not confirm Yes/No, advised local laws and TOS',
    verification_checks: [],
    source_location: { source_name: 'Countries, Restrictions and Their Process', page: 3, section: 'Customer asks if allowed from Green country' }
  },

  // ===========================================
  // COMPLIANCE PROTOCOL RULES
  // ===========================================

  // RULE 10: Compliance Protocol - Do NOT Disclose ACP Role/Tag
  {
    subcategory: 'Compliance Jurisdiction Protocols',
    title: 'Compliance Protocol - Never Disclose ACP Role or Tag',
    intent: 'Ensure agents never disclose internal ACP roles or tags related to compliance jurisdiction protocols.',
    rule_text: 'When assisting users identified by Compliance Jurisdiction Protocols, do NOT disclose information about ACP roles (suspendedLevel3, Compliance - potentially [COUNTRY]) or tags (Prohibited Jurisdiction Protocol - Actioned). Refer user to the email they received.',
    steps: [
      { step_number: 1, action: 'Identify user has Compliance Protocol role/tag', note: '' },
      { step_number: 2, action: 'Assist with KYC upload as usual', note: 'Typically Level 3' },
      { step_number: 3, action: 'If they ask why: Do NOT disclose ACP info', note: '' },
      { step_number: 4, action: 'Refer them to email they received', note: '' },
      { step_number: 5, action: 'If persistent: Forward to complaints@stake.com', note: '' }
    ],
    allowed_actions: ['Assist with KYC', 'Refer to email', 'Forward to complaints@stake.com'],
    disallowed_actions: ['Disclose ACP role', 'Disclose ACP tag', 'Explain protocol details', 'Mention country code from role'],
    conditions: [
      {
        if: [{ field: 'has_compliance_protocol_tag', operator: 'equals', value: true }],
        then: 'Assist with KYC, do NOT disclose ACP info, refer to email',
        certainty: 'hard'
      }
    ],
    exceptions: [],
    examples_good: [
      'User asks why they need KYC Level 3 → Agent: "Please refer to the email you received at your registered email address"',
      'User keeps asking → Agent forwards to complaints@stake.com'
    ],
    examples_bad: [
      'User asks why restricted → Agent says "You have Compliance - potentially US tag" (WRONG)',
      'Agent mentions "Prohibited Jurisdiction Protocol" to user (WRONG)'
    ],
    tags: ['compliance_protocol', 'acp_role', 'acp_tag', 'do_not_disclose', 'refer_to_email', 'complaints'],
    severity_default: 'critical',
    evidence_requirements: 'Agent did not disclose ACP role/tag, referred to email or complaints@stake.com',
    verification_checks: [
      { check_id: 'verify_no_disclosure', description: 'Verify agent did not disclose ACP info', internal_tool_action: 'Check agent messages for ACP disclosure', required_when: 'Compliance Protocol user asks questions' }
    ],
    source_location: { source_name: 'Prohibited Jurisdiction Protocols for CS', page: 3, section: 'How to Handle Inquiries' }
  },

  // RULE 11: Compliance Protocol - Assist with KYC
  {
    subcategory: 'Compliance Jurisdiction Protocols',
    title: 'Compliance Protocol Users - Assist with KYC Upload',
    intent: 'Ensure agents assist compliance protocol users with their KYC verification.',
    rule_text: 'When a user identified by Compliance Jurisdiction Protocol contacts support, assist them as usual in uploading the required KYC documents (typically KYC Level 3). Do not refuse or delay assistance.',
    steps: [
      { step_number: 1, action: 'Identify user needs compliance KYC', note: 'Usually Level 3' },
      { step_number: 2, action: 'Assist with document upload as usual', note: '' },
      { step_number: 3, action: 'Guide through verification process', note: '' },
      { step_number: 4, action: 'Speed up if possible', note: 'Do not refuse to expedite' }
    ],
    allowed_actions: ['Assist with KYC', 'Guide through verification', 'Help expedite process'],
    disallowed_actions: ['Refuse to assist', 'Delay verification', 'Ignore user'],
    conditions: [
      {
        if: [{ field: 'has_compliance_protocol_tag', operator: 'equals', value: true }],
        then: 'Assist with KYC Level 3 upload as usual',
        certainty: 'hard'
      }
    ],
    exceptions: [],
    examples_good: [
      'Compliance Protocol user needs KYC → Agent assists with Level 3 document upload'
    ],
    examples_bad: [
      'User needs KYC for compliance → Agent refuses to help (WRONG)',
      'User wants faster verification → Agent refuses (WRONG)'
    ],
    tags: ['compliance_protocol', 'kyc_assistance', 'level_3', 'verification'],
    severity_default: 'high',
    evidence_requirements: 'Agent assisted user with KYC verification process',
    verification_checks: [],
    source_location: { source_name: 'Prohibited Jurisdiction Protocols for CS', page: 3, section: 'Assist the user, as usual' }
  },

  // RULE 12: Never Send ToS Restricted List Screenshot
  {
    subcategory: 'RED Flag Countries',
    title: 'Never Send ToS Restricted Jurisdictions Screenshot or List',
    intent: 'Ensure agents do not send screenshots or copy/paste the full restricted jurisdictions list.',
    rule_text: 'Agents must NEVER send a screenshot of the Terms of Service section listing restricted jurisdictions. Do NOT copy/paste the text with all restricted jurisdictions. Only forward the TOS link.',
    steps: [
      { step_number: 1, action: 'When discussing restrictions', note: '' },
      { step_number: 2, action: 'Forward TOS link only', note: '' },
      { step_number: 3, action: 'Do NOT screenshot restricted list', note: '' },
      { step_number: 4, action: 'Do NOT copy/paste country list', note: '' }
    ],
    allowed_actions: ['Send TOS link'],
    disallowed_actions: ['Send ToS screenshot', 'Copy/paste restricted list', 'List all restricted countries'],
    conditions: [
      {
        if: [{ field: 'discussing_restrictions', operator: 'equals', value: true }],
        then: 'Only forward TOS link, never screenshot or copy/paste list',
        certainty: 'hard'
      }
    ],
    exceptions: [],
    examples_good: [
      'User asks about restrictions → Agent sends TOS link only'
    ],
    examples_bad: [
      'Agent sends screenshot of ToS restricted jurisdictions section (WRONG)',
      'Agent copy/pastes: "Restricted: USA, UK, Australia, Brazil..." (WRONG)'
    ],
    tags: ['tos_screenshot', 'restricted_list', 'do_not_copy', 'do_not_screenshot'],
    severity_default: 'high',
    evidence_requirements: 'Agent only sent TOS link without screenshot or copy/paste',
    verification_checks: [
      { check_id: 'verify_no_screenshot', description: 'Verify agent did not send ToS screenshot', internal_tool_action: 'Check for attachments or quoted TOS text', required_when: 'Discussing restricted jurisdictions' }
    ],
    source_location: { source_name: 'Countries, Restrictions and Their Process', page: 5, section: 'DO NOT send a screenshot of this section of our ToS' }
  }
];

// ===========================================
// SEED FUNCTION
// ===========================================

async function seedProhibitedJurisdictions() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/clara';
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    // ========== STEP 1: Create/Update QACategory ==========
    console.log('\n📚 Creating/Updating QACategory...');

    let category;
    const existing = await QACategory.findOne({
      name: { $regex: new RegExp(`^${PROHIBITED_JURISDICTIONS_CATEGORY.name}$`, 'i') }
    });

    if (existing) {
      console.log('   Prohibited Jurisdictions category exists. Updating...');
      existing.description = PROHIBITED_JURISDICTIONS_CATEGORY.description;
      existing.knowledge = PROHIBITED_JURISDICTIONS_CATEGORY.knowledge;
      existing.keywords = PROHIBITED_JURISDICTIONS_CATEGORY.keywords;
      existing.evaluationCriteria = PROHIBITED_JURISDICTIONS_CATEGORY.evaluationCriteria;
      existing.subcategories = PROHIBITED_JURISDICTIONS_CATEGORY.subcategories;
      existing.isActive = true;
      await existing.save();
      category = existing;
      console.log('   ✅ Category UPDATED');
    } else {
      category = await QACategory.create({
        ...PROHIBITED_JURISDICTIONS_CATEGORY,
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
      const rule_id = Rule.generateRuleId(PROHIBITED_JURISDICTIONS_CATEGORY.name, ruleData.title);

      const rule = await Rule.create({
        rule_id,
        category: category._id,
        category_name: PROHIBITED_JURISDICTIONS_CATEGORY.name,
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

    console.log('\n📍 Country Classifications:');
    console.log(`   RED Flag: ${RED_FLAG_COUNTRIES.length} countries`);
    console.log(`   ORANGE Flag: ${ORANGE_FLAG_COUNTRIES.length} countries`);
    console.log(`   YELLOW Flag: ${YELLOW_FLAG_COUNTRIES.length} countries`);

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
  seedProhibitedJurisdictions();
}

module.exports = {
  seedProhibitedJurisdictions,
  PROHIBITED_JURISDICTIONS_CATEGORY,
  RULES,
  RED_FLAG_COUNTRIES,
  ORANGE_FLAG_COUNTRIES,
  YELLOW_FLAG_COUNTRIES
};
