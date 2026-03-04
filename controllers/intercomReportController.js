const IntercomReportTemplate = require('../models/IntercomReportTemplate');
const logger = require('../utils/logger');

const INTERCOM_API_BASE = 'https://api.intercom.io';
const INTERCOM_VERSION = '2.11';
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

// Reference data caches
let referenceCache = {
  admins: { data: null, fetchedAt: 0 },
  teams: { data: null, fetchedAt: 0 },
  tags: { data: null, fetchedAt: 0 }
};

// Contact attribute cache (kyc_country)
const contactAttributeCache = new Map();
const CONTACT_CACHE_MAX = 500;

// ============================================
// HELPERS
// ============================================

function getIntercomHeaders() {
  const token = process.env.INTERCOM_API_TOKEN;
  if (!token) throw new Error('INTERCOM_API_TOKEN not configured');
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
    'Intercom-Version': INTERCOM_VERSION
  };
}

async function fetchWithRetry(url, options, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    const resp = await fetch(url, options);
    if (resp.status === 429 && i < retries) {
      const retryAfter = parseInt(resp.headers.get('retry-after') || '2', 10);
      await new Promise(r => setTimeout(r, retryAfter * 1000));
      continue;
    }
    return resp;
  }
}

async function fetchAllAdmins() {
  const now = Date.now();
  if (referenceCache.admins.data && now - referenceCache.admins.fetchedAt < CACHE_TTL) {
    return referenceCache.admins.data;
  }
  const resp = await fetchWithRetry(`${INTERCOM_API_BASE}/admins`, {
    headers: getIntercomHeaders()
  });
  if (!resp.ok) throw new Error(`Failed to fetch admins: ${resp.status}`);
  const data = await resp.json();
  const admins = (data.admins || []).map(a => ({
    id: a.id,
    name: a.name || a.email,
    email: a.email,
    type: a.type
  }));
  referenceCache.admins = { data: admins, fetchedAt: now };
  return admins;
}

async function fetchAllTeams() {
  const now = Date.now();
  if (referenceCache.teams.data && now - referenceCache.teams.fetchedAt < CACHE_TTL) {
    return referenceCache.teams.data;
  }
  const resp = await fetchWithRetry(`${INTERCOM_API_BASE}/teams`, {
    headers: getIntercomHeaders()
  });
  if (!resp.ok) throw new Error(`Failed to fetch teams: ${resp.status}`);
  const data = await resp.json();
  const teams = (data.teams || []).map(t => ({
    id: t.id,
    name: t.name
  }));
  referenceCache.teams = { data: teams, fetchedAt: now };
  return teams;
}

async function fetchAllTags() {
  const now = Date.now();
  if (referenceCache.tags.data && now - referenceCache.tags.fetchedAt < CACHE_TTL) {
    return referenceCache.tags.data;
  }
  const resp = await fetchWithRetry(`${INTERCOM_API_BASE}/tags`, {
    headers: getIntercomHeaders()
  });
  if (!resp.ok) throw new Error(`Failed to fetch tags: ${resp.status}`);
  const data = await resp.json();
  const tags = (data.data || []).map(t => ({
    id: t.id,
    name: t.name
  }));
  referenceCache.tags = { data: tags, fetchedAt: now };
  return tags;
}

async function fetchContactAttribute(contactId, attribute) {
  const cacheKey = `${contactId}:${attribute}`;
  if (contactAttributeCache.has(cacheKey)) return contactAttributeCache.get(cacheKey);

  try {
    const resp = await fetchWithRetry(`${INTERCOM_API_BASE}/contacts/${contactId}`, {
      headers: getIntercomHeaders()
    });
    if (!resp.ok) {
      contactAttributeCache.set(cacheKey, null);
      return null;
    }
    const data = await resp.json();
    const value = data.custom_attributes?.[attribute] || null;
    contactAttributeCache.set(cacheKey, value);

    // Limit cache size
    if (contactAttributeCache.size > CONTACT_CACHE_MAX) {
      const firstKey = contactAttributeCache.keys().next().value;
      contactAttributeCache.delete(firstKey);
    }
    return value;
  } catch (e) {
    logger.error(`Failed to fetch contact ${contactId} attribute:`, e.message);
    contactAttributeCache.set(cacheKey, null);
    return null;
  }
}

// ============================================
// TEMPLATE CRUD
// ============================================

// @desc    Get user's report templates
// @route   GET /api/qa/intercom-report/templates
// @access  Private
exports.getReportTemplates = async (req, res) => {
  try {
    const templates = await IntercomReportTemplate.find({ createdBy: req.user._id })
      .sort({ updatedAt: -1 });
    res.json(templates);
  } catch (error) {
    logger.error('Error fetching report templates:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Create report template
// @route   POST /api/qa/intercom-report/templates
// @access  Private
exports.createReportTemplate = async (req, res) => {
  try {
    const { name, filters } = req.body;
    if (!name?.trim()) {
      return res.status(400).json({ message: 'Template name is required' });
    }

    const template = await IntercomReportTemplate.create({
      name: name.trim(),
      createdBy: req.user._id,
      filters: filters || {}
    });
    res.status(201).json(template);
  } catch (error) {
    logger.error('Error creating report template:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Update report template
// @route   PUT /api/qa/intercom-report/templates/:id
// @access  Private
exports.updateReportTemplate = async (req, res) => {
  try {
    const { name, filters } = req.body;
    const template = await IntercomReportTemplate.findOne({
      _id: req.params.id,
      createdBy: req.user._id
    });

    if (!template) {
      return res.status(404).json({ message: 'Template not found' });
    }

    if (name !== undefined) template.name = name.trim();
    if (filters !== undefined) template.filters = filters;
    await template.save();

    res.json(template);
  } catch (error) {
    logger.error('Error updating report template:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Delete report template
// @route   DELETE /api/qa/intercom-report/templates/:id
// @access  Private
exports.deleteReportTemplate = async (req, res) => {
  try {
    const result = await IntercomReportTemplate.findOneAndDelete({
      _id: req.params.id,
      createdBy: req.user._id
    });

    if (!result) {
      return res.status(404).json({ message: 'Template not found' });
    }

    res.json({ message: 'Template deleted' });
  } catch (error) {
    logger.error('Error deleting report template:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ============================================
// REFERENCE DATA
// ============================================

// @desc    Fetch Intercom admins, teams, tags (cached 30min)
// @route   GET /api/qa/intercom-report/reference-data
// @access  Private
exports.getIntercomReferenceData = async (req, res) => {
  try {
    const [admins, teams, tags] = await Promise.all([
      fetchAllAdmins(),
      fetchAllTeams(),
      fetchAllTags()
    ]);
    res.json({ admins, teams, tags });
  } catch (error) {
    logger.error('Error fetching Intercom reference data:', error);
    res.status(500).json({ message: 'Failed to fetch Intercom reference data' });
  }
};

// ============================================
// REPORT EXECUTION
// ============================================

// Build Intercom search query from filters
function buildIntercomQuery(filters) {
  const queryFilters = [];

  if (filters.adminAssigneeIds?.length) {
    const ids = filters.adminAssigneeIds.map(a => a.id || a);
    queryFilters.push({
      field: 'admin_assignee_id',
      operator: filters.adminAssigneeOperator === 'is_not' ? 'NIN' : 'IN',
      value: ids.slice(0, 15)
    });
  }

  if (filters.teamAssigneeIds?.length) {
    const ids = filters.teamAssigneeIds.map(t => t.id || t);
    queryFilters.push({
      field: 'team_assignee_id',
      operator: filters.teamAssigneeOperator === 'is_not' ? 'NIN' : 'IN',
      value: ids.slice(0, 15)
    });
  }

  if (filters.tagIds?.length) {
    const ids = filters.tagIds.map(t => t.id || t);
    queryFilters.push({
      field: 'tag_ids',
      operator: filters.tagOperator === 'is_not' ? 'NIN' : 'IN',
      value: ids.slice(0, 15)
    });
  }

  if (filters.dateFrom) {
    queryFilters.push({
      field: 'created_at',
      operator: '>',
      value: Math.floor(new Date(filters.dateFrom).getTime() / 1000)
    });
  }
  if (filters.dateTo) {
    queryFilters.push({
      field: 'created_at',
      operator: '<',
      value: Math.floor(new Date(filters.dateTo).getTime() / 1000)
    });
  }

  if (filters.state) {
    queryFilters.push({ field: 'state', operator: '=', value: filters.state });
  }

  if (queryFilters.length === 0) {
    return { field: 'created_at', operator: '>', value: Math.floor((Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000) };
  }
  if (queryFilters.length === 1) return queryFilters[0];
  return { operator: 'AND', value: queryFilters };
}

function hasPostFilters(filters) {
  return (filters.topics?.length > 0) || (filters.kycCountries?.length > 0);
}

// @desc    Get total count for a report query (fast — fetches 0 conversations)
// @route   POST /api/qa/intercom-report/count
// @access  Private
exports.countReport = async (req, res) => {
  try {
    const { filters } = req.body;
    if (!filters) return res.status(400).json({ message: 'Filters are required' });

    const query = buildIntercomQuery(filters);
    const searchBody = { query, pagination: { per_page: 1 } };

    const searchResp = await fetchWithRetry(`${INTERCOM_API_BASE}/conversations/search`, {
      method: 'POST',
      headers: getIntercomHeaders(),
      body: JSON.stringify(searchBody)
    });

    if (!searchResp.ok) {
      const errText = await searchResp.text();
      logger.error(`Intercom count error ${searchResp.status}:`, errText);
      return res.status(searchResp.status).json({ message: 'Intercom count failed' });
    }

    const data = await searchResp.json();
    // total_count is at top level of Intercom search response
    res.json({
      totalCount: data.total_count || 0,
      hasPostFilters: hasPostFilters(filters)
    });
  } catch (error) {
    logger.error('Error counting report:', error);
    res.status(500).json({ message: 'Failed to count' });
  }
};

// @desc    Execute report — search Intercom, post-filter, return results
// @route   POST /api/qa/intercom-report/execute
// @access  Private
exports.executeReport = async (req, res) => {
  try {
    const { filters, cursor } = req.body;
    if (!filters) {
      return res.status(400).json({ message: 'Filters are required' });
    }

    const headers = getIntercomHeaders();
    const query = buildIntercomQuery(filters);

    const searchBody = {
      query,
      pagination: {
        per_page: 50,
        ...(cursor ? { starting_after: cursor } : {})
      }
    };

    const searchResp = await fetchWithRetry(`${INTERCOM_API_BASE}/conversations/search`, {
      method: 'POST',
      headers,
      body: JSON.stringify(searchBody)
    });

    if (!searchResp.ok) {
      const errText = await searchResp.text();
      logger.error(`Intercom search error ${searchResp.status}:`, errText);
      logger.error('Search body sent:', JSON.stringify(searchBody, null, 2));
      return res.status(searchResp.status).json({ message: 'Intercom search failed', detail: errText });
    }

    const searchData = await searchResp.json();
    let conversations = searchData.conversations || [];

    // Post-filter: Topics
    const hasTopicFilter = filters.topics?.length > 0;
    if (hasTopicFilter) {
      const topicSet = new Set(filters.topics.map(t => t.toLowerCase()));
      conversations = conversations.filter(conv => {
        const convTopics = (conv.topics?.topics || []).map(t => (t.name || t).toLowerCase());
        if (filters.topicOperator === 'is_not') {
          return !convTopics.some(t => topicSet.has(t));
        } else {
          return convTopics.some(t => topicSet.has(t));
        }
      });
    }

    // Post-filter: KYC Country (requires fetching contact data)
    const hasKycFilter = filters.kycCountries?.length > 0;
    if (hasKycFilter) {
      const countrySet = new Set(filters.kycCountries.map(c => c.toLowerCase()));
      const filtered = [];

      for (const conv of conversations) {
        const contactId = conv.contacts?.contacts?.[0]?.id;
        if (!contactId) {
          if (filters.kycCountryOperator === 'is_not') filtered.push(conv);
          continue;
        }

        const kycCountry = await fetchContactAttribute(contactId, 'kyc_country');
        const countryLower = (kycCountry || '').toLowerCase();

        if (filters.kycCountryOperator === 'is_not') {
          if (!countrySet.has(countryLower)) filtered.push(conv);
        } else {
          if (countrySet.has(countryLower)) filtered.push(conv);
        }
      }
      conversations = filtered;
    }

    // Map to clean response format
    const results = conversations.map(conv => ({
      id: conv.id,
      title: conv.title || '',
      aiTitle: conv.custom_attributes?.['AI Title'] || '',
      state: conv.state,
      createdAt: conv.created_at,
      topics: (conv.topics?.topics || []).map(t => t.name || t),
      tags: (conv.tags?.tags || []).map(t => ({ id: t.id, name: t.name })),
      contactExternalId: conv.contacts?.contacts?.[0]?.external_id || '',
      contactId: conv.contacts?.contacts?.[0]?.id || '',
      adminAssigneeId: conv.admin_assignee_id || null,
      teamAssigneeId: conv.team_assignee_id || null,
      category: conv.custom_attributes?.['AI Category'] || ''
    }));

    res.json({
      conversations: results,
      hasMore: !!(searchData.pages?.next),
      nextCursor: searchData.pages?.next?.starting_after || null
    });
  } catch (error) {
    logger.error('Error executing report:', error);
    res.status(500).json({ message: 'Failed to execute report' });
  }
};

// ============================================
// CONVERSATION METADATA (drill-in right panel)
// ============================================

// @desc    Get extended metadata for a single conversation
// @route   GET /api/qa/intercom-report/conversation/:id
// @access  Private
exports.getConversationMeta = async (req, res) => {
  try {
    const { id } = req.params;
    const headers = getIntercomHeaders();

    const resp = await fetchWithRetry(`${INTERCOM_API_BASE}/conversations/${id}`, {
      headers
    });

    if (!resp.ok) {
      if (resp.status === 404) return res.status(404).json({ message: 'Conversation not found' });
      return res.status(resp.status).json({ message: 'Failed to fetch conversation' });
    }

    const conv = await resp.json();

    // Fetch contact kyc_country if contact exists
    const contactId = conv.contacts?.contacts?.[0]?.id;
    let kycCountry = null;
    if (contactId) {
      kycCountry = await fetchContactAttribute(contactId, 'kyc_country');
    }

    res.json({
      id: conv.id,
      title: conv.title || '',
      aiTitle: conv.custom_attributes?.['AI Title'] || '',
      category: conv.custom_attributes?.['AI Category'] || '',
      state: conv.state,
      createdAt: conv.created_at,
      updatedAt: conv.updated_at,
      contactExternalId: conv.contacts?.contacts?.[0]?.external_id || '',
      contactId: contactId || '',
      kycCountry,
      topics: (conv.topics?.topics || []).map(t => t.name || t),
      tags: (conv.tags?.tags || []).map(t => ({ id: t.id, name: t.name })),
      adminAssigneeId: conv.admin_assignee_id || null,
      teamAssigneeId: conv.team_assignee_id || null,
      statistics: conv.statistics || {}
    });
  } catch (error) {
    logger.error('Error fetching conversation meta:', error);
    res.status(500).json({ message: 'Failed to fetch conversation metadata' });
  }
};
