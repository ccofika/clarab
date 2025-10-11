const express = require('express');
const router = express.Router();
const { upload, uploadImage, deleteImage } = require('../controllers/imageController');
const { protect } = require('../middleware/auth');

// All routes are protected - user must be authenticated
router.post('/upload', protect, upload.single('image'), uploadImage);
router.delete('/delete', protect, deleteImage);

module.exports = router;
