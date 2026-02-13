/**
 * One-time script to restore the soft-deleted "VIP Program" KB page
 *
 * Run with: node scripts/restoreVIPProgramPage.js
 *
 * This script:
 * 1. Connects to MongoDB
 * 2. Finds all soft-deleted KB pages matching "VIP" in title
 * 3. Restores the VIP Program page (sets isDeleted = false)
 * 4. Also restores any child pages that were deleted with it
 */

require('dotenv').config();
const mongoose = require('mongoose');
const KBPage = require('../models/KBPage');
const KBEditLog = require('../models/KBEditLog');

const MONGODB_URI = process.env.MONGODB_URI;

async function restoreVIPProgramPage() {
  try {
    if (!MONGODB_URI) {
      console.error('ERROR: MONGODB_URI not set. Please check your .env file.');
      process.exit(1);
    }

    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    // First, find ALL soft-deleted pages to see what's in the trash
    const allDeleted = await KBPage.find({ isDeleted: true })
      .select('title slug icon deletedAt deletedBy parentPage')
      .sort({ deletedAt: -1 })
      .lean();

    console.log(`\nFound ${allDeleted.length} total soft-deleted pages:`);
    allDeleted.forEach(p => {
      console.log(`  - "${p.title}" (slug: ${p.slug}, deleted: ${p.deletedAt ? new Date(p.deletedAt).toISOString() : 'unknown'})`);
    });

    // Find VIP-related deleted pages
    const vipPages = allDeleted.filter(p =>
      p.title && p.title.toLowerCase().includes('vip')
    );

    if (vipPages.length === 0) {
      console.log('\nNo soft-deleted pages with "VIP" in the title found.');
      console.log('The page may have been permanently deleted or may have a different title.');

      // Show all deleted pages in case the title is different
      if (allDeleted.length > 0) {
        console.log('\nAll deleted pages listed above - check if any match what you\'re looking for.');
      }

      await mongoose.disconnect();
      return;
    }

    console.log(`\nFound ${vipPages.length} VIP-related deleted page(s):`);
    vipPages.forEach(p => {
      console.log(`  - ID: ${p._id}, Title: "${p.title}", Slug: ${p.slug}, Deleted: ${p.deletedAt ? new Date(p.deletedAt).toISOString() : 'unknown'}`);
    });

    // Restore all VIP pages
    for (const page of vipPages) {
      const result = await KBPage.findByIdAndUpdate(page._id, {
        isDeleted: false,
        $unset: { deletedAt: 1, deletedBy: 1 }
      }, { new: true });

      console.log(`\nRestored: "${result.title}" (${result.slug})`);

      // Also restore any child pages
      const childResult = await KBPage.updateMany(
        { parentPage: page._id, isDeleted: true },
        {
          isDeleted: false,
          $unset: { deletedAt: 1, deletedBy: 1 }
        }
      );

      if (childResult.modifiedCount > 0) {
        console.log(`  Also restored ${childResult.modifiedCount} child page(s)`);
      }

      // Log the restore action
      await KBEditLog.create({
        page: page._id,
        user: null, // Script action - no user
        action: 'restore',
        changes: {
          summary: `Restored from trash via script`
        }
      });
    }

    console.log('\nDone! VIP Program page(s) restored successfully.');
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');

  } catch (error) {
    console.error('Error:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

restoreVIPProgramPage();
