require('dotenv').config();
const cloudinary = require('cloudinary').v2;
const path = require('path');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

async function uploadSlide8() {
  const videoPath = 'd:/Clara/tutorial-videos/spojeni.mp4';

  try {
    console.log('Uploading slide 8 video (spojeni.mp4)...\n');

    const result = await cloudinary.uploader.upload(videoPath, {
      resource_type: 'video',
      folder: 'clara-tutorial',
      public_id: 'slide-8',
      overwrite: true,
      chunk_size: 6000000
    });

    console.log('✓ Successfully uploaded!');
    console.log('URL:', result.secure_url);
    console.log('\nCopy this to TutorialModal.jsx:');
    console.log(`videoSrc: "${result.secure_url}"`);
  } catch (error) {
    console.error('✗ Upload failed:', error.message);
  }
}

uploadSlide8();
