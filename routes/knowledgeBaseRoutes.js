const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const KBAdmin = require('../models/KBAdmin');

const {
  // Admin status
  checkAdminStatus,
  // Page CRUD
  getAllPages,
  getPageById,
  getPageBySlug,
  createPage,
  updatePage,
  deletePage,
  reorderPage,
  copyBlockToPage,
  // Admin management
  getAdmins,
  addAdmin,
  removeAdmin,
  // Edit logs
  getEditLogs,
  getPageEditLogs,
  // Sections
  getSections,
  createSection,
  updateSection,
  deleteSection
} = require('../controllers/knowledgeBaseController');

// Hardcoded superadmin email
const SUPER_ADMIN_EMAIL = 'filipkozomara@mebit.io';

// Middleware to check if user is KB admin (admin or superadmin)
const kbAdminAuth = async (req, res, next) => {
  try {
    // Superadmin always has access
    if (req.user.email.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase()) {
      req.isSuperAdmin = true;
      req.isKBAdmin = true;
      return next();
    }

    // Check if user is in KBAdmin collection
    const isAdmin = await KBAdmin.isAdmin(req.user._id);
    if (!isAdmin) {
      return res.status(403).json({ message: 'Admin access required' });
    }

    req.isKBAdmin = true;
    next();
  } catch (error) {
    console.error('KB Admin auth error:', error);
    res.status(500).json({ message: 'Authorization check failed' });
  }
};

// Middleware for superadmin only actions
const superAdminAuth = async (req, res, next) => {
  if (req.user.email.toLowerCase() !== SUPER_ADMIN_EMAIL.toLowerCase()) {
    return res.status(403).json({ message: 'Superadmin access required' });
  }
  req.isSuperAdmin = true;
  req.isKBAdmin = true;
  next();
};

// Optional admin check (doesn't block, just sets flag)
const optionalAdminCheck = async (req, res, next) => {
  try {
    if (req.user.email.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase()) {
      req.isSuperAdmin = true;
      req.isKBAdmin = true;
    } else {
      req.isKBAdmin = await KBAdmin.isAdmin(req.user._id);
    }
  } catch (error) {
    req.isKBAdmin = false;
  }
  next();
};

// ==================== PUBLIC ROUTES (all logged-in users) ====================

// Check admin status
router.get('/check-admin', protect, checkAdminStatus);

// Get all pages (tree structure)
router.get('/pages', protect, optionalAdminCheck, getAllPages);

// Get single page by slug
router.get('/pages/by-slug/:slug', protect, optionalAdminCheck, getPageBySlug);

// ==================== SECTIONS (all users can read, admins can write) ====================

router.get('/sections', protect, getSections);
router.post('/sections', protect, kbAdminAuth, createSection);
router.put('/sections/:id', protect, kbAdminAuth, updateSection);
router.delete('/sections/:id', protect, kbAdminAuth, deleteSection);

// ==================== ADMIN ROUTES ====================

// Get page by ID (for editing)
router.get('/pages/:id', protect, kbAdminAuth, getPageById);

// Create page
router.post('/pages', protect, kbAdminAuth, createPage);

// Update page
router.put('/pages/:id', protect, kbAdminAuth, updatePage);

// Delete page
router.delete('/pages/:id', protect, kbAdminAuth, deletePage);

// Reorder page
router.put('/pages/:id/reorder', protect, kbAdminAuth, reorderPage);

// Copy block to another page
router.post('/pages/:targetPageId/copy-block', protect, kbAdminAuth, copyBlockToPage);

// ==================== SUPERADMIN ROUTES ====================

// Get all admins
router.get('/admins', protect, superAdminAuth, getAdmins);

// Add admin
router.post('/admins', protect, superAdminAuth, addAdmin);

// Remove admin
router.delete('/admins/:id', protect, superAdminAuth, removeAdmin);

// ==================== EDIT LOGS (admin only) ====================

// Get all edit logs
router.get('/logs', protect, kbAdminAuth, getEditLogs);

// Get edit logs for specific page
router.get('/logs/:pageId', protect, kbAdminAuth, getPageEditLogs);

module.exports = router;
