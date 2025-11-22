const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const AI_MODEL = 'gpt-5-nano-2025-08-07'; // AI model for chat completions
const EMBEDDING_MODEL = 'text-embedding-ada-002';

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

module.exports = {
  generateEmbedding,
  generateElementEmbedding,
  extractElementText,
  cosineSimilarity,
  parseNaturalLanguageQuery,
  aiSearchAssistant
};
