/**
 * Intercom Scraper Service
 *
 * Uses Playwright to scrape conversations from Intercom.
 * Supports two authentication modes:
 * 1. Persistent browser profile (Chrome)
 * 2. Saved cookies (fallback)
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const os = require('os');
const ScrapeSession = require('../models/ScrapeSession');
const ScrapedConversation = require('../models/ScrapedConversation');

// Configuration
const CONFIG = {
  // Intercom base URL
  INTERCOM_BASE_URL: 'https://app.intercom.com',

  // Delay between requests (ms) to avoid rate limiting
  REQUEST_DELAY: 2000,

  // Timeout for page load (ms)
  PAGE_TIMEOUT: 30000,

  // Timeout for download (ms)
  DOWNLOAD_TIMEOUT: 10000,

  // Path to store browser data
  BROWSER_DATA_PATH: path.join(os.homedir(), '.clara-scraper'),

  // Cookies file path
  COOKIES_PATH: path.join(os.homedir(), '.clara-scraper', 'intercom-cookies.json'),

  // Screenshot path for debugging
  SCREENSHOTS_PATH: path.join(os.homedir(), '.clara-scraper', 'screenshots')
};

// Ensure directories exist
if (!fs.existsSync(CONFIG.BROWSER_DATA_PATH)) {
  fs.mkdirSync(CONFIG.BROWSER_DATA_PATH, { recursive: true });
}
if (!fs.existsSync(CONFIG.SCREENSHOTS_PATH)) {
  fs.mkdirSync(CONFIG.SCREENSHOTS_PATH, { recursive: true });
}

/**
 * Main scraping function
 * @param {string} sessionId - MongoDB session ID
 * @param {string[]} conversationIds - Array of Intercom conversation IDs
 * @param {Object} io - Socket.io instance for real-time updates
 */
async function scrapeConversations(sessionId, conversationIds, io) {
  console.log(`[Scraper] Starting scrape for session ${sessionId} with ${conversationIds.length} conversations`);

  let browser = null;
  let context = null;

  try {
    // Try persistent browser first
    const browserResult = await launchBrowser();
    browser = browserResult.browser;
    context = browserResult.context;

    const page = await context.newPage();

    // Check if logged in
    const isLoggedIn = await checkLogin(page);

    if (!isLoggedIn) {
      // Update session with error
      await ScrapeSession.findByIdAndUpdate(sessionId, {
        status: 'failed',
        errorMessage: 'Not logged into Intercom. Please log in manually first.',
        completedAt: new Date()
      });

      emitProgress(io, sessionId, {
        status: 'failed',
        error: 'Not logged into Intercom. Please log in manually first.'
      });

      // Close browser or context (persistent context has no browser)
      if (browser) {
        await browser.close();
      } else if (context) {
        await context.close();
      }
      return;
    }

    // Update session to running
    await ScrapeSession.findByIdAndUpdate(sessionId, {
      status: 'running',
      startedAt: new Date()
    });

    // Get session for agent ID
    const session = await ScrapeSession.findById(sessionId);

    // Scrape each conversation
    for (let i = 0; i < conversationIds.length; i++) {
      const conversationId = conversationIds[i];

      // Check if session was cancelled
      const currentSession = await ScrapeSession.findById(sessionId);
      if (currentSession.status === 'cancelled') {
        console.log(`[Scraper] Session ${sessionId} was cancelled`);
        break;
      }

      // Emit progress
      emitProgress(io, sessionId, {
        status: 'running',
        current: i + 1,
        total: conversationIds.length,
        conversationId,
        progress: Math.round(((i + 1) / conversationIds.length) * 100)
      });

      try {
        // Scrape single conversation
        const result = await scrapeSingleConversation(page, conversationId);

        // Save to database
        const conversation = await ScrapedConversation.create({
          session: sessionId,
          conversationId,
          agent: session.agent,
          exportedText: result.exportedText || '',
          images: result.images || [],
          combinedText: result.combinedText || '',
          status: result.exportedText ? 'success' : 'partial',
          scrapedAt: new Date()
        });

        // Parse messages (don't fail if parsing has issues)
        try {
          conversation.parseExportedText();
          await conversation.save();
        } catch (parseError) {
          console.log(`[Scraper] Message parsing failed for ${conversationId}, but raw text saved:`, parseError.message);
        }

        // Update session count
        await ScrapeSession.findByIdAndUpdate(sessionId, {
          $inc: { scrapedCount: 1 }
        });

        console.log(`[Scraper] Successfully scraped conversation ${conversationId}`);

      } catch (error) {
        console.error(`[Scraper] Failed to scrape conversation ${conversationId}:`, error.message);

        // Save failed conversation (use findOneAndUpdate to avoid duplicate key errors)
        try {
          await ScrapedConversation.findOneAndUpdate(
            { session: sessionId, conversationId },
            {
              $set: {
                agent: session.agent,
                status: 'failed',
                scrapeError: error.message,
                scrapedAt: new Date()
              }
            },
            { upsert: true, new: true }
          );
        } catch (saveError) {
          console.error(`[Scraper] Could not save failed state for ${conversationId}:`, saveError.message);
        }

        // Update session failure count
        await ScrapeSession.findByIdAndUpdate(sessionId, {
          $inc: { failedCount: 1 },
          $push: { failedIds: conversationId }
        });
      }

      // Delay between requests
      if (i < conversationIds.length - 1) {
        await delay(CONFIG.REQUEST_DELAY);
      }
    }

    // Mark session as completed
    await ScrapeSession.findByIdAndUpdate(sessionId, {
      status: 'completed',
      completedAt: new Date()
    });

    emitProgress(io, sessionId, {
      status: 'completed',
      current: conversationIds.length,
      total: conversationIds.length,
      progress: 100
    });

    console.log(`[Scraper] Session ${sessionId} completed`);

  } catch (error) {
    console.error(`[Scraper] Session ${sessionId} failed:`, error);

    await ScrapeSession.findByIdAndUpdate(sessionId, {
      status: 'failed',
      errorMessage: error.message,
      completedAt: new Date()
    });

    emitProgress(io, sessionId, {
      status: 'failed',
      error: error.message
    });

  } finally {
    // Close browser or context (persistent context has no browser)
    if (browser) {
      await browser.close();
    } else if (context) {
      await context.close();
    }
  }
}

/**
 * Launch browser with persistent profile or cookies
 */
async function launchBrowser() {
  // Try to use Chrome user data directory for persistent login
  const chromeUserDataDir = getChromeUserDataDir();

  if (chromeUserDataDir && fs.existsSync(chromeUserDataDir)) {
    console.log('[Scraper] Using persistent Chrome profile');

    try {
      // Launch with persistent context
      const context = await chromium.launchPersistentContext(CONFIG.BROWSER_DATA_PATH, {
        headless: false, // Set to true for production
        channel: 'chrome',
        acceptDownloads: true,
        viewport: { width: 1600, height: 1000 }
      });

      return { browser: null, context, isPersistent: true };
    } catch (error) {
      console.log('[Scraper] Failed to use persistent profile, falling back to cookies');
    }
  }

  // Fallback: launch regular browser and load cookies
  console.log('[Scraper] Using regular browser with saved cookies');

  const browser = await chromium.launch({
    headless: false, // Set to true for production
    slowMo: 100
  });

  const context = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
    acceptDownloads: true
  });

  // Load saved cookies if available
  if (fs.existsSync(CONFIG.COOKIES_PATH)) {
    try {
      const cookies = JSON.parse(fs.readFileSync(CONFIG.COOKIES_PATH, 'utf8'));
      await context.addCookies(cookies);
      console.log('[Scraper] Loaded saved cookies');
    } catch (error) {
      console.log('[Scraper] Failed to load cookies:', error.message);
    }
  }

  return { browser, context, isPersistent: false };
}

/**
 * Check if user is logged into Intercom
 */
async function checkLogin(page) {
  try {
    await page.goto(CONFIG.INTERCOM_BASE_URL, { timeout: CONFIG.PAGE_TIMEOUT });
    await page.waitForTimeout(3000);

    // Check for login page indicators
    const isLoginPage = await page.evaluate(() => {
      const url = window.location.href;
      return url.includes('/admins/sign_in') ||
             url.includes('/login') ||
             document.querySelector('[data-testid="login-form"]') !== null;
    });

    if (isLoginPage) {
      console.log('[Scraper] Not logged in - login page detected');
      return false;
    }

    // Check for inbox or dashboard indicators
    const isLoggedIn = await page.evaluate(() => {
      const url = window.location.href;
      return url.includes('/inbox') ||
             url.includes('/home') ||
             url.includes('/apps') ||
             document.querySelector('[data-testid="inbox"]') !== null;
    });

    console.log(`[Scraper] Login check: ${isLoggedIn ? 'logged in' : 'not logged in'}`);
    return isLoggedIn;

  } catch (error) {
    console.error('[Scraper] Login check failed:', error.message);
    return false;
  }
}

/**
 * Scrape a single conversation
 */
async function scrapeSingleConversation(page, conversationId) {
  // Hardcoded Intercom workspace and admin IDs
  const WORKSPACE_ID = 'cx1ywgf2';
  const ADMIN_ID = '8294566';

  // Build the conversation URL
  const directUrl = `${CONFIG.INTERCOM_BASE_URL}/a/inbox/${WORKSPACE_ID}/inbox/admin/${ADMIN_ID}/conversation/${conversationId}`;
  console.log(`[Scraper] Navigating to: ${directUrl}`);

  await page.goto(directUrl, { timeout: CONFIG.PAGE_TIMEOUT });
  await page.waitForTimeout(3000);

  // Extract images from DOM
  const images = await page.evaluate(() => {
    const imgs = document.querySelectorAll('img');
    return Array.from(imgs)
      .filter(img => img.src.includes('downloads.intercomcdn.com/i/o/'))
      .map(img => ({
        url: img.src,
        filename: img.src.split('/').pop().split('?')[0],
        alt: img.alt || ''
      }));
  });

  console.log(`[Scraper] Found ${images.length} images`);

  // Try to export conversation as text
  let exportedText = null;

  try {
    // Find and click the "More" button (three dots)
    const moreButtonSelectors = [
      'button[aria-label="More actions"]',
      'button[aria-label="More"]',
      'button[aria-label="More options"]',
      '[data-testid="conversation-header-more-button"]',
      'button:has(svg[class*="ellipsis"])',
      'button:has(svg[class*="dots"])'
    ];

    let moreButton = null;
    for (const selector of moreButtonSelectors) {
      try {
        const btn = await page.$(selector);
        if (btn && await btn.isVisible()) {
          moreButton = btn;
          console.log(`[Scraper] Found "More" button with: ${selector}`);
          break;
        }
      } catch (e) {
        // Continue to next selector
      }
    }

    // Fallback: search all buttons for three dots
    if (!moreButton) {
      const buttons = await page.$$('button');
      for (const btn of buttons) {
        const html = await btn.innerHTML();
        if ((html.includes('ellipsis') || html.includes('dots')) && await btn.isVisible()) {
          moreButton = btn;
          console.log('[Scraper] Found button with dots/ellipsis in HTML');
          break;
        }
      }
    }

    if (moreButton) {
      await moreButton.click();
      await page.waitForTimeout(1000);

      // Find and click "Export" option
      const exportSelectors = [
        'text="Export conversation as text"',
        'text="Export conversation"',
        'text="Export as text"',
        'text="Export"',
        '[role="menuitem"]:has-text("Export")',
        '[role="option"]:has-text("Export")'
      ];

      let exportButton = null;
      for (const selector of exportSelectors) {
        try {
          const btn = await page.$(selector);
          if (btn && await btn.isVisible()) {
            exportButton = btn;
            console.log(`[Scraper] Found "Export" with: ${selector}`);
            break;
          }
        } catch (e) {
          // Continue
        }
      }

      if (exportButton) {
        // Set up download handler
        const downloadPromise = page.waitForEvent('download', { timeout: CONFIG.DOWNLOAD_TIMEOUT });

        await exportButton.click();

        try {
          const download = await downloadPromise;

          // Save to temp file and read content
          const tempPath = path.join(CONFIG.SCREENSHOTS_PATH, `temp_${conversationId}.txt`);
          await download.saveAs(tempPath);

          exportedText = fs.readFileSync(tempPath, 'utf8');
          console.log(`[Scraper] Exported text: ${exportedText.length} characters`);

          // Clean up temp file
          fs.unlinkSync(tempPath);

        } catch (downloadError) {
          console.log(`[Scraper] Download timeout/error: ${downloadError.message}`);
        }
      } else {
        console.log('[Scraper] Export button not found');
      }
    } else {
      console.log('[Scraper] More button not found');
    }

  } catch (error) {
    console.error(`[Scraper] Export error: ${error.message}`);
  }

  // If export failed, try DOM scraping as fallback
  if (!exportedText) {
    console.log('[Scraper] Falling back to DOM scraping');

    exportedText = await page.evaluate(() => {
      const conversationArea = document.querySelector('[class*="conversation"]') ||
                               document.querySelector('main') ||
                               document.querySelector('[class*="Conversation"]');

      return conversationArea ? conversationArea.innerText : null;
    });

    if (exportedText && exportedText.length > 100) {
      console.log(`[Scraper] DOM scrape: ${exportedText.length} characters`);
    }
  }

  // Combine text with image URLs
  let combinedText = exportedText || '';

  if (exportedText && images.length > 0) {
    const imageRefs = exportedText.match(/\[Image[:\s]+"?([^"\]]+)"?\]/gi) || [];

    for (const ref of imageRefs) {
      const match = ref.match(/\[Image[:\s]+"?([^"\]?]+)/i);
      if (match) {
        const refFilename = match[1];
        const matchingImage = images.find(img =>
          img.url.includes(refFilename.split('?')[0])
        );

        if (matchingImage) {
          combinedText = combinedText.replace(ref, `[Image: ${matchingImage.url}]`);
        }
      }
    }
  }

  return {
    exportedText,
    images,
    combinedText
  };
}

/**
 * Get Chrome user data directory based on OS
 */
function getChromeUserDataDir() {
  const platform = os.platform();

  if (platform === 'win32') {
    return path.join(os.homedir(), 'AppData', 'Local', 'Google', 'Chrome', 'User Data');
  } else if (platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'Google', 'Chrome');
  } else {
    return path.join(os.homedir(), '.config', 'google-chrome');
  }
}

/**
 * Emit progress update via Socket.io
 */
function emitProgress(io, sessionId, data) {
  if (io) {
    io.emit(`scrape-progress:${sessionId}`, data);
  }
}

/**
 * Helper function for delays
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Save cookies for future use (call after manual login)
 */
async function saveCookies(context) {
  try {
    const cookies = await context.cookies();
    fs.writeFileSync(CONFIG.COOKIES_PATH, JSON.stringify(cookies, null, 2));
    console.log('[Scraper] Cookies saved');
    return true;
  } catch (error) {
    console.error('[Scraper] Failed to save cookies:', error.message);
    return false;
  }
}

/**
 * Manual login helper - opens browser for user to login
 */
async function openLoginBrowser() {
  console.log('[Scraper] Opening browser for manual login...');

  const browser = await chromium.launch({
    headless: false,
    slowMo: 100
  });

  const context = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
    acceptDownloads: true
  });

  const page = await context.newPage();
  await page.goto(CONFIG.INTERCOM_BASE_URL);

  return { browser, context, page, saveCookies: () => saveCookies(context) };
}

module.exports = {
  scrapeConversations,
  checkLogin,
  openLoginBrowser,
  saveCookies,
  CONFIG
};
