const { google } = require('googleapis');
const User = require('../models/User');

// Google Sheets ID from URL
const SPREADSHEET_ID = '1rXMStYcSZMX7OQZgslBGaxE4kuQsOvXikA26HYmxzdI';

// Sheet names
const SHEET_NAMES = {
  DB: 'Stake.com DB ver.2.1',
  WB: 'Stake.com WB ver.2.1'
};

// Column mappings for DB sheet (0-indexed)
const DB_COLUMNS = {
  BONUS_STATUS: 0,
  AFFILIATE_NAME: 1,
  BONUS: 2,
  PERCENTAGE: 3,
  WAGER: 4,
  MIN_DEPOSIT: 5,
  MAX_DEPOSIT: 6,
  MANAGED_BY: 7,
  LANGUAGE: 8,
  CONTACT_INSTRUCTIONS: 9,
  KYC_REQUIREMENT: 10,
  IMPORTANT_NOTE: 11,
  PLATFORM_METHOD: 12
};

// Column mappings for WB sheet (0-indexed)
const WB_COLUMNS = {
  BONUS_STATUS: 0,
  AFFILIATE_NAME: 1,
  CAMPAIGN_SPECIFIC: 2,
  OFFER: 3,
  AMOUNT: 4,
  CURRENCY: 5,
  DAYS: 6,
  DEPOSIT_REQUIREMENTS: 7,
  MINIMUM_WAGER: 8,
  WAGER_REQUIREMENT: 9,
  MANAGED_BY: 10,
  LANGUAGE: 11,
  CONTACT_INSTRUCTIONS: 12,
  KYC_REQUIREMENT: 13,
  IMPORTANT_NOTES: 14,
  PLATFORM_METHOD: 15
};

/**
 * Get Google Sheets API client using user's OAuth tokens
 */
const getSheetsClient = async (userId) => {
  const user = await User.findById(userId).select('googleAccessToken googleRefreshToken');

  if (!user || !user.googleAccessToken) {
    throw new Error('User not authenticated with Google or missing access token');
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_CALLBACK_URL
  );

  oauth2Client.setCredentials({
    access_token: user.googleAccessToken,
    refresh_token: user.googleRefreshToken
  });

  // Handle token refresh automatically
  oauth2Client.on('tokens', async (tokens) => {
    if (tokens.refresh_token) {
      user.googleRefreshToken = tokens.refresh_token;
    }
    if (tokens.access_token) {
      user.googleAccessToken = tokens.access_token;
    }
    await user.save();
  });

  return google.sheets({ version: 'v4', auth: oauth2Client });
};

/**
 * Check if user has Google Sheets access
 * GET /api/google-sheets/check-access
 */
exports.checkAccess = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('googleAccessToken googleRefreshToken');

    if (!user || !user.googleAccessToken) {
      return res.json({
        hasAccess: false,
        message: 'Not authenticated with Google. Please log out and log back in.'
      });
    }

    // Try to verify the token has the required scope
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_CALLBACK_URL
    );

    oauth2Client.setCredentials({
      access_token: user.googleAccessToken,
      refresh_token: user.googleRefreshToken
    });

    try {
      // Try a simple API call to check if scopes are valid
      const sheets = google.sheets({ version: 'v4', auth: oauth2Client });
      await sheets.spreadsheets.get({
        spreadsheetId: SPREADSHEET_ID
      });

      return res.json({
        hasAccess: true,
        message: 'Google Sheets access verified successfully'
      });
    } catch (error) {
      if (error.code === 403 || error.code === 401) {
        return res.json({
          hasAccess: false,
          message: 'Google Sheets access not granted. Please log out and log back in to grant permissions.',
          needsReauth: true
        });
      }
      throw error;
    }
  } catch (error) {
    console.error('❌ Error checking Google Sheets access:', error);
    res.status(500).json({
      message: 'Failed to check access',
      error: error.message
    });
  }
};

/**
 * Search for affiliate bonuses
 * POST /api/google-sheets/search-affiliate
 * Body: { affiliateName: string, campaignId?: string }
 */
exports.searchAffiliate = async (req, res) => {
  try {
    const { affiliateName, campaignId } = req.body;

    if (!affiliateName) {
      return res.status(400).json({ message: 'Affiliate name is required' });
    }

    console.log('🔍 Searching for affiliate:', affiliateName, 'Campaign ID:', campaignId || 'none');

    const sheets = await getSheetsClient(req.user._id);

    // Fetch data from both sheets
    const [dbResponse, wbResponse] = await Promise.all([
      sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET_NAMES.DB}!A:N`, // Columns A to N
      }),
      sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET_NAMES.WB}!A:Q`, // Columns A to Q (16 columns)
      })
    ]);

    const dbRows = dbResponse.data.values || [];
    const wbRows = wbResponse.data.values || [];

    // Skip header row (index 0 is headers, index 1 is column names, start from index 2)
    const dbData = dbRows.slice(2);
    const wbData = wbRows.slice(2);

    const results = [];

    // Search in DB sheet
    for (const row of dbData) {
      if (!row[DB_COLUMNS.AFFILIATE_NAME]) continue;

      const rowAffiliateName = row[DB_COLUMNS.AFFILIATE_NAME].trim().toLowerCase();
      const searchAffiliateName = affiliateName.trim().toLowerCase();

      if (rowAffiliateName === searchAffiliateName) {
        const bonusValue = row[DB_COLUMNS.BONUS] || '';

        // If user provided a campaign ID, only include rows that match
        if (campaignId && bonusValue.trim() !== '') {
          if (bonusValue.trim().toLowerCase() !== campaignId.trim().toLowerCase()) {
            continue;
          }
        }

        // If no campaign ID provided, include ALL rows for this affiliate
        // Row matches! Add to results
        results.push({
          source: 'DB',
          bonusStatus: row[DB_COLUMNS.BONUS_STATUS] || '',
          affiliateName: row[DB_COLUMNS.AFFILIATE_NAME] || '',
          bonus: bonusValue,
          percentage: row[DB_COLUMNS.PERCENTAGE] || '',
          wager: row[DB_COLUMNS.WAGER] || '',
          minDeposit: row[DB_COLUMNS.MIN_DEPOSIT] || '',
          maxDeposit: row[DB_COLUMNS.MAX_DEPOSIT] || '',
          managedBy: row[DB_COLUMNS.MANAGED_BY] || '',
          language: row[DB_COLUMNS.LANGUAGE] || '',
          contactInstructions: row[DB_COLUMNS.CONTACT_INSTRUCTIONS] || '',
          kycRequirement: row[DB_COLUMNS.KYC_REQUIREMENT] || '',
          importantNote: row[DB_COLUMNS.IMPORTANT_NOTE] || '',
          platformMethod: row[DB_COLUMNS.PLATFORM_METHOD] || ''
        });
      }
    }

    // Search in WB sheet
    for (const row of wbData) {
      if (!row[WB_COLUMNS.AFFILIATE_NAME]) continue;

      const rowAffiliateName = row[WB_COLUMNS.AFFILIATE_NAME].trim().toLowerCase();
      const searchAffiliateName = affiliateName.trim().toLowerCase();

      if (rowAffiliateName === searchAffiliateName) {
        const campaignSpecific = row[WB_COLUMNS.CAMPAIGN_SPECIFIC] || '';

        // If user provided a campaign ID, only include rows that match
        if (campaignId && campaignSpecific.trim() !== '') {
          if (campaignSpecific.trim().toLowerCase() !== campaignId.trim().toLowerCase()) {
            continue;
          }
        }

        // If no campaign ID provided, include ALL rows for this affiliate
        // Row matches! Add to results
        results.push({
          source: 'WB',
          bonusStatus: row[WB_COLUMNS.BONUS_STATUS] || '',
          affiliateName: row[WB_COLUMNS.AFFILIATE_NAME] || '',
          campaignSpecific: campaignSpecific,
          offer: row[WB_COLUMNS.OFFER] || '',
          amount: row[WB_COLUMNS.AMOUNT] || '',
          currency: row[WB_COLUMNS.CURRENCY] || '',
          days: row[WB_COLUMNS.DAYS] || '',
          depositRequirements: row[WB_COLUMNS.DEPOSIT_REQUIREMENTS] || '',
          minimumWager: row[WB_COLUMNS.MINIMUM_WAGER] || '',
          wagerRequirement: row[WB_COLUMNS.WAGER_REQUIREMENT] || '',
          managedBy: row[WB_COLUMNS.MANAGED_BY] || '',
          language: row[WB_COLUMNS.LANGUAGE] || '',
          contactInstructions: row[WB_COLUMNS.CONTACT_INSTRUCTIONS] || '',
          kycRequirement: row[WB_COLUMNS.KYC_REQUIREMENT] || '',
          importantNotes: row[WB_COLUMNS.IMPORTANT_NOTES] || '',
          platformMethod: row[WB_COLUMNS.PLATFORM_METHOD] || ''
        });
      }
    }

    if (results.length === 0) {
      return res.status(404).json({
        message: 'No affiliate found with the provided name' + (campaignId ? ' and campaign ID' : ''),
        success: false
      });
    }

    console.log('✅ Found', results.length, 'result(s) for affiliate:', affiliateName);

    res.json({
      success: true,
      results
    });

  } catch (error) {
    console.error('❌ Error searching affiliate:', error);

    // Handle specific Google API errors
    if (error.code === 401 || error.code === 403) {
      return res.status(401).json({
        message: 'Google authentication expired. Please log out and log back in.',
        needsReauth: true
      });
    }

    res.status(500).json({
      message: 'Failed to search affiliate data',
      error: error.message
    });
  }
};
