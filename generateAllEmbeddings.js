require('dotenv').config();
const mongoose = require('mongoose');
const {
  generateElementEmbedding
} = require('./utils/openai');

const runMigration = async (force = false) => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB Connected\n');

    // Load all models
    const Canvas = require('./models/Canvas');
    const Workspace = require('./models/Workspace');
    const CanvasElement = require('./models/CanvasElement');

    // Find all elements without embeddings (or all if force)
    let query = {};
    if (!force) {
      query = {
        $or: [
          { embedding: null },
          { embedding: { $exists: false } },
          { embeddingOutdated: true }
        ]
      };
    }

    const elements = await CanvasElement.find(query).populate({
      path: 'canvas',
      populate: { path: 'workspace' }
    });

    console.log(`📊 Found ${elements.length} elements without embeddings\n`);

    if (elements.length === 0) {
      console.log('✅ All elements already have embeddings!');
      process.exit(0);
    }

    let processed = 0;
    let errors = 0;
    const batchSize = 20;

    for (let i = 0; i < elements.length; i += batchSize) {
      const batch = elements.slice(i, i + batchSize);

      console.log(`\n🔄 Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(elements.length / batchSize)} (${batch.length} elements)...`);

      await Promise.all(
        batch.map(async (element, index) => {
          try {
            const workspaceName = element.canvas?.workspace?.name || 'Unknown';
            const elementType = element.type;

            process.stdout.write(`  [${i + index + 1}/${elements.length}] ${workspaceName} - ${elementType}... `);

            // Fetch all elements in same canvas for context
            const allCanvasElements = await CanvasElement.find({ canvas: element.canvas._id });

            const embedding = await generateElementEmbedding(element, allCanvasElements);

            if (embedding) {
              // Re-fetch element to check if it still exists
              const existingElement = await CanvasElement.findById(element._id);
              if (existingElement) {
                // Use findByIdAndUpdate to avoid version conflicts
                await CanvasElement.findByIdAndUpdate(element._id, {
                  embedding: embedding,
                  embeddingOutdated: false
                });
                console.log('✅');
                processed++;
              } else {
                console.log('⏭️  (deleted)');
              }
            } else {
              console.log('⏭️  (no content)');
            }
          } catch (error) {
            // Don't count version errors as errors (element was deleted)
            if (error.name === 'VersionError') {
              console.log('⏭️  (deleted)');
            } else {
              console.log(`❌ Error: ${error.message}`);
              errors++;
            }
          }
        })
      );

      // Delay between batches to respect rate limits
      if (i + batchSize < elements.length) {
        console.log('⏳ Waiting 1s before next batch...');
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    console.log('\n\n' + '='.repeat(50));
    console.log('🎉 MIGRATION COMPLETE!');
    console.log('='.repeat(50));
    console.log(`✅ Processed: ${processed}`);
    console.log(`❌ Errors: ${errors}`);
    console.log(`📊 Total: ${elements.length}`);
    console.log('='.repeat(50) + '\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
};

// Check for --force flag
const force = process.argv.includes('--force');
if (force) {
  console.log('⚠️  FORCE MODE: Regenerating ALL embeddings\n');
}

runMigration(force);
