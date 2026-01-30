/**
 * Knowledge Base API Tests
 *
 * Run with: node tests/knowledge-base/kb-api.test.js
 *
 * Requires:
 * - MongoDB connection (TEST_MONGO_URI or MONGO_URI in .env)
 * - JWT_SECRET in .env
 *
 * These tests use the existing test pattern in the project (manual Node.js tests).
 * They create test data, run assertions, and clean up.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

// Models
const KBPage = require('../../models/KBPage');
const KBTemplate = require('../../models/KBTemplate');
const KBPageVersion = require('../../models/KBPageVersion');
const KBComment = require('../../models/KBComment');
const KBPageAnalytics = require('../../models/KBPageAnalytics');
const KBUserPreferences = require('../../models/KBUserPreferences');
const User = require('../../models/User');

const MONGO_URI = process.env.TEST_MONGO_URI || process.env.MONGO_URI;
const JWT_SECRET = process.env.JWT_SECRET;

let testUser;
let testToken;
let testPage;
let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  \u2713 ${message}`);
    passed++;
  } else {
    console.error(`  \u2717 FAIL: ${message}`);
    failed++;
  }
}

async function setup() {
  console.log('\n--- Setting up test environment ---');
  await mongoose.connect(MONGO_URI);

  // Create or find test user
  testUser = await User.findOne({ email: 'kb-test@test.com' });
  if (!testUser) {
    testUser = await User.create({
      name: 'KB Test User',
      email: 'kb-test@test.com',
      password: 'testpassword123',
      role: 'user'
    });
  }
  testToken = jwt.sign({ id: testUser._id }, JWT_SECRET, { algorithm: 'HS256' });
  console.log('Test user ready:', testUser.email);
}

async function cleanup() {
  console.log('\n--- Cleaning up test data ---');
  await KBPage.deleteMany({ createdBy: testUser._id });
  await KBTemplate.deleteMany({ createdBy: testUser._id });
  await KBPageVersion.deleteMany({ createdBy: testUser._id });
  await KBComment.deleteMany({ author: testUser._id });
  await KBPageAnalytics.deleteMany({});
  await KBUserPreferences.deleteMany({ user: testUser._id });
  console.log('Cleanup complete');
}

// ==================== KBPage Model Tests ====================

async function testKBPageModel() {
  console.log('\n=== KBPage Model Tests ===');

  // Create page
  testPage = await KBPage.create({
    title: 'Test Page',
    slug: `test-page-${Date.now()}`,
    icon: '📄',
    blocks: [
      { id: 'b1', type: 'paragraph', defaultContent: 'Hello World', variants: new Map(), properties: {} },
      { id: 'b2', type: 'heading_1', defaultContent: 'Title', variants: new Map(), properties: {} }
    ],
    dropdowns: [],
    createdBy: testUser._id,
    lastModifiedBy: testUser._id,
    tags: ['test', 'documentation']
  });
  assert(testPage._id, 'Page created successfully');
  assert(testPage.slug.startsWith('test-page'), 'Slug generated correctly');
  assert(testPage.blocks.length === 2, 'Blocks saved correctly');
  assert(testPage.tags.length === 2, 'Tags saved correctly');

  // Find by slug
  const found = await KBPage.findOne({ slug: testPage.slug });
  assert(found && found.title === 'Test Page', 'Page found by slug');

  // Update page
  found.title = 'Updated Test Page';
  found.lastModifiedBy = testUser._id;
  await found.save();
  const updated = await KBPage.findById(found._id);
  assert(updated.title === 'Updated Test Page', 'Page updated successfully');

  // Get tree
  const tree = await KBPage.getTree(true);
  assert(Array.isArray(tree), 'getTree returns array');
  const treeHasPage = tree.some(p => p._id.toString() === testPage._id.toString());
  assert(treeHasPage, 'Tree contains test page');

  // Get breadcrumbs
  const breadcrumbs = await updated.getBreadcrumbs();
  assert(Array.isArray(breadcrumbs), 'getBreadcrumbs returns array');
  assert(breadcrumbs.length > 0, 'Breadcrumbs not empty');

  // Soft delete
  updated.isDeleted = true;
  updated.deletedAt = new Date();
  updated.deletedBy = testUser._id;
  await updated.save();
  const deleted = await KBPage.findById(updated._id);
  assert(deleted.isDeleted === true, 'Page soft deleted');

  // Tree should not include deleted pages
  const treeAfterDelete = await KBPage.getTree(true);
  const treeStillHasPage = treeAfterDelete.some(p => p._id.toString() === testPage._id.toString());
  assert(!treeStillHasPage, 'Deleted page excluded from tree');

  // Restore for further tests
  deleted.isDeleted = false;
  deleted.deletedAt = null;
  deleted.deletedBy = null;
  await deleted.save();
}

// ==================== KBTemplate Model Tests ====================

async function testKBTemplateModel() {
  console.log('\n=== KBTemplate Model Tests ===');

  const template = await KBTemplate.create({
    title: 'Test Template',
    description: 'A test template',
    icon: '📋',
    category: 'custom',
    blocks: [
      { id: 'tb1', type: 'paragraph', defaultContent: 'Template content' }
    ],
    isPublic: true,
    createdBy: testUser._id,
    tags: ['test']
  });
  assert(template._id, 'Template created');
  assert(template.category === 'custom', 'Template category correct');
  assert(template.usageCount === 0, 'Usage count starts at 0');

  // Find templates
  const templates = await KBTemplate.find({ createdBy: testUser._id });
  assert(templates.length > 0, 'Templates found');

  // Update usage count
  template.usageCount += 1;
  await template.save();
  const updated = await KBTemplate.findById(template._id);
  assert(updated.usageCount === 1, 'Usage count incremented');
}

// ==================== KBPageVersion Model Tests ====================

async function testKBPageVersionModel() {
  console.log('\n=== KBPageVersion Model Tests ===');

  // Create version
  const version = await KBPageVersion.createVersion(testPage, testUser._id, 'Initial version');
  assert(version, 'Version created');
  assert(version.version === 1, 'Version number is 1');
  assert(version.title === testPage.title, 'Version title matches page');

  // Create another version
  const version2 = await KBPageVersion.createVersion(testPage, testUser._id, 'Second version');
  assert(version2.version === 2, 'Version number incremented to 2');

  // Get versions
  const versions = await KBPageVersion.getVersions(testPage._id);
  assert(versions.length === 2, 'Both versions retrieved');
  assert(versions[0].version > versions[1].version, 'Versions ordered desc');
}

// ==================== KBComment Model Tests ====================

async function testKBCommentModel() {
  console.log('\n=== KBComment Model Tests ===');

  // Create comment
  const comment = await KBComment.create({
    page: testPage._id,
    content: 'Test comment',
    author: testUser._id
  });
  assert(comment._id, 'Comment created');
  assert(comment.isResolved === false, 'Comment not resolved by default');

  // Create reply
  const reply = await KBComment.create({
    page: testPage._id,
    content: 'Test reply',
    author: testUser._id,
    parentComment: comment._id
  });
  assert(reply.parentComment.toString() === comment._id.toString(), 'Reply linked to parent');

  // Get page comments
  const comments = await KBComment.getPageComments(testPage._id);
  assert(comments.length >= 1, 'Page comments retrieved');

  // Resolve comment
  comment.isResolved = true;
  comment.resolvedBy = testUser._id;
  comment.resolvedAt = new Date();
  await comment.save();
  const resolved = await KBComment.findById(comment._id);
  assert(resolved.isResolved === true, 'Comment resolved');

  // Get unresolved count
  const unresolvedCount = await KBComment.getUnresolvedCount(testPage._id);
  assert(typeof unresolvedCount === 'number', 'Unresolved count returned');
}

// ==================== KBPageAnalytics Model Tests ====================

async function testKBPageAnalyticsModel() {
  console.log('\n=== KBPageAnalytics Model Tests ===');

  // Track view
  await KBPageAnalytics.trackView(testPage._id, testUser._id);
  const analytics = await KBPageAnalytics.findOne({ page: testPage._id });
  assert(analytics, 'Analytics record created');
  assert(analytics.views >= 1, 'View count >= 1');

  // Track another view
  await KBPageAnalytics.trackView(testPage._id, testUser._id);
  const updated = await KBPageAnalytics.findOne({ page: testPage._id });
  assert(updated.views >= 2, 'View count incremented');

  // Get page analytics
  const pageAnalytics = await KBPageAnalytics.getPageAnalytics(testPage._id, 30);
  assert(Array.isArray(pageAnalytics), 'Page analytics returned as array');

  // Get top pages
  const topPages = await KBPageAnalytics.getTopPages(5);
  assert(Array.isArray(topPages), 'Top pages returned as array');
}

// ==================== KBUserPreferences Model Tests ====================

async function testKBUserPreferencesModel() {
  console.log('\n=== KBUserPreferences Model Tests ===');

  // Get or create
  const prefs = await KBUserPreferences.getOrCreate(testUser._id);
  assert(prefs, 'Preferences created');
  assert(prefs.user.toString() === testUser._id.toString(), 'Preferences linked to user');

  // Toggle favorite
  const result = await KBUserPreferences.toggleFavorite(testUser._id, testPage._id);
  assert(result.favorites.length === 1, 'Favorite added');

  // Toggle again (remove)
  const result2 = await KBUserPreferences.toggleFavorite(testUser._id, testPage._id);
  assert(result2.favorites.length === 0, 'Favorite removed');

  // Track visit
  await KBUserPreferences.trackVisit(testUser._id, testPage._id);
  const updatedPrefs = await KBUserPreferences.findOne({ user: testUser._id });
  assert(updatedPrefs.recentPages.length > 0, 'Visit tracked');
}

// ==================== Run All Tests ====================

async function runTests() {
  console.log('╔══════════════════════════════════════╗');
  console.log('║  Knowledge Base API Tests            ║');
  console.log('╚══════════════════════════════════════╝');

  try {
    await setup();

    await testKBPageModel();
    await testKBTemplateModel();
    await testKBPageVersionModel();
    await testKBCommentModel();
    await testKBPageAnalyticsModel();
    await testKBUserPreferencesModel();

    await cleanup();
  } catch (error) {
    console.error('\n!!! Test error:', error);
    failed++;
  } finally {
    await mongoose.connection.close();
  }

  console.log('\n╔══════════════════════════════════════╗');
  console.log(`║  Results: ${passed} passed, ${failed} failed        ║`);
  console.log('╚══════════════════════════════════════╝');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
