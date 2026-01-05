/**
 * Guardrail Rule Engine - Lokalni if/then checks za kritične uslove
 * BEZ AI, brzo i determinističko
 * Prema specifikaciji: Section 7
 */

/**
 * Guardrail pravila - svako pravilo ima:
 * - id: jedinstveni identifikator
 * - name: naziv pravila
 * - description: opis šta proverava
 * - severity: critical, high, medium, low
 * - check: funkcija koja vraća { triggered: boolean, finding: object | null }
 */
const GUARDRAIL_RULES = [
  // ========================================
  // AUTH / PASSWORD RESET GUARDRAILS
  // ========================================
  {
    id: 'GR_NO_PASSWORD_RESET_LINK',
    name: 'No Password Reset for Social Login',
    description: 'Agent ne sme slati reset password link korisniku koji nema password (Google/Apple/Facebook login)',
    severity: 'critical',
    check: (ticketFacts, transcript, agentActions) => {
      // Uslov: has_password = false ILI auth_method je social
      const noPassword = ticketFacts.has_password === 'false';
      const socialLogin = ['google', 'apple', 'facebook'].includes(ticketFacts.account_auth_method);

      if (!noPassword && !socialLogin) {
        return { triggered: false, finding: null };
      }

      // Proveri da li je agent poslao reset password link ili instrukcije
      const resetIndicators = [
        'reset your password',
        'reset link',
        'password reset',
        'forgot password link',
        'change your password',
        '/reset-password',
        '/forgot-password'
      ];

      // Pretraži agent poruke i linkove
      const agentMessages = transcript.filter(m => m.speaker === 'agent');
      const allAgentText = agentMessages.map(m => m.text.toLowerCase()).join(' ');
      const allLinks = (agentActions.links_sent || []).map(l => l.toLowerCase()).join(' ');

      const foundResetIndicator = resetIndicators.some(indicator =>
        allAgentText.includes(indicator) || allLinks.includes(indicator)
      );

      if (foundResetIndicator) {
        return {
          triggered: true,
          finding: {
            type: 'violation',
            severity: 'critical',
            rule_id: 'GR_NO_PASSWORD_RESET_LINK',
            rule_title: 'No Password Reset for Social Login',
            explanation: `Agent je poslao reset password instrukcije/link, ali korisnik koristi ${ticketFacts.account_auth_method || 'social'} login i nema password. Ovo je kritična greška.`,
            recommended_fix: 'Objasniti korisniku da se prijavljuje preko social login-a i uputiti na odgovarajuću proceduru za account access.',
            ticket_evidence: agentMessages
              .filter(m => resetIndicators.some(i => m.text.toLowerCase().includes(i)))
              .slice(0, 3)
              .map(m => ({
                message_id: m.message_id,
                speaker: m.speaker,
                excerpt: m.text.substring(0, 200)
              }))
          }
        };
      }

      return { triggered: false, finding: null };
    }
  },

  {
    id: 'GR_SELF_EXCLUDED_GAMBLING_ADVICE',
    name: 'No Gambling Advice for Self-Excluded',
    description: 'Agent ne sme davati gambling savete self-excluded korisniku',
    severity: 'critical',
    check: (ticketFacts, transcript, agentActions) => {
      if (ticketFacts.account_restriction_state !== 'self_excluded') {
        return { triggered: false, finding: null };
      }

      const gamblingTerms = [
        'place a bet',
        'bonus',
        'free spins',
        'deposit bonus',
        'casino',
        'slots',
        'betting tips',
        'odds',
        'wager',
        'gambling',
        'play now'
      ];

      const agentMessages = transcript.filter(m => m.speaker === 'agent');
      const allAgentText = agentMessages.map(m => m.text.toLowerCase()).join(' ');

      const foundGamblingTerm = gamblingTerms.find(term => allAgentText.includes(term));

      if (foundGamblingTerm) {
        return {
          triggered: true,
          finding: {
            type: 'violation',
            severity: 'critical',
            rule_id: 'GR_SELF_EXCLUDED_GAMBLING_ADVICE',
            rule_title: 'No Gambling Advice for Self-Excluded',
            explanation: `Agent je koristio gambling terminologiju ("${foundGamblingTerm}") u razgovoru sa self-excluded korisnikom. Ovo je kritična greška i potencijalno kršenje regulativa.`,
            recommended_fix: 'Ne pružati nikakve gambling savete, bonuse ili promocije self-excluded korisnicima. Uputiti na responsible gambling resurse ako je potrebno.',
            ticket_evidence: agentMessages
              .filter(m => gamblingTerms.some(t => m.text.toLowerCase().includes(t)))
              .slice(0, 3)
              .map(m => ({
                message_id: m.message_id,
                speaker: m.speaker,
                excerpt: m.text.substring(0, 200)
              }))
          }
        };
      }

      return { triggered: false, finding: null };
    }
  },

  {
    id: 'GR_REGION_ON_RESTRICTIONS',
    name: 'Ontario Region Restrictions',
    description: 'Provera da li agent poštuje Ontario regulativu',
    severity: 'high',
    check: (ticketFacts, transcript, agentActions) => {
      const isOntario = (ticketFacts.region_flags || []).includes('ON');
      if (!isOntario) {
        return { triggered: false, finding: null };
      }

      // Ontario zabranjene stvari
      const ontarioRestricted = [
        'inducement',
        'free bet',
        'no deposit bonus',
        'promotional credit',
        'bonus rollover waive'
      ];

      const agentMessages = transcript.filter(m => m.speaker === 'agent');
      const allAgentText = agentMessages.map(m => m.text.toLowerCase()).join(' ');

      const foundRestricted = ontarioRestricted.find(term => allAgentText.includes(term));

      if (foundRestricted) {
        return {
          triggered: true,
          finding: {
            type: 'violation',
            severity: 'high',
            rule_id: 'GR_REGION_ON_RESTRICTIONS',
            rule_title: 'Ontario Region Restrictions',
            explanation: `Agent je ponudio "${foundRestricted}" korisniku iz Ontario regije, što je zabranjeno Ontario regulativom.`,
            recommended_fix: 'Proveriti Ontario-specifične restrikcije pre nuđenja bonusa ili promocija. Ontario korisnicima nisu dozvoljeni određeni tipovi inducements.',
            ticket_evidence: agentMessages
              .filter(m => ontarioRestricted.some(t => m.text.toLowerCase().includes(t)))
              .slice(0, 2)
              .map(m => ({
                message_id: m.message_id,
                speaker: m.speaker,
                excerpt: m.text.substring(0, 200)
              }))
          }
        };
      }

      return { triggered: false, finding: null };
    }
  },

  {
    id: 'GR_KYC_REJECTED_WITHDRAWAL',
    name: 'KYC Rejected Withdrawal Handling',
    description: 'Provera pravilnog postupanja sa korisnicima kojima je KYC odbijen',
    severity: 'high',
    check: (ticketFacts, transcript, agentActions) => {
      if (ticketFacts.kyc_state !== 'rejected') {
        return { triggered: false, finding: null };
      }

      // Ako je withdrawal tema i KYC rejected, agent mora da objasni resubmission
      const withdrawalMentioned = transcript.some(m =>
        m.text.toLowerCase().includes('withdraw') ||
        m.text.toLowerCase().includes('withdrawal') ||
        m.text.toLowerCase().includes('cash out')
      );

      if (!withdrawalMentioned) {
        return { triggered: false, finding: null };
      }

      // Proveri da li je agent objasnio KYC resubmission
      const agentMessages = transcript.filter(m => m.speaker === 'agent');
      const allAgentText = agentMessages.map(m => m.text.toLowerCase()).join(' ');

      const resubmissionMentioned =
        allAgentText.includes('resubmit') ||
        allAgentText.includes('upload again') ||
        allAgentText.includes('new document') ||
        allAgentText.includes('verification rejected');

      if (!resubmissionMentioned) {
        return {
          triggered: true,
          finding: {
            type: 'potential_violation',
            severity: 'high',
            rule_id: 'GR_KYC_REJECTED_WITHDRAWAL',
            rule_title: 'KYC Rejected Withdrawal Handling',
            explanation: 'Korisnik ima odbijen KYC i pita o withdrawal-u, ali agent nije jasno objasnio potrebu za resubmission dokumenata.',
            recommended_fix: 'Jasno objasniti korisniku zašto je KYC odbijen i koje dokumente treba ponovo uploadovati.',
            verification_needed: true,
            what_to_verify: 'Proveriti da li je agent u nekom drugom delu razgovora objasnio KYC resubmission proceduru.',
            why_uncertain: 'Moguće da je objašnjenje dato u delu razgovora koji nije uhvaćen ovom proverom.'
          }
        };
      }

      return { triggered: false, finding: null };
    }
  },

  {
    id: 'GR_COOLING_OFF_PERIOD',
    name: 'Cooling Off Period Handling',
    description: 'Provera postupanja sa korisnicima u cooling off periodu',
    severity: 'high',
    check: (ticketFacts, transcript, agentActions) => {
      if (ticketFacts.account_restriction_state !== 'cooling_off') {
        return { triggered: false, finding: null };
      }

      // Ne sme se pomagati sa gamingom
      const helpWithGaming = [
        'can help you with',
        'let me check your',
        'your balance',
        'your bets',
        'active promotions'
      ];

      const agentMessages = transcript.filter(m => m.speaker === 'agent');
      const allAgentText = agentMessages.map(m => m.text.toLowerCase()).join(' ');

      const foundGamingHelp = helpWithGaming.find(term => allAgentText.includes(term));

      if (foundGamingHelp) {
        return {
          triggered: true,
          finding: {
            type: 'potential_violation',
            severity: 'high',
            rule_id: 'GR_COOLING_OFF_PERIOD',
            rule_title: 'Cooling Off Period Handling',
            explanation: `Agent je ponudio pomoć sa gaming funkcionalnostima ("${foundGamingHelp}") korisniku koji je u cooling-off periodu.`,
            recommended_fix: 'Tokom cooling-off perioda, pomoć treba ograničiti na responsible gambling podršku i neophodno account upravljanje.',
            verification_needed: true,
            what_to_verify: 'Proveriti kontekst - da li je korisnik pitao o svom account statusu ili cooling-off end date.',
            why_uncertain: 'Neka pitanja o accountu su dozvoljena i tokom cooling-off perioda.'
          }
        };
      }

      return { triggered: false, finding: null };
    }
  }
];

/**
 * Pokreni sve guardrail provere
 * @param {Object} ticketFacts - TicketFacts objekat
 * @param {Object[]} transcript - Lista poruka
 * @param {Object} agentActions - Agent akcije
 * @returns {Object[]} - Lista triggered findings
 */
function runAllGuardrails(ticketFacts, transcript, agentActions = {}) {
  const findings = [];

  for (const rule of GUARDRAIL_RULES) {
    try {
      const result = rule.check(ticketFacts, transcript, agentActions);

      if (result.triggered && result.finding) {
        findings.push({
          ...result.finding,
          guardrail_id: rule.id,
          guardrail_name: rule.name
        });
      }
    } catch (error) {
      console.error(`Guardrail ${rule.id} error:`, error);
    }
  }

  return findings;
}

/**
 * Pokreni specifične guardrails po ID-u
 * @param {string[]} ruleIds - Lista rule ID-eva
 * @param {Object} ticketFacts - TicketFacts objekat
 * @param {Object[]} transcript - Lista poruka
 * @param {Object} agentActions - Agent akcije
 * @returns {Object[]} - Lista triggered findings
 */
function runGuardrailsByIds(ruleIds, ticketFacts, transcript, agentActions = {}) {
  const findings = [];

  for (const ruleId of ruleIds) {
    const rule = GUARDRAIL_RULES.find(r => r.id === ruleId);
    if (!rule) continue;

    try {
      const result = rule.check(ticketFacts, transcript, agentActions);

      if (result.triggered && result.finding) {
        findings.push({
          ...result.finding,
          guardrail_id: rule.id,
          guardrail_name: rule.name
        });
      }
    } catch (error) {
      console.error(`Guardrail ${rule.id} error:`, error);
    }
  }

  return findings;
}

/**
 * Odredi koje guardrails treba pokrenuti na osnovu TicketFacts
 * @param {Object} ticketFacts - TicketFacts objekat
 * @returns {string[]} - Lista relevantnih guardrail ID-eva
 */
function getRelevantGuardrails(ticketFacts) {
  const relevant = [];

  // Password/Auth related
  if (ticketFacts.has_password === 'false' ||
      ['google', 'apple', 'facebook'].includes(ticketFacts.account_auth_method)) {
    relevant.push('GR_NO_PASSWORD_RESET_LINK');
  }

  // Self-exclusion
  if (ticketFacts.account_restriction_state === 'self_excluded') {
    relevant.push('GR_SELF_EXCLUDED_GAMBLING_ADVICE');
  }

  // Cooling off
  if (ticketFacts.account_restriction_state === 'cooling_off') {
    relevant.push('GR_COOLING_OFF_PERIOD');
  }

  // Ontario
  if ((ticketFacts.region_flags || []).includes('ON')) {
    relevant.push('GR_REGION_ON_RESTRICTIONS');
  }

  // KYC rejected
  if (ticketFacts.kyc_state === 'rejected') {
    relevant.push('GR_KYC_REJECTED_WITHDRAWAL');
  }

  return relevant;
}

/**
 * Quick check - samo relevantne guardrails
 * @param {Object} ticketFacts - TicketFacts objekat
 * @param {Object[]} transcript - Lista poruka
 * @param {Object} agentActions - Agent akcije
 * @returns {Object[]} - Lista triggered findings
 */
function quickGuardrailCheck(ticketFacts, transcript, agentActions = {}) {
  const relevantIds = getRelevantGuardrails(ticketFacts);

  if (relevantIds.length === 0) {
    return [];
  }

  return runGuardrailsByIds(relevantIds, ticketFacts, transcript, agentActions);
}

/**
 * Dodaj custom guardrail pravilo
 * @param {Object} rule - Guardrail rule objekat
 */
function addCustomGuardrail(rule) {
  if (!rule.id || !rule.check || typeof rule.check !== 'function') {
    throw new Error('Invalid guardrail rule format');
  }

  // Proveri da li već postoji
  const existingIndex = GUARDRAIL_RULES.findIndex(r => r.id === rule.id);
  if (existingIndex >= 0) {
    GUARDRAIL_RULES[existingIndex] = rule;
  } else {
    GUARDRAIL_RULES.push(rule);
  }
}

/**
 * Lista svih guardrail pravila
 * @returns {Object[]} - Lista pravila (bez check funkcija)
 */
function listGuardrails() {
  return GUARDRAIL_RULES.map(r => ({
    id: r.id,
    name: r.name,
    description: r.description,
    severity: r.severity
  }));
}

module.exports = {
  runAllGuardrails,
  runGuardrailsByIds,
  getRelevantGuardrails,
  quickGuardrailCheck,
  addCustomGuardrail,
  listGuardrails,
  GUARDRAIL_RULES
};
