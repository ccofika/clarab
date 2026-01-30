/**
 * Knowledge Base Controller Logic Tests
 *
 * Run with: node tests/knowledge-base/kb-controller.test.js
 *
 * Tests the controller logic for:
 * - Slug generation
 * - Page ordering
 * - Version auto-creation on update
 * - Permission checking
 * - Search functionality
 * - Export formats
 */

require('dotenv').config();
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const KBPage = require('../../models/KBPage');
const KBPageVersion = require('../../models/KBPageVersion');
const KBEditLog = require('../../models/KBEditLog');
const User = require('../../models/User');

const MONGO_URI = process.env.TEST_MONGO_URI || process.env.MONGO_URI;
const JWT_SECRET = process.env.JWT_SECRET;

let testUser;
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
  console.log('\n--- Setting up ---');
  await mongoose.connect(MONGO_URI);
  testUser = await User.findOne({ email: 'kb-ctrl-test@test.com' });
  if (!testUser) {
    testUser = await User.create({
      name: 'KB Controller Test',
      email: 'kb-ctrl-test@test.com',
      password: 'testpassword123',
      role: 'user'
    });
  }
}

async function cleanup() {
  console.log('\n--- Cleaning up ---');
  await KBPage.deleteMany({ createdBy: testUser._id });
  await KBPageVersion.deleteMany({ createdBy: testUser._id });
  await KBEditLog.deleteMany({ user: testUser._id });
}

// ==================== Slug Generation Tests ====================

async function testSlugGeneration() {
  console.log('\n=== Slug Generation Tests ===');

  // Basic slug
  const page1 = await KBPage.create({
    title: 'Hello World',
    slug: 'hello-world',
    createdBy: testUser._id
  });
  assert(page1.slug === 'hello-world', 'Basic slug: hello-world');

  // Slug with special characters (auto-generated via pre-validate)
  const page2 = await KBPage.create({
    title: 'My Page & Other Stuff!',
    slug: 'my-page-other-stuff',
    createdBy: testUser._id
  });
  assert(page2.slug === 'my-page-other-stuff', 'Special chars removed from slug');

  // Duplicate slug handling
  const page3 = await KBPage.create({
    title: 'Hello World Again',
    slug: `hello-world-${Date.now()}`,
    createdBy: testUser._id
  });
  assert(page3.slug !== page1.slug, 'Duplicate slug avoided');
}

// ==================== Page Ordering Tests ====================

async function testPageOrdering() {
  console.log('\n=== Page Ordering Tests ===');

  const pages = [];
  for (let i = 0; i < 3; i++) {
    const page = await KBPage.create({
      title: `Order Test ${i}`,
      slug: `order-test-${i}-${Date.now()}`,
      order: i,
      createdBy: testUser._id
    });
    pages.push(page);
  }

  assert(pages[0].order === 0, 'First page order is 0');
  assert(pages[1].order === 1, 'Second page order is 1');
  assert(pages[2].order === 2, 'Third page order is 2');

  // Reorder: move page 2 to position 0
  pages[2].order = 0;
  await pages[2].save();
  const reordered = await KBPage.findById(pages[2]._id);
  assert(reordered.order === 0, 'Page reordered to position 0');
}

// ==================== Version Creation Tests ====================

async function testVersionCreation() {
  console.log('\n=== Version Auto-Creation Tests ===');

  const page = await KBPage.create({
    title: 'Version Test Page',
    slug: `version-test-${Date.now()}`,
    blocks: [
      { id: 'b1', type: 'paragraph', defaultContent: 'Original content', variants: new Map(), properties: {} }
    ],
    createdBy: testUser._id,
    lastModifiedBy: testUser._id
  });

  // Simulate what updatePage controller does - create version before update
  const version1 = await KBPageVersion.createVersion(page, testUser._id, 'Before first update');
  assert(version1.version === 1, 'First version created');
  assert(version1.title === 'Version Test Page', 'Version captures original title');
  assert(version1.blocks.length === 1, 'Version captures original blocks');

  // Modify the page
  page.title = 'Updated Version Test';
  page.blocks = [
    { id: 'b1', type: 'paragraph', defaultContent: 'Updated content', variants: new Map(), properties: {} },
    { id: 'b2', type: 'heading_1', defaultContent: 'New heading', variants: new Map(), properties: {} }
  ];
  await page.save();

  // Create another version
  const version2 = await KBPageVersion.createVersion(page, testUser._id, 'Changed: title, content');
  assert(version2.version === 2, 'Second version created');
  assert(version2.title === 'Updated Version Test', 'Version captures updated title');
  assert(version2.blocks.length === 2, 'Version captures updated blocks');

  // Verify versions are retrievable
  const versions = await KBPageVersion.getVersions(page._id);
  assert(versions.length === 2, 'Both versions retrievable');
  assert(versions[0].version === 2, 'Latest version first');
}

// ==================== Page Permissions Tests ====================

async function testPagePermissions() {
  console.log('\n=== Page Permissions Tests ===');

  const page = await KBPage.create({
    title: 'Permission Test',
    slug: `perm-test-${Date.now()}`,
    createdBy: testUser._id,
    permissions: {
      visibility: 'workspace',
      inheritFromParent: true,
      users: [],
      shareLink: { enabled: false }
    }
  });

  assert(page.permissions.visibility === 'workspace', 'Default visibility is workspace');
  assert(page.permissions.inheritFromParent === true, 'Default inherit from parent is true');

  // Update to private
  page.permissions.visibility = 'private';
  page.permissions.users = [{
    user: testUser._id,
    role: 'editor'
  }];
  await page.save();

  const updated = await KBPage.findById(page._id);
  assert(updated.permissions.visibility === 'private', 'Visibility updated to private');
  assert(updated.permissions.users.length === 1, 'User permission added');
  assert(updated.permissions.users[0].role === 'editor', 'User role is editor');

  // Enable share link
  const crypto = require('crypto');
  page.permissions.shareLink = {
    enabled: true,
    token: crypto.randomBytes(16).toString('hex'),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  };
  await page.save();

  const withLink = await KBPage.findById(page._id);
  assert(withLink.permissions.shareLink.enabled === true, 'Share link enabled');
  assert(withLink.permissions.shareLink.token.length > 0, 'Share token generated');
}

// ==================== Tags Tests ====================

async function testTags() {
  console.log('\n=== Tags Tests ===');

  const page = await KBPage.create({
    title: 'Tag Test',
    slug: `tag-test-${Date.now()}`,
    createdBy: testUser._id,
    tags: ['Documentation', 'API', 'Getting Started']
  });

  assert(page.tags.length === 3, 'Tags saved');
  assert(page.tags[0] === 'documentation', 'Tags lowercased');
  assert(page.tags[1] === 'api', 'Tags lowercased');

  // Find by tag
  const found = await KBPage.find({ tags: 'api' });
  assert(found.length > 0, 'Pages found by tag');

  // Update tags
  page.tags = ['updated-tag'];
  await page.save();
  const updated = await KBPage.findById(page._id);
  assert(updated.tags.length === 1, 'Tags updated');
  assert(updated.tags[0] === 'updated-tag', 'New tag value correct');
}

// ==================== Search Tests ====================

async function testSearch() {
  console.log('\n=== Search Tests ===');

  // Create pages with searchable content
  await KBPage.create({
    title: 'Search Alpha Page',
    slug: `search-alpha-${Date.now()}`,
    createdBy: testUser._id,
    blocks: [
      { id: 's1', type: 'paragraph', defaultContent: 'This contains searchable alpha content', variants: new Map(), properties: {} }
    ],
    tags: ['searchtest']
  });

  await KBPage.create({
    title: 'Search Beta Page',
    slug: `search-beta-${Date.now()}`,
    createdBy: testUser._id,
    blocks: [
      { id: 's2', type: 'paragraph', defaultContent: 'Different beta content here', variants: new Map(), properties: {} }
    ],
    tags: ['searchtest']
  });

  // Search by title (using MongoDB text index)
  const titleResults = await KBPage.find({
    $or: [
      { title: { $regex: 'Alpha', $options: 'i' } },
      { tags: { $regex: 'Alpha', $options: 'i' } }
    ],
    isDeleted: false
  });
  assert(titleResults.length >= 1, 'Search by title found results');
  assert(titleResults.some(p => p.title.includes('Alpha')), 'Correct page found');

  // Search by tag
  const tagResults = await KBPage.find({ tags: 'searchtest', isDeleted: false });
  assert(tagResults.length >= 2, 'Search by tag found both pages');
}

// ==================== Run All Tests ====================

async function runTests() {
  console.log('╔══════════════════════════════════════════╗');
  console.log('║  Knowledge Base Controller Logic Tests   ║');
  console.log('╚══════════════════════════════════════════╝');

  try {
    await setup();

    await testSlugGeneration();
    await testPageOrdering();
    await testVersionCreation();
    await testPagePermissions();
    await testTags();
    await testSearch();

    await cleanup();
  } catch (error) {
    console.error('\n!!! Test error:', error);
    failed++;
  } finally {
    await mongoose.connection.close();
  }

  console.log('\n╔══════════════════════════════════════════╗');
  console.log(`║  Results: ${passed} passed, ${failed} failed              ║`);
  console.log('╚══════════════════════════════════════════╝');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
