require('dotenv').config();
const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB Connected');

    const CanvasElement = require('./models/CanvasElement');
    const Canvas = require('./models/Canvas');
    const Workspace = require('./models/Workspace');

    // Get all workspaces
    const workspaces = await Workspace.find({});
    console.log('\n📊 WORKSPACES:');
    for (const ws of workspaces) {
      console.log(`  - ${ws.name} (${ws.type}) - ID: ${ws._id}`);
    }

    // Get all canvases
    const canvases = await Canvas.find({}).populate('workspace');
    console.log('\n📊 CANVASES:');
    for (const canvas of canvases) {
      console.log(`  - Canvas for: ${canvas.workspace?.name} - ID: ${canvas._id}`);
    }

    // Count total elements
    const totalElements = await CanvasElement.countDocuments({});
    console.log(`\n📊 TOTAL ELEMENTS: ${totalElements}`);

    // Count elements by canvas
    for (const canvas of canvases) {
      const count = await CanvasElement.countDocuments({ canvas: canvas._id });
      console.log(`  - ${canvas.workspace?.name}: ${count} elements`);
    }

    // Count elements with embeddings
    const withEmbeddings = await CanvasElement.countDocuments({
      embedding: { $exists: true, $ne: null },
      embeddingOutdated: false
    });

    const withoutEmbeddings = await CanvasElement.countDocuments({
      $or: [
        { embedding: null },
        { embedding: { $exists: false } },
        { embeddingOutdated: true }
      ]
    });

    console.log(`\n📊 EMBEDDINGS STATUS:`);
    console.log(`  ✅ With embeddings: ${withEmbeddings}`);
    console.log(`  ❌ Without embeddings: ${withoutEmbeddings}`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
};

connectDB();
