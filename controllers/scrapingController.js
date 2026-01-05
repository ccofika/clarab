const ScrapeSession = require('../models/ScrapeSession');
const ScrapedConversation = require('../models/ScrapedConversation');
const Agent = require('../models/Agent');
const { logActivity } = require('../utils/activityLogger');
const csv = require('csv-parser');
const { Readable } = require('stream');

// Get Socket.io instance (will be set from server.js)
let io = null;
exports.setSocketIO = (socketIO) => {
  io = socketIO;
};

/**
 * @desc    Get all scrape sessions for current user
 * @route   GET /api/qa/scrape/sessions
 * @access  Private
 */
exports.getSessions = async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;

    const query = { user: req.user._id };
    if (status) query.status = status;

    const sessions = await ScrapeSession.find(query)
      .populate('agent', 'name team')
      .sort({ createdAt: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit));

    const total = await ScrapeSession.countDocuments(query);

    res.json({
      sessions,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error getting scrape sessions:', error);
    res.status(500).json({ message: 'Failed to get scrape sessions' });
  }
};

/**
 * @desc    Get single scrape session
 * @route   GET /api/qa/scrape/sessions/:id
 * @access  Private
 */
exports.getSession = async (req, res) => {
  try {
    const session = await ScrapeSession.findOne({
      _id: req.params.id,
      user: req.user._id
    }).populate('agent', 'name team');

    if (!session) {
      return res.status(404).json({ message: 'Scrape session not found' });
    }

    res.json(session);
  } catch (error) {
    console.error('Error getting scrape session:', error);
    res.status(500).json({ message: 'Failed to get scrape session' });
  }
};

/**
 * @desc    Create new scrape session (parse CSV and start scraping)
 * @route   POST /api/qa/scrape/sessions
 * @access  Private
 */
exports.createSession = async (req, res) => {
  try {
    const { agentId, csvContent, csvFileName } = req.body;

    // Validate agent exists and belongs to user
    const agent = await Agent.findOne({
      _id: agentId,
      activeForUsers: req.user._id
    });

    if (!agent) {
      return res.status(400).json({ message: 'Agent not found or not assigned to you' });
    }

    // Check if there's already a running session
    const runningSession = await ScrapeSession.findOne({
      user: req.user._id,
      status: 'running'
    });

    if (runningSession) {
      return res.status(400).json({
        message: 'You already have a running scrape session. Please wait for it to complete.'
      });
    }

    // Parse CSV to get conversation IDs
    const conversationIds = await parseCSV(csvContent);

    if (conversationIds.length === 0) {
      return res.status(400).json({ message: 'No conversation IDs found in CSV' });
    }

    // Create session
    const session = await ScrapeSession.create({
      user: req.user._id,
      agent: agentId,
      status: 'pending',
      csvFileName: csvFileName || 'upload.csv',
      totalConversations: conversationIds.length
    });

    await logActivity({
      level: 'info',
      message: 'Scrape session created',
      module: 'scrapingController',
      user: req.user._id,
      metadata: {
        sessionId: session._id,
        agentId,
        conversationCount: conversationIds.length
      },
      req
    });

    // Return session immediately - scraping will happen in background
    res.status(201).json({
      session,
      conversationIds,
      message: `Session created with ${conversationIds.length} conversations to scrape`
    });

  } catch (error) {
    console.error('Error creating scrape session:', error);
    res.status(500).json({ message: 'Failed to create scrape session' });
  }
};

/**
 * @desc    Start scraping for a session (called after createSession)
 * @route   POST /api/qa/scrape/sessions/:id/start
 * @access  Private
 */
exports.startScraping = async (req, res) => {
  try {
    const { conversationIds } = req.body;

    const session = await ScrapeSession.findOne({
      _id: req.params.id,
      user: req.user._id,
      status: 'pending'
    });

    if (!session) {
      return res.status(404).json({ message: 'Session not found or already started' });
    }

    // Update session to running
    session.status = 'running';
    session.startedAt = new Date();
    await session.save();

    // Start scraping in background
    const intercomScraper = require('../services/intercomScraperService');
    intercomScraper.scrapeConversations(session._id, conversationIds, io)
      .catch(err => {
        console.error('Scraping error:', err);
        ScrapeSession.findByIdAndUpdate(session._id, {
          status: 'failed',
          errorMessage: err.message
        }).catch(console.error);
      });

    res.json({
      message: 'Scraping started',
      sessionId: session._id
    });

  } catch (error) {
    console.error('Error starting scrape:', error);
    res.status(500).json({ message: 'Failed to start scraping' });
  }
};

/**
 * @desc    Cancel a running scrape session
 * @route   POST /api/qa/scrape/sessions/:id/cancel
 * @access  Private
 */
exports.cancelSession = async (req, res) => {
  try {
    const session = await ScrapeSession.findOneAndUpdate(
      {
        _id: req.params.id,
        user: req.user._id,
        status: { $in: ['pending', 'running'] }
      },
      {
        status: 'cancelled',
        completedAt: new Date()
      },
      { new: true }
    );

    if (!session) {
      return res.status(404).json({ message: 'Session not found or already completed' });
    }

    await logActivity({
      level: 'info',
      message: 'Scrape session cancelled',
      module: 'scrapingController',
      user: req.user._id,
      metadata: { sessionId: session._id },
      req
    });

    res.json({ message: 'Session cancelled', session });

  } catch (error) {
    console.error('Error cancelling session:', error);
    res.status(500).json({ message: 'Failed to cancel session' });
  }
};

/**
 * @desc    Delete a scrape session and its conversations
 * @route   DELETE /api/qa/scrape/sessions/:id
 * @access  Private
 */
exports.deleteSession = async (req, res) => {
  try {
    const session = await ScrapeSession.findOne({
      _id: req.params.id,
      user: req.user._id
    });

    if (!session) {
      return res.status(404).json({ message: 'Session not found' });
    }

    // Cannot delete running sessions
    if (session.status === 'running') {
      return res.status(400).json({ message: 'Cannot delete a running session. Cancel it first.' });
    }

    // Delete all conversations for this session
    await ScrapedConversation.deleteMany({ session: session._id });

    // Delete session
    await ScrapeSession.findByIdAndDelete(session._id);

    await logActivity({
      level: 'info',
      message: 'Scrape session deleted',
      module: 'scrapingController',
      user: req.user._id,
      metadata: { sessionId: session._id },
      req
    });

    res.json({ message: 'Session deleted' });

  } catch (error) {
    console.error('Error deleting session:', error);
    res.status(500).json({ message: 'Failed to delete session' });
  }
};

/**
 * @desc    Get conversations for a session
 * @route   GET /api/qa/scrape/sessions/:id/conversations
 * @access  Private
 */
exports.getSessionConversations = async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;

    // Verify session belongs to user
    const session = await ScrapeSession.findOne({
      _id: req.params.id,
      user: req.user._id
    });

    if (!session) {
      return res.status(404).json({ message: 'Session not found' });
    }

    const conversations = await ScrapedConversation.find({ session: req.params.id })
      .select('conversationId messageCount status scrapedAt customerName agentName images')
      .sort({ scrapedAt: 1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit));

    const total = await ScrapedConversation.countDocuments({ session: req.params.id });

    res.json({
      conversations,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });

  } catch (error) {
    console.error('Error getting conversations:', error);
    res.status(500).json({ message: 'Failed to get conversations' });
  }
};

/**
 * @desc    Get single conversation with full details
 * @route   GET /api/qa/scrape/conversations/:id
 * @access  Private
 */
exports.getConversation = async (req, res) => {
  try {
    const conversation = await ScrapedConversation.findById(req.params.id)
      .populate('agent', 'name team')
      .populate({
        path: 'session',
        select: 'csvFileName createdAt user',
        match: { user: req.user._id }
      });

    if (!conversation || !conversation.session) {
      return res.status(404).json({ message: 'Conversation not found' });
    }

    res.json(conversation);

  } catch (error) {
    console.error('Error getting conversation:', error);
    res.status(500).json({ message: 'Failed to get conversation' });
  }
};

/**
 * @desc    Parse CSV content and extract conversation IDs
 * @route   POST /api/qa/scrape/parse-csv
 * @access  Private
 */
exports.parseCSVPreview = async (req, res) => {
  try {
    const { csvContent } = req.body;

    if (!csvContent) {
      return res.status(400).json({ message: 'CSV content is required' });
    }

    const conversationIds = await parseCSV(csvContent);

    res.json({
      count: conversationIds.length,
      preview: conversationIds.slice(0, 10),
      hasMore: conversationIds.length > 10
    });

  } catch (error) {
    console.error('Error parsing CSV:', error);
    res.status(500).json({ message: 'Failed to parse CSV' });
  }
};

// Helper function to parse CSV content
async function parseCSV(csvContent) {
  return new Promise((resolve, reject) => {
    const conversationIds = [];

    // Create readable stream from string
    const stream = Readable.from([csvContent]);

    stream
      .pipe(csv())
      .on('data', (row) => {
        // First column is "Conversation ID"
        const id = row['Conversation ID'] || row['conversation_id'] || Object.values(row)[0];
        if (id && !isNaN(id)) {
          conversationIds.push(id.toString().trim());
        }
      })
      .on('end', () => {
        resolve(conversationIds);
      })
      .on('error', (error) => {
        reject(error);
      });
  });
}

/**
 * @desc    Manual save of scraped conversation (for testing/fallback)
 * @route   POST /api/qa/scrape/conversations
 * @access  Private
 */
exports.saveConversation = async (req, res) => {
  try {
    const { sessionId, conversationId, exportedText, images } = req.body;

    // Verify session belongs to user
    const session = await ScrapeSession.findOne({
      _id: sessionId,
      user: req.user._id
    });

    if (!session) {
      return res.status(404).json({ message: 'Session not found' });
    }

    // Create conversation
    const conversation = await ScrapedConversation.create({
      session: sessionId,
      conversationId,
      agent: session.agent,
      exportedText,
      images: images || []
    });

    // Parse text into messages
    conversation.parseExportedText();
    await conversation.save();

    // Update session counts
    await ScrapeSession.findByIdAndUpdate(sessionId, {
      $inc: { scrapedCount: 1 }
    });

    res.status(201).json(conversation);

  } catch (error) {
    console.error('Error saving conversation:', error);
    res.status(500).json({ message: 'Failed to save conversation' });
  }
};

// Store active login browser session
let activeLoginSession = null;

/**
 * @desc    Open browser for manual Intercom login
 * @route   POST /api/qa/scrape/login
 * @access  Private
 */
exports.openLoginBrowser = async (req, res) => {
  try {
    // Check if there's already an active login session
    if (activeLoginSession) {
      return res.status(400).json({
        message: 'Login browser is already open. Please complete login in the existing browser window.'
      });
    }

    const intercomScraper = require('../services/intercomScraperService');

    // Open browser for login
    activeLoginSession = await intercomScraper.openLoginBrowser();

    res.json({
      message: 'Browser opened for Intercom login. Please log in and then click "Save Login" when done.',
      status: 'waiting_for_login'
    });

  } catch (error) {
    console.error('Error opening login browser:', error);
    activeLoginSession = null;
    res.status(500).json({ message: 'Failed to open login browser' });
  }
};

/**
 * @desc    Save cookies after manual login
 * @route   POST /api/qa/scrape/login/save
 * @access  Private
 */
exports.saveLoginCookies = async (req, res) => {
  try {
    if (!activeLoginSession) {
      return res.status(400).json({
        message: 'No active login session. Please open the login browser first.'
      });
    }

    // Save cookies
    const saved = await activeLoginSession.saveCookies();

    // Close browser
    if (activeLoginSession.browser) {
      await activeLoginSession.browser.close();
    } else if (activeLoginSession.context) {
      await activeLoginSession.context.close();
    }

    activeLoginSession = null;

    if (saved) {
      res.json({ message: 'Login saved successfully!', status: 'logged_in' });
    } else {
      res.status(500).json({ message: 'Failed to save login cookies' });
    }

  } catch (error) {
    console.error('Error saving login:', error);
    activeLoginSession = null;
    res.status(500).json({ message: 'Failed to save login' });
  }
};

/**
 * @desc    Cancel login and close browser
 * @route   POST /api/qa/scrape/login/cancel
 * @access  Private
 */
exports.cancelLogin = async (req, res) => {
  try {
    if (activeLoginSession) {
      if (activeLoginSession.browser) {
        await activeLoginSession.browser.close();
      } else if (activeLoginSession.context) {
        await activeLoginSession.context.close();
      }
      activeLoginSession = null;
    }

    res.json({ message: 'Login cancelled' });

  } catch (error) {
    console.error('Error cancelling login:', error);
    activeLoginSession = null;
    res.status(500).json({ message: 'Failed to cancel login' });
  }
};

/**
 * @desc    Check if user is logged into Intercom
 * @route   GET /api/qa/scrape/login/status
 * @access  Private
 */
exports.checkLoginStatus = async (req, res) => {
  try {
    const intercomScraper = require('../services/intercomScraperService');
    const fs = require('fs');

    // Check if cookies file exists
    const cookiesExist = fs.existsSync(intercomScraper.CONFIG.COOKIES_PATH);

    res.json({
      hasCookies: cookiesExist,
      cookiesPath: intercomScraper.CONFIG.COOKIES_PATH,
      browserDataPath: intercomScraper.CONFIG.BROWSER_DATA_PATH
    });

  } catch (error) {
    console.error('Error checking login status:', error);
    res.status(500).json({ message: 'Failed to check login status' });
  }
};
