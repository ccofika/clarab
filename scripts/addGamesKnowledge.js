/**
 * Script: Add Games Knowledge Base
 *
 * Dodaje knowledge za Games kategoriju (Stake Originals, Third-Party Slots, Live Games)
 * OVO JE NAJBITNIJA KATEGORIJA
 *
 * Usage: node scripts/addGamesKnowledge.js
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
  name: 'Games',
  description: 'Knowledge base for handling game-related issues including Stake Originals, Third-Party Slots, and Live Games. Covers bet issues, payouts, frozen games, stuck rounds, and technical problems.',
  knowledge: `Games category covers all casino game-related issues across three main types:

1. STAKE ORIGINALS - In-house games like Crash, Mines, Plinko, Dice, Blackjack
2. THIRD-PARTY SLOTS - External provider slots (Titan Gaming, Hacksaw Gaming, etc.)
3. LIVE GAMES - Evolution, Pragmatic Play live casino games (Blackjack, Baccarat, Crazy Time, etc.)

KEY PRINCIPLE: Always gather bet ID, screenshots from in-game history, and detailed explanations before opening Jira cases.

IMPORTANT: Do NOT copy/paste Tech Support responses directly to users. Understand the solution and explain it clearly.`,
  keywords: [
    'game', 'bet', 'payout', 'frozen', 'stuck', 'crash', 'mines', 'plinko', 'dice',
    'slot', 'live game', 'evolution', 'pragmatic', 'bet id', 'balance', 'winnings',
    'third-party', 'stake original', 'blackjack', 'baccarat', 'crazy time'
  ],
  evaluationCriteria: `When evaluating game-related tickets:
1. Agent gathers bet ID before escalating
2. Agent requests screenshots from in-game history
3. Agent attempts troubleshooting before opening Jira case
4. Agent does NOT copy/paste tech support responses
5. Agent explains solutions clearly to users
6. Agent includes all required information in Jira tickets`,
  subcategories: [
    {
      name: 'Stake Originals',
      description: 'Issues with in-house Stake games: Crash, Mines, Plinko, Dice, Blackjack, etc.',
      knowledge: `Stake Originals are in-house games with specific handling procedures:

BET NOT PAID OUT:
- Check bet ID - if settled with payout, reassure user
- Only open case if user insists after verification

GAME FROZE:
- Games like Mines require user input to complete
- System cannot perform actions on behalf of users
- Refreshing during bonus round auto-settles the game

CRASH BETS:
- Always open Jira case for Crash issues
- Include bet ID and detailed explanation

STUCK ROUNDS:
- Only possible when user input is required (Blackjack call, Mines tile)
- User just needs to return to the game to continue

VERIFICATION ISSUES:
- User must change seed from where bet was placed
- Guide them step-by-step using Bet Verification forum page

BALANCE ISSUES:
- Rate-limited users may see incorrect balance
- Refreshing page shows correct balance
- Autobet settings are local to user's device`,
      keywords: ['stake original', 'crash', 'mines', 'plinko', 'dice', 'blackjack', 'bet not paid', 'game froze', 'stuck round', 'verification', 'balance', 'autobet'],
      evaluationCriteria: 'Agent correctly identifies issue type. Gathers bet ID. Explains that stuck rounds require returning to game. Does not open unnecessary Jira cases.'
    },
    {
      name: 'Third-Party Slots',
      description: 'Issues with external provider slot games including stuck bets, missing payouts, access issues',
      knowledge: `Third-party slots are provided by external providers. Common issues:

STUCK BETS:
- Check ACP: Casino → Active Third Party (check ALL integrations)
- If bet has ID = note it for Jira
- If no bet ID but shows active = ghost bet, already settled, open Jira

PROVIDER-SPECIFIC:
- TITAN GAMING: "Round in Progress" is NOT an error
  - Replay/OK = round replays, winnings credited at end
  - Cancel = round closes, winnings auto-credited
- HACKSAW GAMING: Disconnection keeps round open 24 hours
  - Yes = replay from start
  - No = close immediately, winnings credited

WINNINGS NOT CREDITED:
- Check RAW data in ACP (Search → Bet → bet ID → RAW data)
- Compare CreatedAt vs UpdatedAt timestamps
- Under 1 minute = normal, 10+ minutes = significant delay
- User may have been paid without noticing

INCORRECT PAYOUT:
- Compare user claims with game rules
- Ask for screenshot/video
- If user misunderstood rules, explain
- If uncertain, open Jira with bet ID and evidence

ACCESS ISSUES:
- Verify account status and maintenance
- Handle specific errors (server error, country restriction, session failed)
- Ask for screenshot of error for Jira ticket

IMPORTANT: Users CANNOT have active bets on Live Games - if found, open Jira immediately`,
      keywords: ['third-party', 'slot', 'stuck bet', 'ghost bet', 'titan gaming', 'hacksaw gaming', 'winnings', 'payout', 'access', 'acp', 'raw data'],
      evaluationCriteria: 'Agent checks ACP for stuck bets. Knows provider-specific behaviors (Titan, Hacksaw). Checks RAW data for payout delays. Gathers all info before Jira.'
    },
    {
      name: 'Live Games',
      description: 'Issues with Evolution, Pragmatic Play live casino games - payouts, rejected bets, settlement issues',
      knowledge: `Live games include Blackjack, Baccarat, Crazy Time, Sweet Bonanza Candyland, etc.

CRITICAL: Always get bet ID AND full screenshot from in-game history.
If user has case ID (e.g., SD12456), include it in Jira for faster resolution.

IMPORTANT: Not possible to have stuck bets with live games - if found, open Jira immediately.

INCORRECT PAYOUT:
- First gather: screenshot from in-game history, bet ID, detailed explanation
- Verify claims before opening Jira
- Often issue is user not placing intended bet
- Compare claims with game rules

CRYPTO > FIAT CONVERSION:
- Fiat currencies use 2 decimal places
- 0.0008192 BTC at $61,027.20 = $49.996, displayed as $50
- Placing $50 bet fails because actual balance is $49.996
- ADVISE: Place bets slightly lower (e.g., $49.90) to avoid rejection

REJECTED/CANCELLED BETS:
- Reasons: insufficient funds, conversion rate discrepancy, provider decision
- Cancelled/rejected rounds typically don't generate bet IDs
- No funds deducted = no payout owed
- Screenshot from previous round is sufficient

SETTLEMENT ISSUES:
- During server issues/downtime, payout delays occur (especially Evolution)
- If one player affected, others likely are too
- Create Jira with bet ID (or game ID + coin pair if no bet ID)

DECISION ISSUES:
- AutoStand/Honest Decision = system decided because user didn't respond in time
- Usually caused by internet/browser issues
- Limited resolution options, but can open Jira for investigation`,
      keywords: ['live game', 'evolution', 'pragmatic', 'blackjack', 'baccarat', 'crazy time', 'rejected bet', 'cancelled', 'settlement', 'decision', 'conversion', 'in-game history'],
      evaluationCriteria: 'Agent gets bet ID AND screenshot from in-game history. Explains crypto/fiat conversion issue. Knows cancelled rounds have no bet ID. Includes case ID if provided.'
    }
  ]
};

// ============================================================================
// RULES DATA
// ============================================================================

const RULES_DATA = [
  // ==================== STAKE ORIGINALS ====================
  {
    subcategory: 'Stake Originals',
    title: 'Stake Originals - Bet Not Paid Out',
    intent: 'Handle users claiming their Stake Original bet was not paid when it actually was.',
    rule_text: `When a user contacts us regarding a bet that hasn't been credited to their balance but was settled with a payout according to the BET ID:

1. Reassure the user that the bet was indeed settled correctly
2. Check the bet ID to verify settlement and payout
3. Only proceed to open a case for further investigation if the user continues to claim otherwise after verification

Do NOT immediately open a Jira case - first verify and reassure.`,
    steps: [
      { step_number: 1, action: 'Ask for the bet ID if not provided' },
      { step_number: 2, action: 'Check the bet ID to verify it was settled with correct payout' },
      { step_number: 3, action: 'Reassure user that bet was settled correctly, show evidence if possible' },
      { step_number: 4, action: 'Only if user insists after verification, open Jira case for investigation' }
    ],
    allowed_actions: ['Verify bet ID', 'Reassure user', 'Open Jira only if user insists after verification'],
    disallowed_actions: ['Immediately open Jira without verification', 'Dismiss user without checking bet ID'],
    tags: ['stake_original', 'bet_not_paid', 'payout', 'verification', 'bet_id'],
    severity_default: 'medium',
    evidence_requirements: 'Agent verifies bet ID before escalating. Shows evidence of settlement to user.',
    verification_checks: [
      { check_id: 'BET_ID_VERIFIED', description: 'Agent checked the bet ID for settlement status', required_when: 'User claims bet not paid' },
      { check_id: 'USER_REASSURED', description: 'Agent reassured user with verification evidence', required_when: 'Bet shows as properly settled' }
    ],
    examples_good: [
      'I\'ve checked your bet ID and I can confirm it was settled correctly with a payout of X. The winnings were credited to your balance at [time]. Could you please refresh your page and check your transaction history?',
      'Let me verify this bet for you. I can see from bet ID [X] that the payout was processed. Would you like me to walk you through where to see this in your history?'
    ],
    examples_bad: [
      'Let me open a ticket for you right away.',
      'I\'ll report this to tech support.'
    ],
    source_location: { source_name: 'CS-Customer Support x Tech support - Process-050126-012722.pdf', page: 2, section: 'Stake Originals - Bet Not Paid Out' }
  },
  {
    subcategory: 'Stake Originals',
    title: 'Stake Originals - Game Froze',
    intent: 'Handle cases where users claim a Stake Original game froze.',
    rule_text: `For games where users claim a game froze and did not perform as expected:

MINES (and similar input-required games):
- User input is necessary to complete bets
- Our system cannot perform actions on behalf of users
- If user claims tile wasn't opened, explain this requires user action

BONUS ROUND FROZE:
- Request the bet ID of the affected round
- With bet ID, we can display every spin outcome
- IMPORTANT: Refreshing the page during a bonus round in original slots will automatically settle the game round`,
    steps: [
      { step_number: 1, action: 'Identify which Stake Original game was affected' },
      { step_number: 2, action: 'For input-required games (Mines, Blackjack), explain user action is required' },
      { step_number: 3, action: 'For bonus round issues, request the bet ID' },
      { step_number: 4, action: 'Inform user that refreshing during bonus round auto-settles the game' }
    ],
    allowed_actions: ['Explain user input requirement', 'Request bet ID', 'Explain auto-settlement on refresh'],
    disallowed_actions: ['Claim system error without verification', 'Promise compensation without investigation'],
    tags: ['stake_original', 'game_froze', 'mines', 'bonus_round', 'user_input', 'auto_settle'],
    severity_default: 'medium',
    evidence_requirements: 'Agent correctly identifies game type and explains appropriate resolution.',
    verification_checks: [
      { check_id: 'GAME_TYPE_IDENTIFIED', description: 'Agent identified which game type and appropriate handling', required_when: 'User reports game froze' },
      { check_id: 'USER_INPUT_EXPLAINED', description: 'Agent explained user input requirement for applicable games', required_when: 'Issue with Mines or similar games' }
    ],
    examples_good: [
      'For Mines, the game requires you to select each tile - our system cannot make selections on your behalf. If you return to the game, you should be able to continue your round.',
      'If the bonus round froze, could you provide the bet ID? Also, please note that refreshing during a bonus round automatically settles it with all outcomes determined.'
    ],
    examples_bad: [
      'That\'s a system error, let me report it.',
      'The game should have opened the tile automatically.'
    ],
    source_location: { source_name: 'CS-Customer Support x Tech support - Process-050126-012722.pdf', page: 2, section: 'Game Froze' }
  },
  {
    subcategory: 'Stake Originals',
    title: 'Stake Originals - Crash Bet Issues',
    intent: 'Handle Crash game issues which always require Jira escalation.',
    rule_text: `Whenever a user complains about issues with a Crash round, ALWAYS initiate a case on Jira for further investigation.

REQUIRED INFORMATION:
- Bet ID (mandatory)
- Detailed explanation of the issue

Crash issues are always escalated because the game mechanics require technical investigation.`,
    steps: [
      { step_number: 1, action: 'Request the bet ID from the user' },
      { step_number: 2, action: 'Ask for detailed explanation of what happened' },
      { step_number: 3, action: 'Open Jira case with bet ID and detailed explanation' }
    ],
    allowed_actions: ['Request bet ID', 'Request detailed explanation', 'Open Jira case'],
    disallowed_actions: ['Resolve without Jira case', 'Escalate without bet ID'],
    tags: ['stake_original', 'crash', 'jira', 'escalation', 'bet_id'],
    severity_default: 'high',
    evidence_requirements: 'Agent collects bet ID and opens Jira case for all Crash issues.',
    verification_checks: [
      { check_id: 'BET_ID_COLLECTED', description: 'Agent collected the Crash bet ID', required_when: 'User reports Crash issue' },
      { check_id: 'JIRA_OPENED', description: 'Agent opened Jira case for Crash issue', required_when: 'Crash bet issue reported' }
    ],
    examples_good: [
      'I understand you had an issue with your Crash round. Could you please provide the bet ID so I can create a ticket for our technical team to investigate?',
      'I\'ll need the bet ID and a detailed description of what happened. Once I have those, I\'ll open a case for investigation right away.'
    ],
    examples_bad: [
      'Crash games work correctly, no need to investigate.',
      'Just try playing again.'
    ],
    source_location: { source_name: 'CS-Customer Support x Tech support - Process-050126-012722.pdf', page: 3, section: 'Crash Bet' }
  },
  {
    subcategory: 'Stake Originals',
    title: 'Stake Originals - Stuck Rounds Resolution',
    intent: 'Handle stuck rounds which require user to return to the game.',
    rule_text: `Stuck rounds occur ONLY when user input is required to complete the game round:
- Calling on Blackjack
- Choosing a tile in Mines

Otherwise, it is NOT possible to have a stuck round on Stake Original games.

RESOLUTION: User only needs to get back to the game, regardless of browser or device. You can send them the direct link to the specific game.`,
    steps: [
      { step_number: 1, action: 'Confirm the game requires user input (Blackjack, Mines, etc.)' },
      { step_number: 2, action: 'Instruct user to return to the game to continue' },
      { step_number: 3, action: 'Optionally send direct link to the game' },
      { step_number: 4, action: 'Explain they can use any browser or device' }
    ],
    allowed_actions: ['Instruct to return to game', 'Send game link', 'Explain any device works'],
    disallowed_actions: ['Open Jira for simple stuck rounds', 'Claim system will auto-resolve'],
    tags: ['stake_original', 'stuck_round', 'blackjack', 'mines', 'user_input', 'return_to_game'],
    severity_default: 'low',
    evidence_requirements: 'Agent correctly instructs user to return to game to complete stuck round.',
    examples_good: [
      'Stuck rounds on Mines happen when waiting for your input. Simply go back to the game and you\'ll be able to continue selecting tiles. Here\'s the direct link: [link]',
      'Your Blackjack round is waiting for your decision. You can return to the game from any device or browser and it will pick up where you left off.'
    ],
    examples_bad: [
      'I\'ll create a ticket to unstick your round.',
      'The system should have completed this automatically.'
    ],
    source_location: { source_name: 'CS-Customer Support x Tech support - Process-050126-012722.pdf', page: 3, section: 'Stuck Rounds' }
  },
  {
    subcategory: 'Stake Originals',
    title: 'Stake Originals - Bet Verification Issues',
    intent: 'Help users who cannot verify their bets using provably fair system.',
    rule_text: `If the user is unable to verify their bet:

KEY POINT: They need to change the seed FROM WHERE THE BET WAS PLACED.

STEPS:
1. Double-check user is using the correct seed
2. Go step-by-step with user using the Bet Verification forum page
3. Try to verify the bet yourself with the provided bet ID
4. If you cannot verify it either, open a Jira ticket`,
    steps: [
      { step_number: 1, action: 'Ask for the bet ID' },
      { step_number: 2, action: 'Remind user to use seed from when bet was placed' },
      { step_number: 3, action: 'Guide them step-by-step through verification process' },
      { step_number: 4, action: 'Try to verify the bet yourself' },
      { step_number: 5, action: 'If verification fails for both, open Jira ticket' }
    ],
    allowed_actions: ['Guide through verification', 'Remind about seed timing', 'Verify bet yourself', 'Open Jira if verification fails'],
    disallowed_actions: ['Skip trying to verify yourself', 'Immediately escalate without attempting'],
    tags: ['stake_original', 'verification', 'provably_fair', 'seed', 'bet_id'],
    severity_default: 'medium',
    evidence_requirements: 'Agent guides user through verification process and attempts verification themselves before escalating.',
    examples_good: [
      'When verifying your bet, make sure you\'re using the seed that was active when the bet was placed. Let me walk you through the steps...',
      'I\'ll try to verify this bet myself. Could you provide the bet ID? Remember, the seed must be from the time the bet was made.'
    ],
    examples_bad: [
      'Verification is handled by tech support, let me create a ticket.',
      'Just check the forum page.'
    ],
    source_location: { source_name: 'CS-Customer Support x Tech support - Process-050126-012722.pdf', page: 3, section: 'Verification Not Correct' }
  },
  {
    subcategory: 'Stake Originals',
    title: 'Stake Originals - Balance and Autobet Issues',
    intent: 'Handle balance discrepancies and autobet issues related to rate limiting.',
    rule_text: `When users are rate-limited, they may encounter:

BALANCE ISSUES:
- Balances not updating correctly (especially Plinko, Mines, Dice)
- Occurs when placing bets more rapidly than allowed
- SOLUTION: Refreshing the page displays correct balance, all bets settled correctly

AUTOBET ISSUES:
- Autobet settings are hard-coded and executed LOCALLY on user's device
- Device determines win/loss, applies settings, manages calculations
- These settings are NOT influenced by servers or database

FOR OTHER BALANCE DISCREPANCIES:
- Gather: starting bet ID, ending bet ID, full screenshot of conditions
- Open Jira case for investigation`,
    steps: [
      { step_number: 1, action: 'Ask user to refresh page to see correct balance' },
      { step_number: 2, action: 'Explain rate limiting if they were betting rapidly' },
      { step_number: 3, action: 'For autobet issues, explain settings are local to device' },
      { step_number: 4, action: 'If issue persists and unrelated to above, gather bet IDs and screenshot' },
      { step_number: 5, action: 'Open Jira case for unexplained discrepancies' }
    ],
    allowed_actions: ['Advise to refresh page', 'Explain rate limiting', 'Explain autobet is local', 'Gather evidence for Jira'],
    disallowed_actions: ['Claim server changed autobet settings', 'Immediately escalate without refresh test'],
    tags: ['stake_original', 'balance', 'autobet', 'rate_limit', 'refresh', 'plinko', 'mines', 'dice'],
    severity_default: 'medium',
    evidence_requirements: 'Agent advises refresh first. Explains rate limiting and local autobet. Only escalates unexplained issues with proper evidence.',
    examples_good: [
      'When betting quickly, sometimes the display doesn\'t update immediately. Please refresh your page - this will show your correct balance and all bets will have been settled correctly.',
      'Autobet settings run locally on your device, not on our servers. The calculations are performed by your browser. If you\'re seeing unexpected behavior, could you share your conditions screenshot?'
    ],
    examples_bad: [
      'The server must have changed your autobet settings.',
      'Let me report this balance issue immediately.'
    ],
    source_location: { source_name: 'CS-Customer Support x Tech support - Process-050126-012722.pdf', page: 3, section: 'Balance issues' }
  },

  // ==================== THIRD-PARTY SLOTS ====================
  {
    subcategory: 'Third-Party Slots',
    title: 'Third-Party Slots - Stuck Bets Check and Resolution',
    intent: 'Properly check for and handle stuck bets in third-party slots.',
    rule_text: `When a user reports stuck bet issues (kicked out of game, game freezing):

FIRST STEP: Check for stuck bets in ACP
- Casino → Active Third Party
- IMPORTANT: Check ALL integrations by changing dropdown menu on right

IF ACTIVE BET FOUND:
- Note the bet ID in Intercom ticket
- Guide user through troubleshooting steps one by one

IF NO BET ID BUT APPEARS ACTIVE:
- This is a "ghost bet" - already settled
- Create Jira Tech case for more information

IF TROUBLESHOOTING FAILS:
- Ask user for screenshots or video of issue/error message
- Open Jira case with: Game name, Short description, Bet ID of stuck bet

IMPORTANT: Users cannot have active bets on Live Games. If this occurs, open Jira case immediately.`,
    steps: [
      { step_number: 1, action: 'Check ACP: Casino → Active Third Party (all integrations)' },
      { step_number: 2, action: 'If bet has ID, note it and begin troubleshooting with user' },
      { step_number: 3, action: 'If no bet ID but shows active (ghost bet), open Jira case' },
      { step_number: 4, action: 'If troubleshooting fails, request screenshots/video' },
      { step_number: 5, action: 'Open Jira with: game name, description, bet ID' }
    ],
    allowed_actions: ['Check ACP for active bets', 'Note bet ID', 'Guide troubleshooting', 'Request screenshots', 'Open Jira with complete info'],
    disallowed_actions: ['Skip ACP check', 'Open Jira without checking for stuck bet first', 'Forget to check all integrations'],
    tags: ['third_party', 'slot', 'stuck_bet', 'ghost_bet', 'acp', 'active_third_party', 'troubleshooting'],
    severity_default: 'high',
    evidence_requirements: 'Agent checks ACP before escalating. Notes bet ID. Includes game name, description, and bet ID in Jira.',
    verification_checks: [
      { check_id: 'ACP_CHECKED', description: 'Agent checked ACP Active Third Party', required_when: 'User reports stuck bet' },
      { check_id: 'ALL_INTEGRATIONS_CHECKED', description: 'Agent checked all integrations in dropdown', required_when: 'Checking for stuck bets' },
      { check_id: 'JIRA_COMPLETE', description: 'Jira includes game name, description, bet ID', required_when: 'Opening stuck bet case' }
    ],
    examples_good: [
      'Let me check our system for any active bets on your account. I\'ll look through all game providers... I can see an active bet with ID [X]. Let\'s try some troubleshooting steps.',
      'I found an active entry but no bet ID - this is called a ghost bet and means it\'s already been settled. Let me create a ticket for more details on what happened.'
    ],
    examples_bad: [
      'I\'ll create a ticket right away.',
      'Just try refreshing the page and playing again.'
    ],
    source_location: { source_name: 'CS-Customer Support x Tech support - Process-050126-012722.pdf', page: 3, section: 'Third-party slots - Stuck bets' }
  },
  {
    subcategory: 'Third-Party Slots',
    title: 'Titan Gaming - Round in Progress Message',
    intent: 'Explain Titan Gaming "Round in Progress" message is not an error.',
    rule_text: `For Titan Gaming slots:

"Round in Progress" or "Game round in progress" displayed below buttons is NOT an error message.

USER OPTIONS:
1. Replay / OK - Round replays from start to finish, winnings credited at end
2. Cancel - Round closes immediately, winnings (if any) auto-credited

A bet ID will be generated once round is settled.

This ensures all rounds are properly resolved even after disconnection.`,
    allowed_actions: ['Explain this is not an error', 'Guide user on Replay vs Cancel options', 'Reassure winnings will be credited'],
    disallowed_actions: ['Open Jira for normal "Round in Progress" message', 'Claim this is a bug'],
    tags: ['third_party', 'titan_gaming', 'round_in_progress', 'replay', 'cancel', 'disconnection'],
    severity_default: 'low',
    evidence_requirements: 'Agent correctly identifies Titan Gaming message and explains the two resolution options.',
    examples_good: [
      'This "Round in Progress" message from Titan Gaming is not an error - it\'s letting you resume or close the round. Click "OK" to watch it replay and get your winnings at the end, or "Cancel" to close immediately and receive any winnings right away.',
      'This happens when you get disconnected during a Titan Gaming slot round. You have two options: Replay to watch the full round, or Cancel to receive your winnings immediately.'
    ],
    examples_bad: [
      'That\'s an error, let me report it.',
      'Something went wrong with the game.'
    ],
    source_location: { source_name: 'CS-Customer Support x Tech support - Process-050126-012722.pdf', page: 4, section: 'Provider-Specific Notes - Titan Gaming' }
  },
  {
    subcategory: 'Third-Party Slots',
    title: 'Hacksaw Gaming - Round Interrupted After Disconnect',
    intent: 'Explain Hacksaw Gaming disconnection handling and 24-hour window.',
    rule_text: `For Hacksaw Gaming slots:

If player disconnects before seeing results:
- Round remains open for 24 HOURS
- User can reconnect and will see prompt with two choices:

USER OPTIONS:
1. Yes - Round replays from start to finish, winnings credited at end
2. No - Round closes immediately, winnings (if any) auto-credited

After 24 hours, round auto-settles.`,
    allowed_actions: ['Explain 24-hour window', 'Guide user on Yes vs No options', 'Reassure winnings will be credited'],
    disallowed_actions: ['Open Jira for normal round interrupted message', 'Claim funds are lost'],
    tags: ['third_party', 'hacksaw_gaming', 'disconnection', '24_hours', 'round_interrupted', 'replay'],
    severity_default: 'low',
    evidence_requirements: 'Agent correctly identifies Hacksaw Gaming behavior and explains the options.',
    examples_good: [
      'Hacksaw Gaming keeps your round open for 24 hours after disconnection. Click "Yes" to replay and see the full result, or "No" to close it immediately and receive any winnings.',
      'Your round is still available because Hacksaw games stay open for 24 hours. You can choose to replay it or close it now - either way your winnings will be credited.'
    ],
    examples_bad: [
      'The round is lost because you disconnected.',
      'Let me create a ticket for this error.'
    ],
    source_location: { source_name: 'CS-Customer Support x Tech support - Process-050126-012722.pdf', page: 5, section: 'Provider-Specific Notes - Hacksaw Gaming' }
  },
  {
    subcategory: 'Third-Party Slots',
    title: 'Third-Party Slots - Winnings Not Credited (Payout Delay Check)',
    intent: 'Check for payout delays before opening Jira for missing winnings.',
    rule_text: `When users claim winnings were not credited:

FIRST: Check for processing delays in ACP RAW data:
1. Open ACP
2. Navigate to "Search" section
3. Access "Bet" tab
4. Enter bet ID provided by user
5. Scroll down and open "RAW data" section
6. Compare "CreatedAt" and "UpdatedAt" timestamps

TIMING GUIDE:
- Under 1 minute difference = normal
- Few minutes (bonus games) = normal
- Over 10 minutes = significant delay, user may have missed the payout

If over 10 minutes delay, user likely got paid without noticing.
If user still claims unpaid after verification, open Jira case with all info.`,
    steps: [
      { step_number: 1, action: 'Request bet ID from user' },
      { step_number: 2, action: 'Check ACP: Search → Bet → enter bet ID → RAW data' },
      { step_number: 3, action: 'Compare CreatedAt and UpdatedAt timestamps' },
      { step_number: 4, action: 'If delay > 10 min, explain user may have been paid without noticing' },
      { step_number: 5, action: 'If user insists, open Jira case with all information' }
    ],
    allowed_actions: ['Check RAW data timestamps', 'Explain payout delays', 'Open Jira if issue confirmed'],
    disallowed_actions: ['Skip RAW data check', 'Immediately open Jira without verification'],
    tags: ['third_party', 'winnings', 'payout', 'delay', 'raw_data', 'acp', 'timestamp', 'created_at', 'updated_at'],
    severity_default: 'medium',
    evidence_requirements: 'Agent checks RAW data timestamps before escalating. Explains delay possibility.',
    verification_checks: [
      { check_id: 'RAW_DATA_CHECKED', description: 'Agent checked CreatedAt vs UpdatedAt in RAW data', required_when: 'User claims winnings not credited' },
      { check_id: 'DELAY_EXPLAINED', description: 'Agent explained possible payout delay', required_when: 'Significant timestamp difference found' }
    ],
    examples_good: [
      'I\'ve checked the bet data and see there was about 15 minutes between bet placement and settlement. This delay may have caused you to miss the payout notification. Could you check your balance again?',
      'Looking at the raw data for your bet, the timing shows the payout was processed. Sometimes during longer bonus rounds there can be a delay that makes it easy to miss.'
    ],
    examples_bad: [
      'I\'ll report this missing payout immediately.',
      'Our system must have failed to pay you.'
    ],
    source_location: { source_name: 'CS-Customer Support x Tech support - Process-050126-012722.pdf', page: 5, section: 'Winnings not credited to balance' }
  },
  {
    subcategory: 'Third-Party Slots',
    title: 'Third-Party Slots - Incorrect Payout Claims',
    intent: 'Verify incorrect payout claims against game rules before escalating.',
    rule_text: `When user claims bet wasn't paid correctly:

BEFORE OPENING JIRA:
1. Ask for screenshot or video of the issue
2. Compare their claims with the game rules
3. If user misunderstood game rules/payouts, inform them
4. If support agent is unsure, THEN open Jira case

JIRA REQUIREMENTS:
- BET ID
- Detailed explanation
- Screenshots or videos of the problem`,
    steps: [
      { step_number: 1, action: 'Ask for screenshot or video of the issue' },
      { step_number: 2, action: 'Review and compare claims with game rules' },
      { step_number: 3, action: 'If user misunderstood rules, explain correctly' },
      { step_number: 4, action: 'If uncertain, open Jira with bet ID, explanation, and evidence' }
    ],
    allowed_actions: ['Request evidence', 'Compare with game rules', 'Explain rules if misunderstood', 'Open Jira if uncertain'],
    disallowed_actions: ['Open Jira without checking game rules', 'Dismiss user without explanation'],
    tags: ['third_party', 'incorrect_payout', 'game_rules', 'screenshot', 'video', 'verification'],
    severity_default: 'medium',
    evidence_requirements: 'Agent reviews game rules before escalating. Requests evidence. Only escalates when uncertain.',
    examples_good: [
      'Could you share a screenshot of the game result? I\'ll compare it with the paytable to verify the payout calculation.',
      'Looking at the game rules, that combination actually pays X multiplier, not Y. The payout you received matches the correct amount.'
    ],
    examples_bad: [
      'Let me open a ticket for this incorrect payout.',
      'I\'m sure you\'re right, let me escalate this.'
    ],
    source_location: { source_name: 'CS-Customer Support x Tech support - Process-050126-012722.pdf', page: 6, section: 'Incorrect payout' }
  },
  {
    subcategory: 'Third-Party Slots',
    title: 'Third-Party Slots - Access Issues',
    intent: 'Handle access issues with provider slot games.',
    rule_text: `For access issues with provider's slot games:

FIRST STEPS:
1. Verify user's account status
2. Check for any ongoing maintenance

COMMON ERRORS TO ADDRESS:
- Server errors
- "Please contact support"
- "Game not available in your country"
- "Failed to start third-party session"

Follow appropriate troubleshooting steps for each error type.

IF ISSUE PERSISTS:
- Ask user for screenshot of the error
- Create Jira ticket with relevant information and screenshot`,
    steps: [
      { step_number: 1, action: 'Verify user account status' },
      { step_number: 2, action: 'Check for ongoing maintenance' },
      { step_number: 3, action: 'Identify specific error type' },
      { step_number: 4, action: 'Follow appropriate troubleshooting for that error' },
      { step_number: 5, action: 'If persists, request screenshot and open Jira' }
    ],
    allowed_actions: ['Check account status', 'Check maintenance', 'Troubleshoot by error type', 'Request screenshot', 'Open Jira'],
    disallowed_actions: ['Skip account/maintenance check', 'Open Jira without screenshot of error'],
    tags: ['third_party', 'access', 'error', 'server_error', 'country_restriction', 'session_failed', 'troubleshooting'],
    severity_default: 'medium',
    evidence_requirements: 'Agent checks account status and maintenance first. Gets screenshot of error for Jira.',
    examples_good: [
      'I\'ll check if there\'s any maintenance affecting this game. Could you also share a screenshot of the error message you\'re seeing?',
      'I\'ve verified your account is in good standing and there\'s no current maintenance. What exactly does the error message say?'
    ],
    examples_bad: [
      'Just try again later.',
      'I\'ll report this issue immediately.'
    ],
    source_location: { source_name: 'CS-Customer Support x Tech support - Process-050126-012722.pdf', page: 6, section: 'Access issues' }
  },
  {
    subcategory: 'Third-Party Slots',
    title: 'Third-Party Slots - Bet Placed/Amount Changed Itself',
    intent: 'Address claims that bets placed themselves or amounts changed automatically.',
    rule_text: `When users claim a bet placed itself or bet amount changed automatically:

IMPORTANT FACT:
- It is NOT possible for a bet to place itself
- It is NOT possible for the bet amount to change automatically
- Our system CANNOT alter bet amounts or place bets on behalf of users
- ONLY the user can make such changes

Politely explain this to the user. If they insist, you may offer to review specific bet IDs but maintain that the system cannot perform these actions.`,
    allowed_actions: ['Explain system cannot place bets or change amounts', 'Offer to review specific bet IDs', 'Maintain factual position'],
    disallowed_actions: ['Agree that system changed bet', 'Open Jira claiming system error'],
    tags: ['third_party', 'bet_placed_itself', 'amount_changed', 'system_limitation', 'user_action'],
    severity_default: 'low',
    evidence_requirements: 'Agent correctly explains that system cannot place bets or change amounts on behalf of users.',
    examples_good: [
      'Our system is designed so that only you can place bets and change bet amounts. It\'s not technically possible for the system to do this on your behalf. Would you like me to review any specific bet IDs?',
      'I understand it may seem that way, but our platform cannot alter bet amounts or place bets automatically. All betting actions require user input. Let\'s look at the specific bet you\'re concerned about.'
    ],
    examples_bad: [
      'There must have been a glitch that changed your bet.',
      'Let me report this system error.'
    ],
    source_location: { source_name: 'CS-Customer Support x Tech support - Process-050126-012722.pdf', page: 6, section: 'The bet placed itself or the bet amount changed itself' }
  },

  // ==================== LIVE GAMES ====================
  {
    subcategory: 'Live Games',
    title: 'Live Games - Information Gathering Requirements',
    intent: 'Ensure agents collect all required information for live game issues.',
    rule_text: `For ALL live game issues, gather:

REQUIRED:
1. Bet ID of the bet in question (before or after cancellation)
2. Full screenshot from in-game history

BONUS: If user has a case ID from in-game support (e.g., SD12456):
- Ask user to describe the issue
- Gather bet ID and in-game screenshots
- Include case ID in Jira for faster resolution

IMPORTANT: Not possible to have stuck bets with live games. If encountered, open Jira immediately.`,
    steps: [
      { step_number: 1, action: 'Request bet ID from user' },
      { step_number: 2, action: 'Request full screenshot from in-game history' },
      { step_number: 3, action: 'Ask if they have a case ID from in-game support' },
      { step_number: 4, action: 'Include case ID in Jira if provided' }
    ],
    allowed_actions: ['Request bet ID', 'Request in-game history screenshot', 'Ask for case ID', 'Include case ID in Jira'],
    disallowed_actions: ['Open Jira without bet ID and screenshot', 'Skip asking about case ID'],
    tags: ['live_game', 'bet_id', 'screenshot', 'in_game_history', 'case_id', 'information_gathering'],
    severity_default: 'high',
    evidence_requirements: 'Agent collects bet ID and screenshot from in-game history. Asks about case ID.',
    verification_checks: [
      { check_id: 'BET_ID_COLLECTED', description: 'Agent collected bet ID', required_when: 'Any live game issue' },
      { check_id: 'SCREENSHOT_REQUESTED', description: 'Agent requested in-game history screenshot', required_when: 'Any live game issue' },
      { check_id: 'CASE_ID_ASKED', description: 'Agent asked about in-game support case ID', required_when: 'User reports live game issue' }
    ],
    examples_good: [
      'To investigate this, I\'ll need the bet ID and a full screenshot from your in-game history. Also, did you contact in-game support and receive a case ID?',
      'Please share the bet ID for this round along with a screenshot from the game history. If you have a case ID from the in-game support (like SD12345), include that too.'
    ],
    examples_bad: [
      'What happened?',
      'Let me check on that.'
    ],
    source_location: { source_name: 'CS-Customer Support x Tech support - Process-050126-012722.pdf', page: 6, section: 'Live games' }
  },
  {
    subcategory: 'Live Games',
    title: 'Live Games - Incorrect Payout Verification',
    intent: 'Verify incorrect payout claims before escalating live game issues.',
    rule_text: `When user claims live game bet wasn't paid correctly:

FIRST STEP: Gather evidence
- Screenshot from in-game history (or video proof)
- BET ID
- Detailed explanation of issue

VERIFY CLAIMS:
- Often the issue is user not placing intended bet
- In-game history screenshot helps clarify
- Compare claims with game rules

RESOLUTION:
- If user misunderstood rules/payouts, inform them
- If uncertainty remains, open Jira with bet ID, explanation, and evidence`,
    steps: [
      { step_number: 1, action: 'Request screenshot from in-game history and bet ID' },
      { step_number: 2, action: 'Get detailed explanation of the issue' },
      { step_number: 3, action: 'Verify claims - check if user placed intended bet' },
      { step_number: 4, action: 'Compare with game rules' },
      { step_number: 5, action: 'If misunderstanding, explain; if uncertain, open Jira' }
    ],
    allowed_actions: ['Request evidence', 'Verify bet placement', 'Compare with rules', 'Explain if misunderstanding', 'Open Jira if uncertain'],
    disallowed_actions: ['Open Jira without verifying claims', 'Dismiss without reviewing evidence'],
    tags: ['live_game', 'incorrect_payout', 'verification', 'in_game_history', 'game_rules', 'bet_placement'],
    severity_default: 'medium',
    evidence_requirements: 'Agent verifies claims before escalating. Checks if user placed intended bet.',
    examples_good: [
      'I\'d like to help verify this. Could you share a screenshot from your in-game history along with the bet ID? Often I can see exactly what bet was placed and the correct payout.',
      'Looking at your in-game history, I can see the bet was placed on X, not Y, which explains the different payout. The amount you received matches the correct payout for that bet.'
    ],
    examples_bad: [
      'I\'ll escalate this to our team right away.',
      'You should have received more, let me report this.'
    ],
    source_location: { source_name: 'CS-Customer Support x Tech support - Process-050126-012722.pdf', page: 7, section: 'Incorrect payout' }
  },
  {
    subcategory: 'Live Games',
    title: 'Live Games - Crypto to Fiat Conversion Impact',
    intent: 'Explain crypto/fiat conversion issues that cause bet rejections.',
    rule_text: `Crypto to Fiat conversion causes bet rejections due to rounding:

EXAMPLE:
- User has 0.0008192 BTC
- Conversion rate: $61,027.20 per BTC
- Actual balance: $49.996
- Displayed in game: $50 (fiat uses 2 decimal places)
- User tries to bet $50 → REJECTED (actual balance is $49.996)

WHY: Provider uses different conversion rate and rounds to 2 decimal places.

SOLUTION: Advise players NOT to place their entire balance on a bet. Instead, place bets slightly lower (e.g., $49.90) to avoid rejections due to insufficient funds.`,
    allowed_actions: ['Explain conversion/rounding issue', 'Advise betting slightly under balance', 'Provide example'],
    disallowed_actions: ['Open Jira for conversion issues', 'Claim system error'],
    tags: ['live_game', 'crypto', 'fiat', 'conversion', 'rounding', 'rejected_bet', 'insufficient_funds', 'decimal_places'],
    severity_default: 'low',
    evidence_requirements: 'Agent correctly explains the crypto/fiat conversion issue and advises betting under full balance.',
    examples_good: [
      'This happens because of how crypto converts to fiat. Your crypto balance might show as $50 in the game, but the actual value could be $49.996 due to rounding. Try betting $49.90 instead to avoid this.',
      'Live games display fiat with 2 decimal places, so small differences in conversion rates can cause rejections. I recommend betting slightly less than your full balance - for example $49.90 instead of $50.'
    ],
    examples_bad: [
      'There must be a bug with the balance display.',
      'Let me report this incorrect balance issue.'
    ],
    source_location: { source_name: 'CS-Customer Support x Tech support - Process-050126-012722.pdf', page: 7, section: 'Crypt > Fiat Conversion Impacts' }
  },
  {
    subcategory: 'Live Games',
    title: 'Live Games - Rejected and Cancelled Bets',
    intent: 'Handle rejected and cancelled bet inquiries properly.',
    rule_text: `Bets may be rejected or cancelled due to:
- Insufficient funds
- Conversion rate discrepancies
- Provider decisions
- Changes in game conditions
- Technical issues

IMPORTANT: Cancelled and rejected rounds typically do NOT generate:
- Details in game history
- Bet IDs

RESOLUTION:
- Screenshot or bet ID from PREVIOUS round is sufficient
- When rounds are rejected, NO funds are deducted
- No participation = no payout owed

We CAN investigate if users provide all necessary details. Include case ID in Jira for faster resolution.`,
    steps: [
      { step_number: 1, action: 'Explain possible reasons for rejection/cancellation' },
      { step_number: 2, action: 'Note that rejected rounds don\'t generate bet IDs' },
      { step_number: 3, action: 'Request screenshot from previous round if needed' },
      { step_number: 4, action: 'Explain no funds deducted = no payout owed' },
      { step_number: 5, action: 'If case ID provided, include in Jira for investigation' }
    ],
    allowed_actions: ['Explain rejection reasons', 'Request previous round screenshot', 'Explain no deduction = no payout', 'Open Jira with case ID'],
    disallowed_actions: ['Promise payout for rejected bet', 'Claim funds were taken incorrectly'],
    tags: ['live_game', 'rejected_bet', 'cancelled_bet', 'no_bet_id', 'no_funds_deducted', 'previous_round'],
    severity_default: 'medium',
    evidence_requirements: 'Agent explains that cancelled/rejected rounds have no bet ID and no funds deducted means no payout owed.',
    examples_good: [
      'Rejected and cancelled rounds typically don\'t generate bet IDs or appear in game history. Since no funds were deducted from your balance, there was no participation in that round, so no payout is owed. Do you have a screenshot from the round before?',
      'When a bet is rejected, it means it wasn\'t accepted, so no funds were taken and no payout applies. This can happen due to conversion rate differences or connection timing. Would you like me to investigate further with any case ID you received?'
    ],
    examples_bad: [
      'You should be paid for the cancelled round.',
      'Let me refund the rejected bet.'
    ],
    source_location: { source_name: 'CS-Customer Support x Tech support - Process-050126-012722.pdf', page: 7, section: 'Rejected Bets / Cancelled Games' }
  },
  {
    subcategory: 'Live Games',
    title: 'Live Games - Settlement Issues During Downtime',
    intent: 'Handle payout delays during server issues or downtime.',
    rule_text: `During poor server performance or Stake downtime:
- Players may experience delays in receiving payouts
- Especially common with Evolution bets
- If one player has this problem, others likely do too

RESOLUTION:
Create Jira ticket with:
- Bet ID (or game ID and coin pair if bet ID unavailable)
- Full-page screenshot of round from game history
- If user has case ID, include it for faster resolution`,
    steps: [
      { step_number: 1, action: 'Acknowledge possible server-related delay' },
      { step_number: 2, action: 'Request bet ID (or game ID + coin pair if unavailable)' },
      { step_number: 3, action: 'Request full-page screenshot from game history' },
      { step_number: 4, action: 'Ask for case ID if user contacted in-game support' },
      { step_number: 5, action: 'Create Jira ticket with all information' }
    ],
    allowed_actions: ['Acknowledge server issues', 'Request bet/game ID', 'Request screenshot', 'Create Jira ticket'],
    disallowed_actions: ['Promise immediate resolution', 'Deny server issues exist'],
    tags: ['live_game', 'settlement', 'delay', 'downtime', 'server_issues', 'evolution', 'jira'],
    severity_default: 'high',
    evidence_requirements: 'Agent creates Jira with bet ID (or game ID + coin pair), screenshot, and case ID if available.',
    examples_good: [
      'There may have been some server delays affecting payouts. I\'ll need your bet ID and a full screenshot from the game history to investigate. If you have a case ID from in-game support, please share that too.',
      'Settlement delays can occur during high server load, especially with Evolution games. Let me create a ticket with your bet ID and game history screenshot for our tech team.'
    ],
    examples_bad: [
      'Everything should be working fine.',
      'Just wait and it will probably show up.'
    ],
    source_location: { source_name: 'CS-Customer Support x Tech support - Process-050126-012722.pdf', page: 7, section: 'Settlement Issues' }
  },
  {
    subcategory: 'Live Games',
    title: 'Live Games - Decision Issues (AutoStand/Honest Decision)',
    intent: 'Explain AutoStand and Honest Decision outcomes in live games.',
    rule_text: `Decision issues may occur due to network latency or technical glitches.

When game history shows "AutoStand" or "Honest Decision":
- System decided because user did NOT respond before time expired
- Often caused by internet connection or browser issues
- Limited options for what we can address

RESOLUTION:
- Gather: specific game, round info, error messages, timestamps
- Request screenshot of game round from history
- Can open Jira case with bet ID and screenshot for detailed investigation

Note: These cases often have limited resolution options due to the nature of the timeout.`,
    steps: [
      { step_number: 1, action: 'Check if game history shows AutoStand or Honest Decision' },
      { step_number: 2, action: 'Explain this means user didn\'t respond in time' },
      { step_number: 3, action: 'Acknowledge likely connection/browser cause' },
      { step_number: 4, action: 'Gather game, round info, timestamps, screenshot' },
      { step_number: 5, action: 'Open Jira for investigation if user requests' }
    ],
    allowed_actions: ['Explain AutoStand/Honest Decision meaning', 'Acknowledge connection issues', 'Open Jira for investigation'],
    disallowed_actions: ['Promise payout change', 'Claim system error'],
    tags: ['live_game', 'decision', 'autostand', 'honest_decision', 'timeout', 'connection', 'browser'],
    severity_default: 'medium',
    evidence_requirements: 'Agent correctly explains AutoStand/Honest Decision means user didn\'t respond in time.',
    examples_good: [
      'The "Honest Decision" in your game history indicates the system made the decision because there was no response before the timer expired. This usually happens due to internet connection or browser issues on your end. I can open a case for investigation, but resolution options may be limited.',
      'AutoStand means the game automatically stood because no action was received in time. This is typically a connection timing issue rather than a game error. Would you like me to investigate further?'
    ],
    examples_bad: [
      'The game cheated you by making the wrong decision.',
      'We\'ll refund you for this system error.'
    ],
    source_location: { source_name: 'CS-Customer Support x Tech support - Process-050126-012722.pdf', page: 8, section: 'Decision Issue' }
  }
];

// ============================================================================
// MAIN SCRIPT
// ============================================================================

async function addGamesKnowledge() {
  console.log('\n==========================================');
  console.log('       GAMES KNOWLEDGE BUILDER');
  console.log('       (NAJBITNIJA KATEGORIJA)');
  console.log('==========================================\n');

  try {
    // Step 1: Create or update the main category
    console.log('Step 1: Creating/Updating Games category...');

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
    console.log('  - Stake Originals');
    console.log('  - Third-Party Slots');
    console.log('  - Live Games');
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
    await addGamesKnowledge();
    await mongoose.connection.close();
    console.log('Database connection closed.');
    process.exit(0);
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
};

run();
