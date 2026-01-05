/**
 * Script: Add Affiliate Program Knowledge Base
 *
 * Dodaje knowledge za Affiliate Program u MongoDB:
 * - QACategory sa subcategories
 * - Rules za svaki workflow/proceduru
 * - Generiše embeddings za svaki rule
 *
 * Usage: node scripts/addAffiliateKnowledge.js
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const QACategory = require('../models/QACategory');
const Rule = require('../models/Rule');
const { createRuleChunk } = require('../services/embeddingsService');

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
  name: 'Affiliate Program',
  description: 'Knowledge base for handling affiliate program inquiries, commission conversion, referral methods, and affiliate-related tickets.',
  knowledge: `The Stake Affiliate Program enables individuals to earn commissions based on bets placed by the new players they refer, allowing them to grow their community while generating income.

Key concepts:
- Affiliate Link: Unique URL that all users can share (e.g., stake.us/?ref=USERNAME)
- Affiliate Code (Welcome Offer Code): Only official affiliates receive codes for promotional activities
- Commission Types: Wager Share (10% ordinary / 25% official), Revenue Share (10-50%), CPA
- Commission is received in the same currency their referrals played in

Important distinctions:
- Non-official affiliates: Regular users with 10% wager share commission (5% for Stake.us)
- Official affiliates: Have contracts with Stake, can receive 25%+ commission, may have Revenue Share or CPA deals`,
  keywords: [
    'affiliate', 'referral', 'commission', 'wager share', 'revenue share', 'CPA',
    'affiliate link', 'affiliate code', 'welcome offer', 'partner', 'affiliate manager',
    'campaign', 'referral code', 'unlink affiliate', 'commission conversion'
  ],
  evaluationCriteria: `When evaluating affiliate-related tickets, check:
1. Agent correctly identifies affiliate type (official vs non-official)
2. Agent provides correct procedures based on affiliate type
3. Agent does NOT share affiliate manager contact info directly
4. Agent follows $50 minimum rule for commission conversion
5. Agent correctly escalates INR commission to #ind-affiliate
6. Agent directs official affiliates to their affiliate manager for Revenue Share/CPA questions
7. Agent does NOT promise commission conversion for affiliates who can withdraw fiat normally`,
  subcategories: [
    {
      name: 'Referral Methods',
      description: 'How users can refer others to Stake using affiliate links or codes',
      knowledge: `Two methods to refer new users:

AFFILIATE LINK:
- All users can share their affiliate link
- Format: stake.us/?ref=USERNAME
- New user must NOT refresh page, click another page, or open another tab during registration
- Only works during initial sign-up
- User must leave "Welcome Offer" field blank

AFFILIATE CODE (Welcome Offer):
- Only official affiliates receive codes
- Can be entered during sign-up OR within 24 hours after account creation
- User must verify account AND email within 72 hours
- If code entered after link registration, code takes precedence

COMMON FAILURE REASONS:
- Same IP address as referrer
- Page refresh during registration
- Using a code while registering via link
- Pre-existing account`,
      keywords: ['affiliate link', 'affiliate code', 'referral link', 'referral code', 'welcome offer', 'registration'],
      evaluationCriteria: 'Check agent explains the difference between link and code, mentions 24h window for codes, and explains verification requirements.'
    },
    {
      name: 'Commission Types',
      description: 'Different types of affiliate commissions and how they work',
      knowledge: `WAGER SHARE:
- Ordinary users (non-official): 10% commission (5% for Stake.us)
- Official affiliates: 25% commission (or 10% if ToS breached)
- Formula Casino: (Edge as decimal * wagered / 2) * commission rate
- Formula Sportsbook: (0.03 * wagered / 2) * commission rate
- Formula Poker: Rake * commission rate

REVENUE SHARE:
- Only official affiliates
- 10-50% of referral's losses
- Shows as 0% on ACP (CS doesn't have access to details)

CPA (Cost Per Acquisition):
- Only official affiliates
- One-time payment when referrals meet specific conditions
- Shows as 0% on ACP

Commission is received in the SAME CURRENCY that referrals played in.
Check commission type via Affiliate > Campaigns in ACP.`,
      keywords: ['wager share', 'revenue share', 'CPA', 'commission rate', 'house edge', 'rake'],
      evaluationCriteria: 'Agent should NOT provide specific details about Revenue Share or CPA - direct to affiliate manager.'
    },
    {
      name: 'Commission Conversion',
      description: 'Process for converting affiliate commission from fiat to crypto',
      knowledge: `WHEN TO CONVERT:
- When affiliate received commission in FIAT but doesn't use FIAT currencies
- Do NOT convert if affiliate CAN withdraw the fiat normally

CRITICAL RULES:
- $50 MINIMUM per currency required for conversion
- If less than $50 in a currency, explain and ask to return when minimum is met
- Example: $30 CAD (don't convert) + $60 INR (convert INR, ask to return for CAD)
- TIP: Suggest users move funds to vault until they reach minimum

INDIAN AFFILIATES (INR):
- Do NOT convert INR commission
- Escalate to #ind-affiliate channel for review
- Even if affiliate asks to exchange INR to crypto, forward to #ind-affiliate first

PROCESS BY AFFILIATE TYPE:
1. Non-official (5% Stake.us): Tag specialist/supervisor/senior to convert
2. Non-official (10%) with LESS than 50 referrals: Tag specialist/supervisor/senior
3. Non-official (10%) with MORE than 50 referrals: Forward to partners@stake.com
4. Official affiliates (0/25/30%): Tag specialist/supervisor/senior to convert

IMPORTANT CLARIFICATION for partners@stake.com group:
- The $50 minimum rule does NOT apply to users forwarded to partners@stake.com
- Forward them directly without requiring $50 minimum

TERMINOLOGY:
- Avoid using "exchange" - we are NOT exchanging, we are converting`,
      keywords: ['commission conversion', 'fiat to crypto', 'INR', 'ind-affiliate', '$50 minimum', 'partners@stake.com'],
      evaluationCriteria: 'Check: 1) $50 minimum enforced, 2) INR escalated to #ind-affiliate, 3) 10%+50 referrals forwarded to partners@stake.com, 4) Correct escalation path used'
    },
    {
      name: 'Content Creator Benefits',
      description: 'Special benefits for content creators with official affiliate contracts',
      knowledge: `Content creators with official affiliate contracts can receive extra funds from Acquisition team.
Users receiving AB/AS fills are tagged with "affiliate" tag.

BENEFIT TYPES:

AB Fill (Affiliate Bonus) - WITHDRAWABLE:
- Play funds with rollover
- Winnings are withdrawable
- Affiliates can freely create content and claim winnings

AS Fill (Affiliate Special) - NON-WITHDRAWABLE:
- Non-withdrawable play funds for content creation
- Account must be FROZEN to receive AS Fills

AB Fill with % Withdrawal - WITHDRAWABLE:
- Account set to FROZEN
- Winnings are restricted and deducted
- Transferred to separate affiliate account
- Requires TWO separate accounts:
  1. Wager Account: Receives AB Fills, winnings deducted with note "AB Removed"
  2. Affiliate Account: Non-restricted, receives transferred funds

MAX CAP:
- May have limits per stream/week/month

LEVEL-UP BONUSES:
- Users receiving these benefits may NOT be eligible for level-up bonuses
- EXCEPTION: Rakeback is still eligible
- Refer to level-up bonus procedure when they request

For irregular cases beyond standard benefits, forward to affiliate manager.`,
      keywords: ['AB fill', 'AS fill', 'affiliate bonus', 'content creator', 'frozen account', 'withdrawable'],
      evaluationCriteria: 'Check agent understands difference between AB and AS fills, knows about frozen account requirement for AS, and directs irregular cases to affiliate manager.'
    },
    {
      name: 'Affiliate Requests',
      description: 'Handling requests to become affiliate, unlink affiliate, or promotion eligibility',
      knowledge: `BECOME OFFICIAL AFFILIATE:
- Direct to https://stake.com/affiliate/contact
- Affiliate team reviews if criteria are met

UNLINK AFFILIATE:
- General users: Cannot unlink for any reason
- If persistent: Direct to partners@stake.com
- VIP users: Contact their VIP host
- After unlink by affiliate team: Info may still show on ACP (marked as "deleted")
- If user claims unlink done but we see it: Advise to contact affiliate team

PROMOTION ELIGIBILITY:
- Official affiliates: Contact affiliate manager (we cannot determine eligibility)
- Non-official affiliates: They ARE eligible for promotions like $75 Weekly Raffle
- Note: Stake partners and employees are generally NOT eligible per T&C`,
      keywords: ['become affiliate', 'official affiliate', 'unlink', 'promotion eligibility', 'raffle'],
      evaluationCriteria: 'Check agent does not promise unlink, correctly identifies eligibility by affiliate type, and directs to correct channels.'
    },
    {
      name: 'Affiliate Manager Contact',
      description: 'How to handle requests to contact affiliate managers',
      knowledge: `RESPONSE TIME:
- Affiliate team should reply within 72 BUSINESS HOURS
- Applies even to cancelled partnership affiliates

IF AFFILIATE MANAGER HASN'T REPLIED:
1. Check when message was sent
2. If <72 business hours: Advise to wait
3. If >72 business hours: Contact affiliate manager via appropriate channel

AFFILIATE CHANNELS BY MARKET:
- esp-affiliate: Spanish market
- jp-affiliate: Japanese market
- br-affiliate: Brazilian market
- ind-affiliate: Indian market
- Affiliatesupport: English and all other markets

REQUEST FOR MANAGER CONTACT INFO:
- We CANNOT share affiliate manager's Skype/Telegram/contact info
- Advise to contact partners@stake.com

MANAGER ON HOLIDAY:
- Contact affiliate team through appropriate market channel
- Use Affiliate Channel List above`,
      keywords: ['affiliate manager', '72 hours', 'esp-affiliate', 'jp-affiliate', 'br-affiliate', 'ind-affiliate', 'Affiliatesupport'],
      evaluationCriteria: 'Agent must NOT share affiliate manager contact info. Check correct channel used based on market.'
    }
  ]
};

// ============================================================================
// RULES DATA - Each rule is one clear workflow/procedure
// ============================================================================

const RULES_DATA = [
  // ----- Referral Methods Rules -----
  {
    subcategory: 'Referral Methods',
    title: 'Affiliate Link Usage Requirements',
    intent: 'Ensure agents correctly explain how affiliate links work and common failure reasons.',
    rule_text: `When a user asks about affiliate links:
1. Explain the link is found at My Account > Affiliate > Overview (or Campaigns)
2. New users must NOT refresh, click other pages, or open other tabs during registration
3. Welcome Offer field must be left BLANK
4. Link only works during initial sign-up - cannot be applied after account exists
5. If same IP as referrer, referral will NOT count`,
    steps: [
      { step_number: 1, action: 'Direct user to My Account > Affiliate > Overview or Campaigns' },
      { step_number: 2, action: 'Explain they must share link with NEW users' },
      { step_number: 3, action: 'Warn: Do not refresh page or navigate during registration' },
      { step_number: 4, action: 'Warn: Leave Welcome Offer field blank' },
      { step_number: 5, action: 'Warn: Different IP required from referrer' }
    ],
    allowed_actions: ['Explain link location', 'Explain requirements', 'Explain failure reasons'],
    disallowed_actions: ['Promise to manually link accounts', 'Bypass IP restriction'],
    tags: ['affiliate_link', 'referral', 'registration', 'ip_address'],
    severity_default: 'medium',
    evidence_requirements: 'Agent explains at least 2 key requirements for affiliate link usage',
    verification_checks: [
      { check_id: 'LINK_EXPLAINED', description: 'Agent explained where to find link', required_when: 'User asks about affiliate link' },
      { check_id: 'REQUIREMENTS_STATED', description: 'Agent mentioned at least one key requirement', required_when: 'User asks how to refer someone' }
    ],
    examples_good: [
      'You can find your affiliate link at My Account > Affiliate > Overview. Make sure the person you refer does not refresh the page during registration and leaves the Welcome Offer field blank.',
      'The affiliate link must be used during initial registration. Please note that the referral won\'t count if you share the same IP address.'
    ],
    examples_bad: [
      'Just share your link and they will be registered.',
      'I can manually link this account to your referral.'
    ],
    source_location: { source_name: 'CS-Affiliate Program-050126-025406.pdf', page: 1, section: '1-1. Two ways to refer new users' }
  },
  {
    subcategory: 'Referral Methods',
    title: 'Affiliate Code (Welcome Offer) Application',
    intent: 'Ensure agents correctly explain the 24-hour window and verification requirements for affiliate codes.',
    rule_text: `Affiliate codes can only be applied within 24 hours of account creation:
1. Code can be entered during sign-up OR via Settings > Offers within 24h
2. User MUST verify account and email within 72 hours for code to be valid
3. If code entered while registered via link, CODE takes precedence over link
4. Only ONE code can be used per account
5. After 24 hours, user loses ability to be affiliated`,
    steps: [
      { step_number: 1, action: 'Check if account is within 24 hours of creation' },
      { step_number: 2, action: 'If yes: Direct to Settings > Offers to enter code' },
      { step_number: 3, action: 'If no: Explain 24h window has passed, cannot be affiliated' },
      { step_number: 4, action: 'Remind user to verify account AND email within 72h' }
    ],
    allowed_actions: ['Explain 24h window', 'Direct to Settings > Offers', 'Explain verification requirements'],
    disallowed_actions: ['Apply code after 24h window', 'Promise manual affiliation'],
    conditions: [
      {
        if: [{ field: 'account_age_hours', operator: 'in', value: [0, 24] }],
        then: 'User can still apply affiliate code via Settings > Offers',
        certainty: 'hard'
      },
      {
        if: [{ field: 'account_age_hours', operator: 'not_in', value: [0, 24] }],
        then: 'User cannot apply affiliate code - 24h window has passed',
        certainty: 'hard'
      }
    ],
    tags: ['affiliate_code', 'welcome_offer', '24_hours', 'verification', 'registration'],
    severity_default: 'high',
    evidence_requirements: 'Agent correctly identifies if user is within 24h window and provides appropriate guidance',
    verification_checks: [
      { check_id: 'CHECK_24H', description: 'Agent checked or asked about account age', required_when: 'User wants to apply affiliate code' }
    ],
    examples_good: [
      'Affiliate codes can only be applied within the first 24 hours after account creation. Please go to Settings > Offers to enter the code, and make sure to verify your account and email within 72 hours.',
      'Unfortunately, since your account is older than 24 hours, the affiliate code can no longer be applied.'
    ],
    examples_bad: [
      'Let me apply this code for you.',
      'You can enter the code anytime.'
    ],
    source_location: { source_name: 'CS-Affiliate Program-050126-025406.pdf', page: 1, section: '1-1. Two ways to refer new users' }
  },
  {
    subcategory: 'Referral Methods',
    title: 'Affiliate Link vs Code Priority',
    intent: 'Clarify that affiliate codes take precedence over affiliate links.',
    rule_text: `Important precedence rule:
- If user registered via affiliate LINK but then enters an affiliate CODE, the CODE takes precedence
- The original link affiliation is overwritten
- Users CANNOT combine both - one or the other
- Agent must warn users that entering a code will override link affiliation`,
    allowed_actions: ['Explain precedence rule', 'Warn about override'],
    disallowed_actions: ['Promise both affiliations will count'],
    tags: ['affiliate_link', 'affiliate_code', 'priority', 'precedence'],
    severity_default: 'medium',
    examples_good: [
      'Please note that if you enter an affiliate code, it will override the affiliate link you registered with.',
      'You cannot use both - the affiliate code takes precedence over the link.'
    ],
    examples_bad: [
      'Both will be counted for your referrer.',
      'The link and code work together.'
    ],
    source_location: { source_name: 'Affiliate link VS Affiliate code - Nikola Stanojevic', section: 'Summary' }
  },

  // ----- Commission Types Rules -----
  {
    subcategory: 'Commission Types',
    title: 'Wager Share Commission Rates',
    intent: 'Ensure agents correctly communicate wager share rates and calculation methods.',
    rule_text: `Wager Share commission rates:
- Non-official affiliates (ordinary users): 10% (or 5% for Stake.us)
- Official affiliates: 25% standard (10% if ToS/contract breached)
- Commission received in SAME currency referrals played in

Calculation formulas:
- Casino: (Edge as decimal * wagered / 2) * commission rate
- Sportsbook: (0.03 * wagered / 2) * commission rate
- Poker: Rake * commission rate

To check commission type: Affiliate > Campaigns in ACP`,
    allowed_actions: ['Explain commission rates', 'Explain formulas', 'Direct to ACP to check type'],
    disallowed_actions: ['Promise commission rate changes', 'Modify commission rates'],
    tags: ['wager_share', 'commission', 'commission_rate', 'calculation'],
    severity_default: 'medium',
    evidence_requirements: 'Agent provides correct commission rate based on affiliate type',
    source_location: { source_name: 'CS-Affiliate Program-050126-025406.pdf', page: 2, section: '3. Affiliate commission' }
  },
  {
    subcategory: 'Commission Types',
    title: 'Revenue Share and CPA - Redirect to Affiliate Manager',
    intent: 'Ensure agents do NOT provide Revenue Share or CPA details and redirect to affiliate manager.',
    rule_text: `CS does NOT have information about Revenue Share or CPA commissions:
- Revenue Share: 10-50% of referral losses (official affiliates only)
- CPA: One-time payment when conditions met (official affiliates only)
- Both show as 0% commission on ACP

ACTION: When official affiliate asks about Revenue Share or CPA:
- Do NOT attempt to explain specific rates or conditions
- Advise them to contact their affiliate manager`,
    steps: [
      { step_number: 1, action: 'Identify if user is asking about Revenue Share or CPA' },
      { step_number: 2, action: 'Confirm CS does not have this information' },
      { step_number: 3, action: 'Direct user to contact their affiliate manager' }
    ],
    allowed_actions: ['Confirm we don\'t have details', 'Direct to affiliate manager'],
    disallowed_actions: ['Provide Revenue Share percentages', 'Explain CPA conditions', 'Promise specific rates'],
    tags: ['revenue_share', 'CPA', 'official_affiliate', 'affiliate_manager', 'escalation'],
    severity_default: 'high',
    evidence_requirements: 'Agent redirects to affiliate manager without providing RS/CPA details',
    examples_good: [
      'We don\'t have information about Revenue Share or CPA details on the customer support end. Please contact your affiliate manager for this information.'
    ],
    examples_bad: [
      'Your Revenue Share is 30% of losses.',
      'CPA pays $100 per signup.'
    ],
    source_location: { source_name: 'CS-Affiliate Program-050126-025406.pdf', page: 4, section: '3-3. Official affiliates ask for their revenue share or CPA' }
  },

  // ----- Commission Conversion Rules -----
  {
    subcategory: 'Commission Conversion',
    title: 'Commission Conversion $50 Minimum Rule',
    intent: 'Enforce the $50 minimum per currency requirement for commission conversion.',
    rule_text: `CRITICAL: $50 MINIMUM per currency is required for commission conversion.

If affiliate has less than $50 in a currency:
1. Explain the $50 minimum requirement
2. Ask them to return once they reach the minimum
3. Suggest moving funds to vault until minimum is reached

Example: User has $30 CAD and $60 INR
- Convert INR ($60 > $50)
- Do NOT convert CAD ($30 < $50)
- Ask user to return for CAD when they have $50+

EXCEPTION: The $50 rule does NOT apply to users forwarded to partners@stake.com (10% commission with 50+ referrals)`,
    conditions: [
      {
        if: [{ field: 'commission_amount_per_currency', operator: 'in', value: ['<50'] }],
        then: 'Do NOT convert. Explain $50 minimum and ask to return when met.',
        certainty: 'hard'
      },
      {
        if: [
          { field: 'commission_rate', operator: 'equals', value: '10%' },
          { field: 'referral_count', operator: 'in', value: ['>50'] }
        ],
        then: 'Forward to partners@stake.com - $50 rule does NOT apply',
        certainty: 'hard'
      }
    ],
    allowed_actions: ['Explain $50 minimum', 'Convert currencies meeting minimum', 'Suggest vault'],
    disallowed_actions: ['Convert amounts under $50', 'Waive minimum for regular affiliates'],
    tags: ['commission_conversion', 'fiat_to_crypto', '$50_minimum', 'conversion_rules'],
    severity_default: 'high',
    evidence_requirements: 'Agent enforces $50 minimum OR correctly identifies exception case',
    verification_checks: [
      { check_id: 'CHECK_AMOUNT', description: 'Agent verified amount per currency', required_when: 'Commission conversion requested' },
      { check_id: 'MINIMUM_ENFORCED', description: 'Agent enforced or explained $50 minimum', required_when: 'Amount is under $50' }
    ],
    examples_good: [
      'Conversion requires a minimum of $50 per currency. Your CAD balance is $30, so we cannot convert it yet. Please come back once you have $50 or more in CAD. In the meantime, you may want to move these funds to your vault.',
      'I can convert your INR commission ($60), but your CAD ($30) doesn\'t meet the $50 minimum yet.'
    ],
    examples_bad: [
      'Sure, I\'ll convert all your commissions.',
      'Let me convert your $30 CAD for you.'
    ],
    source_location: { source_name: 'CS-Affiliate Program-050126-025406.pdf', page: 4, section: '4. Commission conversion request' }
  },
  {
    subcategory: 'Commission Conversion',
    title: 'INR Commission - Escalate to ind-affiliate',
    intent: 'Ensure INR commission requests are ALWAYS escalated to #ind-affiliate channel.',
    rule_text: `CRITICAL: For Indian affiliates or INR commission conversion:
- Do NOT convert INR to crypto
- ALWAYS escalate to #ind-affiliate channel for review
- This applies even if affiliate specifically asks for INR to crypto conversion

This is an absolute rule with no exceptions for CS agents.`,
    conditions: [
      {
        if: [{ field: 'currency', operator: 'equals', value: 'INR' }],
        then: 'Escalate to #ind-affiliate channel. Do NOT convert.',
        certainty: 'hard'
      },
      {
        if: [{ field: 'affiliate_market', operator: 'equals', value: 'India' }],
        then: 'Escalate to #ind-affiliate channel for any commission conversion.',
        certainty: 'hard'
      }
    ],
    allowed_actions: ['Escalate to #ind-affiliate', 'Explain escalation is needed'],
    disallowed_actions: ['Convert INR directly', 'Process INR conversion without escalation'],
    tags: ['INR', 'ind-affiliate', 'India', 'commission_conversion', 'escalation', 'critical'],
    severity_default: 'critical',
    evidence_requirements: 'Agent escalates INR requests to #ind-affiliate without attempting conversion',
    verification_checks: [
      { check_id: 'INR_ESCALATED', description: 'Agent escalated INR conversion to #ind-affiliate', required_when: 'INR conversion requested' }
    ],
    examples_good: [
      'For INR commission conversion, I need to escalate this to our affiliate team for review. They will handle this request.',
      'I\'ll forward your INR conversion request to the appropriate channel for processing.'
    ],
    examples_bad: [
      'Sure, let me convert your INR to BTC.',
      'I\'ll tag a senior to convert your INR.'
    ],
    source_location: { source_name: 'Affiliate commission conversion UPDATE', section: 'INR preferred currency' }
  },
  {
    subcategory: 'Commission Conversion',
    title: 'Commission Conversion by Affiliate Type',
    intent: 'Route commission conversion requests to correct channel based on affiliate type and referral count.',
    rule_text: `Commission conversion routing:

NON-OFFICIAL AFFILIATES:
1. 5% (Stake.us): Tag specialist/supervisor/senior to convert
2. 10% with LESS than 50 referrals: Tag specialist/supervisor/senior to convert
3. 10% with MORE than 50 referrals: Forward to partners@stake.com

OFFICIAL AFFILIATES (0/25/30%):
- Tag specialist/supervisor/senior to convert

IMPORTANT:
- Do NOT convert if affiliate can withdraw fiat normally
- Avoid using "exchange" - use "convert"
- For affiliates forwarded to partners@stake.com, $50 minimum does NOT apply`,
    steps: [
      { step_number: 1, action: 'Check commission rate in ACP (Affiliate > Campaigns)' },
      { step_number: 2, action: 'Check referral count if 10% commission' },
      { step_number: 3, action: 'Verify affiliate cannot withdraw fiat normally' },
      { step_number: 4, action: 'Route to appropriate channel based on type' }
    ],
    conditions: [
      {
        if: [
          { field: 'commission_rate', operator: 'equals', value: '10%' },
          { field: 'referral_count', operator: 'in', value: ['>50'] }
        ],
        then: 'Forward to partners@stake.com',
        certainty: 'hard'
      },
      {
        if: [{ field: 'can_withdraw_fiat', operator: 'equals', value: true }],
        then: 'Do NOT convert - advise to withdraw normally',
        certainty: 'hard'
      }
    ],
    allowed_actions: ['Tag specialist/supervisor/senior', 'Forward to partners@stake.com', 'Advise normal withdrawal'],
    disallowed_actions: ['Convert for affiliates who can withdraw fiat', 'Use term "exchange"'],
    tags: ['commission_conversion', 'routing', 'partners@stake.com', 'specialist', 'escalation'],
    severity_default: 'high',
    evidence_requirements: 'Agent routes to correct channel based on affiliate type',
    source_location: { source_name: 'CS-Affiliate Program-050126-025406.pdf', page: 4, section: '4. Commission conversion request' }
  },
  {
    subcategory: 'Commission Conversion',
    title: 'Do Not Convert If Fiat Withdrawal Available',
    intent: 'Prevent unnecessary conversions when affiliate can withdraw fiat normally.',
    rule_text: `Before converting commission:
1. Verify affiliate CANNOT withdraw the fiat currency
2. If they CAN withdraw fiat normally, do NOT convert
3. Only convert when there is a legitimate reason they cannot use fiat

For affiliates asking to convert preferred fiat currency to crypto without valid reason:
- Forward to designated channel for review
- INR → #ind-affiliate channel`,
    conditions: [
      {
        if: [{ field: 'can_withdraw_fiat', operator: 'equals', value: true }],
        then: 'Do NOT convert. Advise to withdraw fiat normally.',
        certainty: 'hard'
      }
    ],
    allowed_actions: ['Verify withdrawal capability', 'Advise normal withdrawal', 'Forward suspicious requests'],
    disallowed_actions: ['Convert when fiat withdrawal is available'],
    tags: ['commission_conversion', 'fiat_withdrawal', 'verification'],
    severity_default: 'medium',
    evidence_requirements: 'Agent verifies fiat withdrawal capability before converting',
    source_location: { source_name: 'Affiliate commission conversion UPDATE', section: 'Commission conversion from preferred fiat currency to crypto' }
  },

  // ----- Content Creator Benefits Rules -----
  {
    subcategory: 'Content Creator Benefits',
    title: 'AB Fill vs AS Fill Benefits',
    intent: 'Ensure agents understand the difference between AB and AS fills for content creators.',
    rule_text: `Content creator benefits (official affiliates only):

AB FILL (Affiliate Bonus) - WITHDRAWABLE:
- Play funds with rollover requirement
- Winnings ARE withdrawable
- Account does NOT need to be frozen

AS FILL (Affiliate Special) - NON-WITHDRAWABLE:
- Play funds for content creation only
- Winnings are NOT withdrawable
- Account MUST be FROZEN to receive AS Fills

AB FILL WITH % WITHDRAWAL:
- Account must be FROZEN
- Requires TWO accounts:
  1. Wager Account: Receives AB Fills
  2. Affiliate Account: Receives transferred winnings
- Winnings deducted with note "AB Removed"

Users with these benefits may NOT be eligible for level-up bonuses (except Rakeback).`,
    allowed_actions: ['Explain benefit types', 'Confirm frozen account requirement', 'Direct irregular cases to affiliate manager'],
    disallowed_actions: ['Process benefit requests without proper setup', 'Promise level-up bonuses to AB/AS recipients'],
    tags: ['AB_fill', 'AS_fill', 'content_creator', 'affiliate_bonus', 'frozen_account'],
    severity_default: 'medium',
    examples_good: [
      'AS Fills require your account to be frozen. The funds are non-withdrawable and meant for content creation.',
      'With AB Fill % withdrawal, your winnings will be transferred to your separate Affiliate Account after deduction.'
    ],
    source_location: { source_name: 'CS-Affiliate Program-050126-025406.pdf', page: 5, section: '5. Content creator benefits' }
  },
  {
    subcategory: 'Content Creator Benefits',
    title: 'Level-Up Bonus Eligibility for AB/AS Recipients',
    intent: 'Clarify that AB/AS recipients are generally not eligible for level-up bonuses except Rakeback.',
    rule_text: `Users receiving AB/AS fills:
- Generally NOT eligible for level-up bonuses
- EXCEPTION: Rakeback is still eligible
- When these users request level-up bonuses, refer to the level-up bonus procedure`,
    conditions: [
      {
        if: [{ field: 'has_affiliate_tag', operator: 'equals', value: true }],
        then: 'User may not be eligible for level-up bonuses. Check procedure.',
        certainty: 'soft'
      }
    ],
    tags: ['AB_fill', 'AS_fill', 'level_up_bonus', 'rakeback', 'eligibility'],
    severity_default: 'medium',
    source_location: { source_name: 'CS-Affiliate Program-050126-025406.pdf', page: 5, section: '5. Content creator benefits' }
  },

  // ----- Affiliate Requests Rules -----
  {
    subcategory: 'Affiliate Requests',
    title: 'Request to Become Official Affiliate',
    intent: 'Direct users to the correct application page for official affiliate status.',
    rule_text: `When user wants to become an official affiliate:
1. Direct them to https://stake.com/affiliate/contact
2. They submit information there
3. Affiliate team reviews if criteria are met

CS does NOT:
- Process affiliate applications
- Know the specific criteria
- Guarantee approval`,
    steps: [
      { step_number: 1, action: 'Direct user to https://stake.com/affiliate/contact' },
      { step_number: 2, action: 'Explain they need to submit required information' },
      { step_number: 3, action: 'Explain affiliate team will review their application' }
    ],
    allowed_actions: ['Provide application URL', 'Explain review process'],
    disallowed_actions: ['Process applications', 'Guarantee approval', 'Share specific criteria'],
    tags: ['official_affiliate', 'application', 'become_affiliate'],
    severity_default: 'low',
    examples_good: [
      'To apply for official affiliate status, please visit https://stake.com/affiliate/contact and submit your information. The affiliate team will review your application.'
    ],
    source_location: { source_name: 'CS-Affiliate Program-050126-025406.pdf', page: 6, section: '6. Request to become an official Affiliate' }
  },
  {
    subcategory: 'Affiliate Requests',
    title: 'Request to Unlink Affiliate',
    intent: 'Handle unlink requests properly by affiliate type.',
    rule_text: `UNLINK AFFILIATE REQUEST:

GENERAL USERS:
- We CANNOT unlink affiliate for any reason
- If persistent: Direct to partners@stake.com

VIP USERS:
- Advise to contact their VIP host

AFTER UNLINK BY AFFILIATE TEAM:
- Affiliate info may still show on ACP (marked as "deleted")
- If user claims unlink was done but we still see it: Advise to contact affiliate team`,
    conditions: [
      {
        if: [{ field: 'is_vip', operator: 'equals', value: true }],
        then: 'Direct to VIP host for unlink request',
        certainty: 'hard'
      },
      {
        if: [{ field: 'is_vip', operator: 'equals', value: false }],
        then: 'We cannot unlink. If persistent, direct to partners@stake.com',
        certainty: 'hard'
      }
    ],
    allowed_actions: ['Explain we cannot unlink', 'Direct VIP to VIP host', 'Direct persistent users to partners@stake.com'],
    disallowed_actions: ['Unlink affiliates', 'Promise unlink'],
    tags: ['unlink_affiliate', 'partners@stake.com', 'VIP_host'],
    severity_default: 'medium',
    evidence_requirements: 'Agent does not promise or attempt to unlink affiliate',
    examples_good: [
      'We cannot unlink the affiliate from your account. If you wish to pursue this further, please contact partners@stake.com.',
      'As a VIP user, please contact your VIP host regarding this request.'
    ],
    examples_bad: [
      'Let me unlink that for you.',
      'I\'ll submit a request to remove the affiliate.'
    ],
    source_location: { source_name: 'CS-Affiliate Program-050126-025406.pdf', page: 6, section: '7. Request to Unlink the Registered Affiliate' }
  },
  {
    subcategory: 'Affiliate Requests',
    title: 'Affiliate Promotion Eligibility',
    intent: 'Correctly identify promotion eligibility based on affiliate type.',
    rule_text: `PROMOTION ELIGIBILITY:

OFFICIAL AFFILIATES:
- We CANNOT determine eligibility
- Advise to contact their affiliate manager
- Per T&C, Stake partners/employees generally not eligible

NON-OFFICIAL AFFILIATES:
- They ARE eligible for promotions (e.g., $75 Weekly Raffle)`,
    conditions: [
      {
        if: [{ field: 'is_official_affiliate', operator: 'equals', value: true }],
        then: 'Cannot determine eligibility. Direct to affiliate manager.',
        certainty: 'hard'
      },
      {
        if: [{ field: 'is_official_affiliate', operator: 'equals', value: false }],
        then: 'User IS eligible for promotions.',
        certainty: 'hard'
      }
    ],
    tags: ['promotion', 'eligibility', 'raffle', 'official_affiliate'],
    severity_default: 'medium',
    examples_good: [
      'As a non-official affiliate, you are eligible for our promotions including the $75 Weekly Raffle.',
      'For official affiliates, we cannot determine promotion eligibility. Please contact your affiliate manager.'
    ],
    source_location: { source_name: 'CS-Affiliate Program-050126-025406.pdf', page: 8, section: '9. Affiliate Eligibility for Stake Promotions' }
  },

  // ----- Affiliate Manager Contact Rules -----
  {
    subcategory: 'Affiliate Manager Contact',
    title: '72 Business Hours Response Time',
    intent: 'Manage expectations about affiliate manager response times.',
    rule_text: `Affiliate manager response time:
- Team should reply within 72 BUSINESS HOURS
- Applies to all inquiries, even from cancelled partnerships

IF AFFILIATE COMPLAINS NO RESPONSE:
1. Check when they sent the message
2. If <72 business hours: Advise to wait
3. If >72 business hours: Contact affiliate manager via appropriate channel`,
    steps: [
      { step_number: 1, action: 'Ask when user sent message to affiliate manager' },
      { step_number: 2, action: 'Calculate if 72 business hours have passed' },
      { step_number: 3, action: 'If not passed: Advise to wait' },
      { step_number: 4, action: 'If passed: Escalate via appropriate affiliate channel' }
    ],
    tags: ['affiliate_manager', 'response_time', '72_hours', 'escalation'],
    severity_default: 'low',
    source_location: { source_name: 'CS-Affiliate Program-050126-025406.pdf', page: 7, section: '8-1. Complaints About Affiliate Manager Response Times' }
  },
  {
    subcategory: 'Affiliate Manager Contact',
    title: 'Affiliate Channels by Market',
    intent: 'Ensure correct escalation channel is used based on market.',
    rule_text: `AFFILIATE ESCALATION CHANNELS:

By Market:
- esp-affiliate: Spanish market
- jp-affiliate: Japanese market
- br-affiliate: Brazilian market
- ind-affiliate: Indian market
- Affiliatesupport: English and all other markets

Use these channels when:
- 72 business hours passed with no response
- Affiliate manager is on holiday
- Need to escalate affiliate-related issues`,
    allowed_actions: ['Escalate via correct channel', 'Identify user\'s market'],
    disallowed_actions: ['Use wrong channel for market', 'Share channel names with users'],
    tags: ['affiliate_channels', 'escalation', 'esp-affiliate', 'jp-affiliate', 'br-affiliate', 'ind-affiliate', 'Affiliatesupport'],
    severity_default: 'medium',
    source_location: { source_name: 'CS-Affiliate Program-050126-025406.pdf', page: 7, section: '8. Request to contact their affiliate manager' }
  },
  {
    subcategory: 'Affiliate Manager Contact',
    title: 'Do Not Share Affiliate Manager Contact Info',
    intent: 'Prevent agents from sharing affiliate manager personal contact information.',
    rule_text: `CRITICAL: We CANNOT share affiliate manager contact information:
- Do NOT share Skype
- Do NOT share Telegram
- Do NOT share personal email
- Do NOT share phone numbers

If affiliate doesn't know how to contact manager:
- Advise to contact partners@stake.com`,
    allowed_actions: ['Direct to partners@stake.com', 'Explain we cannot share contact info'],
    disallowed_actions: ['Share Skype', 'Share Telegram', 'Share personal contact info'],
    tags: ['affiliate_manager', 'contact_info', 'privacy', 'partners@stake.com'],
    severity_default: 'critical',
    evidence_requirements: 'Agent does NOT share any personal contact information',
    examples_good: [
      'We cannot share the affiliate manager\'s contact details. Please reach out via partners@stake.com.'
    ],
    examples_bad: [
      'Your affiliate manager\'s Skype is...',
      'You can reach them on Telegram at...'
    ],
    source_location: { source_name: 'CS-Affiliate Program-050126-025406.pdf', page: 7, section: '8-2. Requests for Affiliate Manager\'s Contact Information' }
  },

  // ----- Welcome Bonus Clarification -----
  {
    subcategory: 'Referral Methods',
    title: 'Welcome Bonus Amount Clarification',
    intent: 'Clarify the actual welcome bonus amount vs marketed amounts.',
    rule_text: `WELCOME BONUS FACTS:
- Actual welcome bonus: 25 Stake Cash + 250,000 Gold Coins
- This is the SAME for everyone

MARKETING CLAIMS:
- Some third parties market it as 55 SC + 550,000 GC
- The extra 30 SC + 300,000 GC comes from claiming Daily Bonus for 30 days straight
- They often fail to explain this clearly
- There is NO way to claim all at once`,
    allowed_actions: ['Clarify actual welcome bonus', 'Explain daily bonus accumulation'],
    disallowed_actions: ['Promise 55 SC upfront', 'Claim instant 550k GC'],
    tags: ['welcome_bonus', 'stake_cash', 'gold_coins', 'daily_bonus', 'marketing'],
    severity_default: 'low',
    examples_good: [
      'The welcome bonus is 25 Stake Cash and 250,000 Gold Coins. The higher amounts you may have seen advertised include 30 days of daily bonus claims, which cannot be received all at once.'
    ],
    source_location: { source_name: 'Affiliate link VS Affiliate code - Nikola Stanojevic', section: 'Additional notes on Welcome Bonus' }
  }
];

// ============================================================================
// MAIN SCRIPT
// ============================================================================

async function createAffiliateKnowledge() {
  console.log('\n========================================');
  console.log('  AFFILIATE PROGRAM KNOWLEDGE BUILDER');
  console.log('========================================\n');

  try {
    // Step 1: Create or update the main category
    console.log('Step 1: Creating Affiliate Program category...');

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
          // Update existing rule
          Object.assign(rule, ruleDoc);
          await rule.save();
          rulesUpdated++;
          console.log(`  Updated: ${ruleData.title}`);
        } else {
          // Create new rule
          rule = await Rule.create(ruleDoc);
          rulesCreated++;
          console.log(`  Created: ${ruleData.title}`);
        }
      } catch (error) {
        rulesErrors.push({ title: ruleData.title, error: error.message });
        console.error(`  ERROR: ${ruleData.title} - ${error.message}`);
      }
    }

    console.log(`\n  Rules created: ${rulesCreated}`);
    console.log(`  Rules updated: ${rulesUpdated}`);
    console.log(`  Errors: ${rulesErrors.length}`);

    // Step 3: Generate embeddings
    console.log('\nStep 3: Generating embeddings...');

    const rules = await Rule.find({
      category: category._id,
      isActive: true
    });

    let embeddingsCreated = 0;
    let embeddingsUpdated = 0;
    let embeddingsErrors = [];

    for (const rule of rules) {
      try {
        const chunk = await createRuleChunk(rule);
        if (chunk) {
          embeddingsCreated++;
          console.log(`  Embedding: ${rule.title}`);
        }
      } catch (error) {
        // Might be duplicate, try to update
        if (error.code === 11000) {
          embeddingsUpdated++;
          console.log(`  Skipped (exists): ${rule.title}`);
        } else {
          embeddingsErrors.push({ rule_id: rule.rule_id, error: error.message });
          console.error(`  ERROR: ${rule.title} - ${error.message}`);
        }
      }
    }

    console.log(`\n  Embeddings created: ${embeddingsCreated}`);
    console.log(`  Embeddings skipped: ${embeddingsUpdated}`);
    console.log(`  Errors: ${embeddingsErrors.length}`);

    // Summary
    console.log('\n========================================');
    console.log('            SUMMARY');
    console.log('========================================');
    console.log(`Category: ${CATEGORY_DATA.name}`);
    console.log(`Subcategories: ${CATEGORY_DATA.subcategories.length}`);
    console.log(`Total Rules: ${rulesCreated + rulesUpdated}`);
    console.log(`Embeddings: ${embeddingsCreated + embeddingsUpdated}`);

    if (rulesErrors.length > 0 || embeddingsErrors.length > 0) {
      console.log('\nERRORS:');
      rulesErrors.forEach(e => console.log(`  Rule: ${e.title} - ${e.error}`));
      embeddingsErrors.forEach(e => console.log(`  Embedding: ${e.rule_id} - ${e.error}`));
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
    await createAffiliateKnowledge();
    await mongoose.connection.close();
    console.log('Database connection closed.');
    process.exit(0);
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
};

run();
