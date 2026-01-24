const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const AI_MODEL = 'gpt-4o-mini'; // AI model for chat completions (fast & cost-effective)
const EMBEDDING_MODEL = 'text-embedding-3-small'; // Upgraded from ada-002: 5x cheaper, better performance

/**
 * Extract searchable text from canvas element
 * @param {Object} element - Canvas element
 * @param {Array} relatedElements - Elements in same wrapper (for context)
 */
const extractElementText = (element, relatedElements = []) => {
  const texts = [];

  // Helper to strip HTML tags
  const stripHtml = (html) => {
    if (!html) return '';
    return html.replace(/<[^>]*>/g, '').trim();
  };

  // Extract based on element type
  switch (element.type) {
    case 'title':
    case 'description':
      if (element.content?.value) {
        texts.push(stripHtml(element.content.value));
      }
      break;

    case 'macro':
      if (element.content?.title) {
        texts.push(`Title: ${stripHtml(element.content.title)}`);
      }
      if (element.content?.description) {
        texts.push(`Description: ${stripHtml(element.content.description)}`);
      }
      break;

    case 'example':
      // Get all examples
      if (element.content?.examples && element.content.examples.length > 0) {
        element.content.examples.forEach(example => {
          if (example.title) {
            texts.push(`Example: ${stripHtml(example.title)}`);
          }
          if (example.messages && example.messages.length > 0) {
            example.messages.forEach(msg => {
              if (msg.text) {
                texts.push(`${msg.type}: ${stripHtml(msg.text)}`);
              }
            });
          }
        });
      }
      break;

    case 'text':
    case 'subtext':
      if (element.content?.text) {
        texts.push(stripHtml(element.content.text));
      }
      break;

    case 'card':
      if (element.content?.title) {
        texts.push(stripHtml(element.content.title));
      }
      if (element.content?.text) {
        texts.push(stripHtml(element.content.text));
      }
      break;

    case 'sticky-note':
      if (element.content?.text) {
        texts.push(stripHtml(element.content.text));
      }
      break;

    case 'link':
      if (element.content?.url) {
        texts.push(`Link: ${element.content.url}`);
      }
      if (element.content?.title) {
        texts.push(element.content.title);
      }
      break;

    case 'image':
      if (element.content?.imageUrl) {
        texts.push('Image');
      }
      break;

    default:
      break;
  }

  // Add element type as context
  texts.unshift(`Type: ${element.type}`);

  // Add context from related elements in same wrapper
  if (relatedElements && relatedElements.length > 0) {
    const contextTexts = [];
    relatedElements.forEach(rel => {
      if (rel._id.toString() !== element._id.toString()) {
        // Add sibling element info for context
        const relType = rel.type;
        let relContent = '';

        if (rel.type === 'title' && rel.content?.value) {
          relContent = stripHtml(rel.content.value);
        } else if (rel.type === 'description' && rel.content?.value) {
          relContent = stripHtml(rel.content.value);
        } else if (rel.type === 'macro' && rel.content?.title) {
          relContent = stripHtml(rel.content.title);
        }

        if (relContent) {
          contextTexts.push(`Related ${relType}: ${relContent}`);
        }
      }
    });

    if (contextTexts.length > 0) {
      texts.push('\n--- Related Content ---');
      texts.push(...contextTexts);
    }
  }

  return texts.filter(t => t.trim().length > 0).join('\n');
};

/**
 * Generate OpenAI embedding for text
 * @param {string} text - Text to embed
 * @returns {Promise<number[]>} - Embedding vector (1536 dimensions)
 */
const generateEmbedding = async (text) => {
  if (!text || text.trim().length === 0) {
    return null;
  }

  try {
    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: text.substring(0, 8000) // OpenAI limit
    });

    return response.data[0].embedding;
  } catch (error) {
    console.error('Error generating embedding:', error);
    throw error;
  }
};

/**
 * Generate embedding for canvas element
 * @param {Object} element - Canvas element
 * @param {Array} allCanvasElements - All elements in canvas (for finding wrapper siblings)
 * @returns {Promise<number[]>} - Embedding vector
 */
const generateElementEmbedding = async (element, allCanvasElements = null) => {
  let relatedElements = [];

  // If element is in a wrapper, find sibling elements for context
  if (allCanvasElements && element.canvas) {
    // Find all wrappers that contain this element
    const wrappersContainingElement = allCanvasElements.filter(el =>
      el.type === 'wrapper' &&
      el.content?.childElements?.some(childId => childId.toString() === element._id.toString())
    );

    if (wrappersContainingElement.length > 0) {
      // Get all child element IDs from the wrapper
      const siblingIds = wrappersContainingElement[0].content.childElements || [];

      // Find sibling elements
      relatedElements = allCanvasElements.filter(el =>
        siblingIds.some(id => id.toString() === el._id.toString())
      );
    }
  }

  const text = extractElementText(element, relatedElements);
  return await generateEmbedding(text);
};

/**
 * Calculate cosine similarity between two vectors
 * @param {number[]} a - Vector A
 * @param {number[]} b - Vector B
 * @returns {number} - Similarity score (0-1)
 */
const cosineSimilarity = (a, b) => {
  if (!a || !b || a.length !== b.length) {
    return 0;
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);

  if (denominator === 0) {
    return 0;
  }

  return dotProduct / denominator;
};

/**
 * Parse natural language query using GPT and extract search parameters
 * @param {string} query - User's natural language query
 * @returns {Promise<Object>} - Parsed search parameters
 */
const parseNaturalLanguageQuery = async (query) => {
  try {
    const systemPrompt = `You are a search query parser for a visual workspace application.
Users can create various elements like cards, notes, titles, descriptions, macros, examples, images, links, etc.

Your job is to parse natural language queries and extract:
1. The refined search query (simplified, key terms)
2. Applicable filters (elementTypes, dateRange)
3. Search intent

Element types available: text, subtext, card, image, link, sticky-note, title, description, macro, example, wrapper

Respond ONLY with valid JSON in this format:
{
  "refinedQuery": "main search terms",
  "filters": {
    "elementTypes": ["type1", "type2"],
    "dateRange": {
      "preset": "today" | "last7days" | "last30days" | "thisMonth" | null,
      "custom": { "from": "YYYY-MM-DD", "to": "YYYY-MM-DD" } | null
    }
  },
  "intent": "description of what user wants to find"
}`;

    const response = await openai.chat.completions.create({
      model: AI_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Parse this search query: "${query}"` }
      ],
      max_completion_tokens: 1000
    });

    const content = response.choices[0].message.content.trim();

    // Check if response is empty
    if (!content) {
      console.warn('Empty response from AI model, using fallback');
      return {
        refinedQuery: query,
        filters: {
          elementTypes: [],
          dateRange: null
        },
        intent: 'search'
      };
    }

    // Extract JSON from response (handle markdown code blocks)
    let jsonStr = content;
    if (content.includes('```json')) {
      jsonStr = content.split('```json')[1].split('```')[0].trim();
    } else if (content.includes('```')) {
      jsonStr = content.split('```')[1].split('```')[0].trim();
    }

    // Check if jsonStr is empty after extraction
    if (!jsonStr) {
      console.warn('Empty JSON string after extraction, using fallback');
      return {
        refinedQuery: query,
        filters: {
          elementTypes: [],
          dateRange: null
        },
        intent: 'search'
      };
    }

    return JSON.parse(jsonStr);
  } catch (error) {
    console.error('Error parsing natural language query:', error);
    // Fallback: return original query
    return {
      refinedQuery: query,
      filters: {
        elementTypes: [],
        dateRange: null
      },
      intent: 'search'
    };
  }
};

/**
 * AI Search Assistant - conversational search help
 * @param {string} userMessage - User's message
 * @param {Array} conversationHistory - Previous messages
 * @param {Object} context - Search context (current results, filters, etc.)
 * @returns {Promise<Object>} - AI response with suggestions
 */
const aiSearchAssistant = async (userMessage, conversationHistory = [], context = {}) => {
  try {
    const hasResults = context.foundResults || false;
    const resultsCount = context.resultsCount || 0;

    const systemPrompt = `You are an intelligent search assistant for a visual workspace application.
Users work with various elements: cards, notes, titles, descriptions, macros, examples, images, links, etc.

Your role:
1. Help users find what they're looking for by understanding their intent
2. When search results are found, acknowledge them briefly and describe what was found
3. If no results, suggest alternative searches or ask clarifying questions
4. Be conversational, friendly, and concise (1-2 sentences max)

Current context:
- Search performed: ${hasResults ? 'YES' : 'NO'}
- Results found: ${resultsCount}
- Active filters: ${JSON.stringify(context.activeFilters || {})}

IMPORTANT:
- If results were found (${resultsCount} results), say something like "I found ${resultsCount} relevant elements for you!" or "Here are ${resultsCount} matches I discovered"
- Keep responses SHORT and conversational
- Don't list the results (they're shown separately as cards)
- Be enthusiastic when results are found!

Available element types: text, subtext, card, image, link, sticky-note, title, description, macro, example, wrapper`;

    const messages = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory,
      { role: 'user', content: userMessage }
    ];

    const response = await openai.chat.completions.create({
      model: AI_MODEL,
      messages: messages,
      max_completion_tokens: 1500
    });

    const assistantMessage = response.choices[0].message.content;

    // Validate that we got a non-empty response
    if (!assistantMessage || assistantMessage.trim().length === 0) {
      console.warn('AI returned empty message, using fallback');
      return {
        message: hasResults
          ? `I found ${resultsCount} results for you!`
          : "I couldn't find any matching results. Try adjusting your search terms.",
        suggestedFilters: null,
        suggestedQuery: null
      };
    }

    // Try to extract any suggested actions from the response
    const suggestions = {
      message: assistantMessage,
      suggestedFilters: null,
      suggestedQuery: null
    };

    // Simple pattern matching for suggestions (can be enhanced)
    if (assistantMessage.toLowerCase().includes('try searching for')) {
      const match = assistantMessage.match(/try searching for ["'](.+?)["']/i);
      if (match) {
        suggestions.suggestedQuery = match[1];
      }
    }

    return suggestions;
  } catch (error) {
    console.error('Error in AI search assistant:', error);
    return {
      message: "I'm having trouble processing your request right now. Please try refining your search manually.",
      suggestedFilters: null,
      suggestedQuery: null
    };
  }
};

/**
 * QA Assistant - specialized for QA ticket analysis and management
 * @param {string} userMessage - User's message
 * @param {Array} conversationHistory - Previous messages
 * @param {Array} tickets - Full ticket data with all fields
 * @param {Object} context - Additional context
 * @returns {Promise<Object>} - AI response
 */
const qaAssistant = async (userMessage, conversationHistory = [], tickets = [], context = {}) => {
  try {
    const ticketsData = tickets.map((t, idx) => ({
      number: idx + 1,
      id: t._id?.toString(),
      ticketId: t.ticketId,
      agent: t.agent?.name || 'Unknown',
      dateEntered: t.dateEntered,
      status: t.status,
      categories: t.categories || [],
      priority: t.priority,
      qualityScore: t.qualityScorePercent,
      notes: t.notes,
      feedback: t.feedback,
      shortDescription: t.shortDescription,
      isArchived: t.isArchived || false
    }));

    const systemPrompt = `You are a QA metrics assistant specialized in analyzing quality assurance tickets and agent performance.

You have access to ticket data with these fields:
- ticketId: Unique ticket identifier
- agent: Agent name who handled the ticket
- dateEntered: When ticket was created
- status: Current status (Graded, Pending, etc.)
- categories: Array of ticket categories (a ticket can have multiple categories)
- priority: Ticket priority
- qualityScore: Quality score percentage (0-100)
- notes: Internal notes added to the ticket
- feedback: Feedback provided for the ticket
- shortDescription: Brief description of the ticket
- isArchived: Whether the ticket is archived (true/false)

CAPABILITIES:
1. Analyze agent performance (average scores, ticket counts, trends)
2. Compare multiple tickets or agents
3. Extract and combine specific fields (e.g., merge feedback from multiple tickets)
4. Search within ticket notes and feedback
5. Provide statistical summaries
6. Answer questions about ticket data
7. List all tickets for a specific agent (including archived tickets)
8. Filter and display archived tickets

IMPORTANT INSTRUCTIONS:
- When user asks for specific data (notes, feedback, descriptions), provide the COMPLETE, UNEDITED text
- When user asks to "combine" or "merge" data, concatenate all requested fields together
- When user asks for analysis, provide detailed insights with specific numbers and examples
- When user asks to paste/show something, output the EXACT text without summarizing
- When user asks for "all tickets" for an agent, list ALL tickets including archived ones
- When displaying ticket lists, show: ticketId, agent, status, date, quality score, and categories
- Be conversational but precise
- If you don't have enough data, say so clearly

Current context:
- Total tickets available: ${ticketsData.length}
- User request: Analyze and respond based on the ticket data provided below`;

    const ticketsJson = JSON.stringify(ticketsData, null, 2);

    const messages = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory,
      {
        role: 'user',
        content: `${userMessage}\n\n--- TICKET DATA ---\n${ticketsJson}`
      }
    ];

    const response = await openai.chat.completions.create({
      model: AI_MODEL,
      messages: messages,
      max_completion_tokens: 3000 // Increased for longer responses
    });

    const assistantMessage = response.choices[0].message.content;

    if (!assistantMessage || assistantMessage.trim().length === 0) {
      console.warn('QA Assistant returned empty message');
      return {
        message: ticketsData.length > 0
          ? `I have ${ticketsData.length} tickets but couldn't generate a proper analysis. Please try rephrasing your question.`
          : "I don't have any ticket data to analyze.",
        suggestedFilters: null
      };
    }

    return {
      message: assistantMessage,
      suggestedFilters: null
    };
  } catch (error) {
    console.error('Error in QA assistant:', error);
    return {
      message: "I encountered an error while analyzing the tickets. Please try again.",
      suggestedFilters: null
    };
  }
};

/**
 * Generate a one-sentence summary of a ticket issue for agent tracking
 * @param {Object} ticket - Ticket data with notes, feedback, categories
 * @returns {Promise<string>} - One-sentence summary
 */
const summarizeTicketIssue = async (ticket) => {
  try {
    const stripHtml = (html) => {
      if (!html) return '';
      return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    };

    const notes = stripHtml(ticket.notes) || 'No notes';
    const feedback = stripHtml(ticket.feedback) || 'No feedback';
    const categories = (ticket.categories || []).join(', ') || 'Unknown';

    const prompt = `Based on the following QA ticket review, write ONE SHORT sentence (max 15 words) summarizing what the agent did wrong. Be specific and actionable.

Categories: ${categories}
Notes: ${notes}
Feedback: ${feedback}

Write ONLY the summary sentence, nothing else. Example format: "Failed to verify customer identity before processing refund request."`;

    const response = await openai.chat.completions.create({
      model: AI_MODEL,
      messages: [
        { role: 'user', content: prompt }
      ],
      max_completion_tokens: 100
    });

    const summary = response.choices[0].message.content?.trim();
    return summary || 'Issue details unavailable';
  } catch (error) {
    console.error('Error summarizing ticket issue:', error);
    return 'Issue details unavailable';
  }
};

/**
 * Generate summary for a single agent's graded tickets
 * @param {string} agentName - Name of the agent
 * @param {Array} tickets - Array of tickets with ticketId, notes, feedback, score, categories
 * @returns {Promise<string>} - Summary text for this agent
 */
const generateAgentSummary = async (agentName, tickets) => {
  try {
    const stripHtml = (html) => {
      if (!html) return '';
      return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    };

    // Prepare ticket data - truncate long notes/feedback to save tokens
    const ticketData = tickets.map(t => ({
      ticketId: t.ticketId,
      notes: stripHtml(t.notes).substring(0, 500),
      feedback: stripHtml(t.feedback).substring(0, 500),
      score: t.score,
      categories: t.categories || []
    }));

    console.log(`[generateAgentSummary] Preparing summary for ${agentName}, ${ticketData.length} tickets`);

    // Check if all tickets are 100%
    const allPerfect = ticketData.every(t => t.score === 100);

    const systemPrompt = `Ti si QA summary asistent. Pišeš KRATKE sažetke grešaka agenata na SRPSKOM jeziku u TREĆEM LICU.

PRAVILA:
- Piši u TREĆEM LICU (npr. "Savetovao je...", "Nije proverio...", "Pogrešio je...")
- Ako su svi tiketi 100%: Napiši samo "Sve lepo odradjeno, ne pravi nikakve greske."
- Ako ima grešaka: Opiši UKRATKO šta je agent pogrešio - NE objašnjavaj šta je trebalo da uradi
- NIKADA ne piši ID tiketa
- NIKADA ne piši procente
- NIKADA ne pravi listu - piši u jednom ili dva paragrafa
- Budi KRATAK i KONKRETAN
- Možeš koristiti emotikone :D ili :/ gde je prikladno
- Ako ima više grešaka, spoji ih prirodno u tekst
- Na kraju možeš dodati "Ostalo je okej." ili "Sve u svemu dobro radi." ako ima i dobrih stvari

VAŽNO - STIL PISANJA:
- Koristi ISTI stil pisanja kao u feedback-u koji ti je dat za svaki tiket
- Ako u feedback-u piše na određeni način, ti piši summary na isti način
- Imitiraj ton i formulacije iz feedback-a

VAŽNO - ENGLESKI TERMINI:
- Pisi na srpskom ALI sve termine vezane za platformu OSTAVI NA ENGLESKOM
- Primeri termina koji MORAJU biti na engleskom: deposit, withdraw, gambling limit, self-exclusion, KYC, verification, bonus, wagering, cashout, balance, account, wallet, crypto, affiliate, conversion, role, troubleshooting, ACP, W role, etc.
- Nemoj prevoditi ove termine - piši ih tačno onako kako su napisani u feedback-u

PRIMERI DOBROG STILA:
"Savetovao korisnika da prvo povuce crypto na external wallet umesto direktno na drugi stake account, za cime nije bilo razloga. Ostalo je okej."

"Postavio W role za OntarioBlocked issue umesto da posalje troubleshooting steps :/ Takodje nije najbolje objasnio moonpay/swapped opcije. Sve u svemu ima znanja ali se ponekad zbuni."

"Rekla korisniku da deposit ceka umesto da proveri zasto amount nije tacan na ACP-u :D Mala greskica sa ARS conversion za affiliate. Ostalo okej."

"Sve lepo odradjeno, ne pravi nikakve greske."

Odgovori SAMO sa kratkim opisom, bez headera, bez liste.`;

    const userPrompt = `Agent: ${agentName}
Broj tiketa: ${ticketData.length}

Tiketi:
${JSON.stringify(ticketData, null, 2)}

Napiši kratak sažetak za ovog agenta. ${allPerfect ? 'Svi tiketi su 100%.' : 'Neki tiketi nisu 100%, opiši greške.'}`;

    console.log(`[generateAgentSummary] Calling OpenAI for ${agentName}...`);

    const response = await openai.chat.completions.create({
      model: 'gpt-5-nano-2025-08-07',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      max_completion_tokens: 10000
    });

    console.log(`[generateAgentSummary] OpenAI response for ${agentName}:`, JSON.stringify(response.choices[0], null, 2));

    const summary = response.choices[0].message.content?.trim();

    if (!summary) {
      console.warn(`[generateAgentSummary] Empty summary returned for ${agentName}`);
    } else {
      console.log(`[generateAgentSummary] Got summary for ${agentName}: ${summary.substring(0, 100)}...`);
    }

    return summary || null;
  } catch (error) {
    console.error(`[generateAgentSummary] ERROR for ${agentName}:`, error.message);
    console.error(`[generateAgentSummary] Full error:`, error);
    return null;
  }
};

/**
 * Generate coaching suggested actions for an agent based on their performance data
 * @param {Object} agentData - Agent performance data
 * @returns {Promise<Array>} - Array of suggested action strings
 */
const generateCoachingSuggestions = async (agentData) => {
  try {
    const { agentName, avgScore, trend, topIssueCategories, scorecardWeaknesses, ticketExamples } = agentData;

    const systemPrompt = `Ti si QA coaching asistent. Na osnovu performance podataka agenta, generiši 3-5 KONKRETNIH i AKCIONABILNIH preporuka za poboljšanje.

PRAVILA:
- Piši na SRPSKOM jeziku
- Svaka preporuka treba da bude konkretna akcija koju agent može preduzeti
- Koristi podatke iz scorecard weakness-a i kategorija sa najviše problema
- Ne koristi generičke savete - budi specifičan na osnovu podataka
- Termini vezani za platformu ostaju na engleskom (KYC, ACP, deposit, withdrawal, etc.)
- Format: Kratka rečenica, direktna i jasna

PRIMERI DOBRIH PREPORUKA:
- "Proći kroz training materijal za Crypto Withdrawals - fokus na blockchain confirmation times"
- "Uvežbati korišćenje ACP-a za proveru deposit statusa pre odgovora korisniku"
- "Proći refresher za VIP program benefite sa seniorom ili TL-om"
- "Obratiti pažnju na opening message - pozdrav mora biti personalizovan"`;

    const userPrompt = `Agent: ${agentName}
Prosečan score: ${avgScore}%
Trend: ${trend}

Kategorije sa najviše problema:
${topIssueCategories.map(c => `- ${c.name}: ${c.count} tiketa`).join('\n')}

Scorecard slabosti (najniže ocene):
${scorecardWeaknesses.map(s => `- ${s.name}: ${s.avgScore}%`).join('\n')}

Primeri tiketa sa greškama:
${ticketExamples.slice(0, 3).map(t => `- Score ${t.score}%, Kategorije: ${t.categories.join(', ')}, Feedback: ${t.feedbackPreview}`).join('\n')}

Generiši 3-5 konkretnih preporuka za ovog agenta. Odgovori SAMO sa JSON array string-ova, bez dodatnog teksta.
Primer formata: ["Preporuka 1", "Preporuka 2", "Preporuka 3"]`;

    const response = await openai.chat.completions.create({
      model: AI_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      max_tokens: 5000
    });

    const content = response.choices[0].message.content?.trim();
    console.log('[Coaching AI] Response content:', content?.substring(0, 200));

    if (!content) {
      console.log('[Coaching AI] Empty content received');
      return ['Nema dovoljno podataka za generisanje preporuka.'];
    }

    // Parse JSON response
    try {
      let jsonStr = content;
      if (content.includes('```json')) {
        jsonStr = content.split('```json')[1].split('```')[0].trim();
      } else if (content.includes('```')) {
        jsonStr = content.split('```')[1].split('```')[0].trim();
      }

      const suggestions = JSON.parse(jsonStr);
      return Array.isArray(suggestions) ? suggestions : [content];
    } catch (parseError) {
      // If JSON parsing fails, return the content as a single suggestion
      return [content];
    }
  } catch (error) {
    console.error('[Coaching AI] Error generating suggestions:', error.message);
    console.error('[Coaching AI] Full error:', error);
    return ['Greška pri generisanju preporuka. Pokušajte ponovo.'];
  }
};

module.exports = {
  generateEmbedding,
  generateElementEmbedding,
  extractElementText,
  cosineSimilarity,
  parseNaturalLanguageQuery,
  aiSearchAssistant,
  qaAssistant,
  summarizeTicketIssue,
  generateAgentSummary,
  generateCoachingSuggestions
};
