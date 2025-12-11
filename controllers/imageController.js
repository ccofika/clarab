const cloudinary = require('../config/cloudinary');
const multer = require('multer');
const { Readable } = require('stream');
const { logActivity } = require('../utils/activityLogger');

// Configure multer to store files in memory
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max file size
  },
  fileFilter: (req, file, cb) => {
    // Accept only image files
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

// Upload image to Cloudinary
const uploadImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No image file provided' });
    }

    // Determine folder based on request parameter (default to canvas-elements)
    const folder = req.query.folder === 'tickets' ? 'clara/tickets' : 'clara/canvas-elements';

    // Convert buffer to stream
    const stream = Readable.from(req.file.buffer);

    // Upload to Cloudinary using stream
    const uploadPromise = new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: folder, // Organized folder structure
          resource_type: 'image',
          allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'],
          transformation: [
            { quality: 'auto:good' }, // Automatic quality optimization
            { fetch_format: 'auto' } // Automatic format selection
          ]
        },
        (error, result) => {
          if (error) {
            reject(error);
          } else {
            resolve(result);
          }
        }
      );

      stream.pipe(uploadStream);
    });

    const result = await uploadPromise;

    // Log image upload
    await logActivity({
      level: 'info',
      message: `Image uploaded: "${result.public_id}"`,
      module: 'imageController',
      user: req.user?._id,
      metadata: {
        image: result.public_id,
        format: result.format,
        size: `${(result.bytes / 1024).toFixed(2)} KB`,
        dimensions: `${result.width}x${result.height}`
      },
      req
    });

    // Return image data
    res.status(200).json({
      success: true,
      image: {
        url: result.secure_url,
        publicId: result.public_id,
        width: result.width,
        height: result.height,
        format: result.format,
        bytes: result.bytes,
        createdAt: result.created_at
      }
    });
  } catch (error) {
    console.error('Error uploading image to Cloudinary:', error);
    // Log error
    await logActivity({
      level: 'error',
      message: 'Failed to upload image',
      module: 'imageController',
      user: req.user?._id,
      metadata: { error: error.message },
      req
    });
    res.status(500).json({
      success: false,
      message: 'Failed to upload image',
      error: error.message
    });
  }
};

// Delete image from Cloudinary
const deleteImage = async (req, res) => {
  try {
    const { publicId } = req.body;

    if (!publicId) {
      return res.status(400).json({ message: 'Public ID is required' });
    }

    // Delete from Cloudinary
    const result = await cloudinary.uploader.destroy(publicId);

    if (result.result === 'ok') {
      // Log image deletion
      await logActivity({
        level: 'info',
        message: `Image deleted: "${publicId}"`,
        module: 'imageController',
        user: req.user?._id,
        metadata: { image: publicId },
        req
      });

      res.status(200).json({
        success: true,
        message: 'Image deleted successfully'
      });
    } else {
      // Log warning for failed deletion
      await logActivity({
        level: 'warn',
        message: `Failed to delete image: "${publicId}"`,
        module: 'imageController',
        user: req.user?._id,
        metadata: { image: publicId, result: result.result },
        req
      });

      res.status(400).json({
        success: false,
        message: 'Failed to delete image',
        result
      });
    }
  } catch (error) {
    console.error('Error deleting image from Cloudinary:', error);
    // Log error
    await logActivity({
      level: 'error',
      message: 'Error deleting image',
      module: 'imageController',
      user: req.user?._id,
      metadata: { error: error.message, image: req.body.publicId },
      req
    });
    res.status(500).json({
      success: false,
      message: 'Failed to delete image',
      error: error.message
    });
  }
};

module.exports = {
  upload,
  uploadImage,
  deleteImage
};
