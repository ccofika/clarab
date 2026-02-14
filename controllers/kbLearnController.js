const OpenAI = require('openai');
const KBPage = require('../models/KBPage');
const KBLearnHistory = require('../models/KBLearnHistory');
const logger = require('../utils/logger');
const { extractBlockText, stripMarkdown } = require('../utils/kbTextExtractor');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/**
 * Build a section map from a page's blocks.
 * Groups text content under each heading for targeted quiz generation.
 */
function buildSectionMap(page) {
  const sections = [];
  let currentSection = {
    headingId: null,
    headingText: page.title,
    slug: page.slug,
    pageTitle: page.title,
    text: ''
  };

  for (const block of (page.blocks || [])) {
    if (['heading_1', 'heading_2', 'heading_3'].includes(block.type)) {
      // Save previous section if it has text
      if (currentSection.text.trim()) {
        sections.push(currentSection);
      }
      currentSection = {
        headingId: block.id,
        headingText: extractBlockText(block) || 'Untitled Section',
        slug: page.slug,
        pageTitle: page.title,
        text: ''
      };
    } else {
      const blockText = extractBlockText(block);
      if (blockText) {
        currentSection.text += ' ' + blockText;
      }
    }
  }

  // Push final section
  if (currentSection.text.trim()) {
    sections.push(currentSection);
  }

  return sections;
}

/**
 * GET /learn/categories
 * Returns root pages with their direct children for category selection.
 */
exports.getLearnCategories = async (req, res) => {
  try {
    const rootPages = await KBPage.find({
      parentPage: null,
      isDeleted: false,
      isPublished: true
    })
      .select('title slug icon order')
      .sort({ order: 1 })
      .lean();

    const categories = [];
    for (const root of rootPages) {
      const children = await KBPage.find({
        parentPage: root._id,
        isDeleted: false,
        isPublished: true
      })
        .select('title slug icon order')
        .sort({ order: 1 })
        .lean();

      categories.push({
        _id: root._id,
        title: root.title,
        slug: root.slug,
        icon: root.icon,
        children
      });
    }

    res.json(categories);
  } catch (error) {
    logger.error('Error fetching learn categories:', error);
    res.status(500).json({ message: 'Error fetching categories' });
  }
};

/**
 * POST /learn/generate-quiz
 * Generates quiz questions from selected KB pages using AI.
 */
exports.generateQuiz = async (req, res) => {
  try {
    const { pageIds, userNote } = req.body;

    if (!pageIds || !Array.isArray(pageIds) || pageIds.length === 0) {
      return res.status(400).json({ message: 'At least one page must be selected' });
    }

    // Fetch selected pages with full blocks
    const pages = await KBPage.find({
      _id: { $in: pageIds },
      isDeleted: false,
      isPublished: true
    }).lean();

    if (pages.length === 0) {
      return res.status(404).json({ message: 'No valid pages found' });
    }

    // Build section map from all pages
    let allSections = [];
    for (const page of pages) {
      const pageSections = buildSectionMap(page);
      allSections.push(...pageSections);
    }

    // Filter out sections with very little text (< 50 chars)
    allSections = allSections.filter(s => s.text.trim().length >= 50);

    if (allSections.length === 0) {
      return res.status(400).json({ message: 'Selected pages do not have enough text content to generate a quiz' });
    }

    // Calculate question count: ~60% of sections, 2-5 per page, capped at 30
    const questionsPerPage = {};
    for (const section of allSections) {
      const key = section.slug;
      questionsPerPage[key] = (questionsPerPage[key] || 0) + 1;
    }

    let totalQuestions = 0;
    for (const slug of Object.keys(questionsPerPage)) {
      const sectionCount = questionsPerPage[slug];
      const pageQuestions = Math.max(2, Math.min(5, Math.ceil(sectionCount * 0.6)));
      questionsPerPage[slug] = pageQuestions;
      totalQuestions += pageQuestions;
    }
    totalQuestions = Math.min(totalQuestions, 30);

    // Truncate section text for token limits
    const sectionsForPrompt = allSections.map((s, i) => ({
      ...s,
      text: s.text.substring(0, 2000),
      index: i + 1
    }));

    // Build AI prompt
    const systemPrompt = `You are a quiz generator for a customer support knowledge base. Generate multiple-choice quiz questions that test COMPREHENSION, not just recall.

Rules:
- Each question must test understanding of a concept, process, or policy
- Mix difficulty levels: some straightforward, some requiring inference
- Each question has exactly 4 answer choices labeled a, b, c, d
- Exactly one correct answer per question
- Wrong answers must be plausible but clearly incorrect to someone who read the material
- Each question must reference the specific section it was generated from using the provided section index
- Questions should cover different topics across the content
- Write questions and answers in the same language as the source content
${userNote ? `\nThe user specifically wants to focus on: "${userNote}". Prioritize generating questions about this topic, but still cover other areas.` : ''}

Respond with valid JSON only.`;

    const userPrompt = `Generate exactly ${totalQuestions} quiz questions from the following knowledge base content.

Content sections:
${sectionsForPrompt.map(s => `
--- Section ${s.index} ---
Page: ${s.pageTitle}
Heading: ${s.headingText}
Page Slug: ${s.slug}
Heading ID: ${s.headingId || 'none'}
Content: ${s.text}
`).join('\n')}

Return JSON in this exact format:
{
  "questions": [
    {
      "id": "q1",
      "question": "Question text here?",
      "choices": [
        { "id": "a", "text": "Choice A" },
        { "id": "b", "text": "Choice B" },
        { "id": "c", "text": "Choice C" },
        { "id": "d", "text": "Choice D" }
      ],
      "correctAnswer": "b",
      "explanation": "Brief explanation of why this is correct",
      "sectionIndex": 1,
      "difficulty": "easy"
    }
  ]
}

difficulty must be one of: "easy", "medium", "hard"`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-5-nano-2025-08-07',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      max_completion_tokens: 8000,
      response_format: { type: 'json_object' }
    });

    const aiResponse = JSON.parse(completion.choices[0].message.content);

    // Map section references back to the questions
    const questions = (aiResponse.questions || []).map((q, idx) => {
      const sectionIdx = (q.sectionIndex || 1) - 1;
      const section = sectionsForPrompt[sectionIdx] || sectionsForPrompt[0];

      return {
        id: q.id || `q${idx + 1}`,
        question: q.question,
        choices: q.choices,
        correctAnswer: q.correctAnswer,
        explanation: q.explanation,
        difficulty: q.difficulty || 'medium',
        sectionRef: {
          pageSlug: section.slug,
          headingId: section.headingId ? `kb-h-${section.headingId}` : null,
          pageTitle: section.pageTitle,
          sectionTitle: section.headingText
        }
      };
    });

    const quizId = `quiz_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    logger.info(`Quiz generated: ${quizId}, ${questions.length} questions for user ${req.user._id}`);

    res.json({
      quiz: {
        id: quizId,
        generatedAt: new Date().toISOString(),
        totalQuestions: questions.length,
        questions,
        sourcePages: pages.map(p => ({ _id: p._id, title: p.title, slug: p.slug }))
      }
    });
  } catch (error) {
    logger.error('Error generating quiz:', error);
    res.status(500).json({ message: 'Error generating quiz. Please try again.' });
  }
};

/**
 * POST /learn/history
 * Save a completed or abandoned quiz to history.
 */
exports.saveHistory = async (req, res) => {
  try {
    const { quizId, status, totalQuestions, firstTryCorrect, scorePercent,
            sourcePages, userNote, questions, wrongQuestionIds, startedAt } = req.body;

    if (!quizId || !status) {
      return res.status(400).json({ message: 'quizId and status are required' });
    }

    const entry = await KBLearnHistory.create({
      user: req.user._id,
      quizId,
      status,
      totalQuestions: totalQuestions || 0,
      firstTryCorrect: firstTryCorrect || 0,
      scorePercent: scorePercent || 0,
      sourcePages: sourcePages || [],
      userNote: userNote || '',
      questions: questions || [],
      wrongQuestionIds: wrongQuestionIds || [],
      startedAt: startedAt || new Date()
    });

    res.json({ success: true, id: entry._id });
  } catch (error) {
    logger.error('Error saving learn history:', error);
    res.status(500).json({ message: 'Error saving history' });
  }
};

/**
 * GET /learn/history
 * Get quiz history for the current user.
 */
exports.getHistory = async (req, res) => {
  try {
    const history = await KBLearnHistory.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    res.json(history);
  } catch (error) {
    logger.error('Error fetching learn history:', error);
    res.status(500).json({ message: 'Error fetching history' });
  }
};
