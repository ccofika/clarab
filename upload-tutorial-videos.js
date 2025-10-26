require('dotenv').config();
const cloudinary = require('cloudinary').v2;
const path = require('path');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Video files to upload in order
const videos = [
  { file: 'Black Video.mp4', slideNumber: 1, name: 'slide-1' },
  { file: 'Black Video1.mp4', slideNumber: 2, name: 'slide-2' },
  { file: 'Black Video2.mp4', slideNumber: 3, name: 'slide-3' },
  { file: 'Black Video3.mp4', slideNumber: 4, name: 'slide-4' },
  { file: 'Black Video4.mp4', slideNumber: 5, name: 'slide-5' },
  { file: 'Black Video5.mp4', slideNumber: 6, name: 'slide-6' },
  { file: 'Black Video6.mp4', slideNumber: 7, name: 'slide-7' },
  { file: 'Black Video spojeni.mp4', slideNumber: 8, name: 'slide-8' }
];

async function uploadVideos() {
  console.log('Starting video upload process...\n');
  const results = [];

  for (const video of videos) {
    const videoPath = path.join(__dirname, '..', 'tutorial-videos', video.file);
    const fs = require('fs');
    const stats = fs.statSync(videoPath);
    const fileSizeMB = stats.size / (1024 * 1024);

    try {
      console.log(`[${video.slideNumber}/8] Uploading ${video.file} (${fileSizeMB.toFixed(2)}MB)...`);

      // Use simple options for all files
      const uploadOptions = {
        resource_type: 'video',
        folder: 'clara-tutorial',
        public_id: video.name,
        overwrite: true,
        chunk_size: 6000000 // 6MB chunks for better reliability
      };

      if (fileSizeMB > 50) {
        console.log('  Large file detected, using smaller chunks...');
        uploadOptions.chunk_size = 5000000; // 5MB chunks for very large files
      }

      const result = await cloudinary.uploader.upload(videoPath, uploadOptions);

      console.log(`✓ Successfully uploaded: ${result.secure_url}\n`);

      results.push({
        slideNumber: video.slideNumber,
        name: video.name,
        url: result.secure_url
      });
    } catch (error) {
      console.error(`✗ Failed to upload ${video.file}:`, error.message, '\n');
      results.push({
        slideNumber: video.slideNumber,
        name: video.name,
        error: error.message
      });
    }
  }

  console.log('\n=== UPLOAD SUMMARY ===\n');
  results.forEach(result => {
    if (result.url) {
      console.log(`Slide ${result.slideNumber} (${result.name}): ${result.url}`);
    } else {
      console.log(`Slide ${result.slideNumber} (${result.name}): FAILED - ${result.error}`);
    }
  });

  console.log('\n=== COPY TO TUTORIALMODAL.JSX ===\n');
  results.forEach(result => {
    if (result.url) {
      console.log(`videoSrc: "${result.url}"`);
    }
  });
}

uploadVideos().catch(console.error);
