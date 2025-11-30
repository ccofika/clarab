require('dotenv').config();
const mongoose = require('mongoose');

const getTemplatePositions = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB Connected\n');

    const CanvasElement = require('./models/CanvasElement');
    const Canvas = require('./models/Canvas');
    const Workspace = require('./models/Workspace');

    // ==========================================
    // SINGLE MACRO TEMPLATE - QA feedbacks workspace
    // ==========================================
    console.log('=' .repeat(60));
    console.log('SINGLE MACRO TEMPLATE - QA feedbacks workspace');
    console.log('=' .repeat(60));

    const qaWorkspace = await Workspace.findOne({ name: /QA feedbacks/i });
    if (qaWorkspace) {
      console.log(`\n📁 Workspace: ${qaWorkspace.name} (ID: ${qaWorkspace._id})`);

      const qaCanvas = await Canvas.findOne({ workspace: qaWorkspace._id });
      if (qaCanvas) {
        console.log(`📋 Canvas ID: ${qaCanvas._id}\n`);

        // Find title "LIVE GAMES"
        const liveGamesTitle = await CanvasElement.findOne({
          canvas: qaCanvas._id,
          type: 'title',
          'content.value': /LIVE GAMES/i
        });

        if (liveGamesTitle) {
          console.log('📝 TITLE Element (LIVE GAMES):');
          console.log(`   Position: x=${liveGamesTitle.position.x}, y=${liveGamesTitle.position.y}, z=${liveGamesTitle.position.z}`);
          console.log(`   Dimensions: ${liveGamesTitle.dimensions.width}x${liveGamesTitle.dimensions.height}`);
          console.log(`   Style fontSize: ${liveGamesTitle.style?.fontSize}`);
          console.log(`   Content: ${liveGamesTitle.content?.value}\n`);
        } else {
          console.log('❌ Title "LIVE GAMES" not found\n');
        }

        // Find macro with "Live game nepotrebno otvoren Jira case"
        const liveGameMacro = await CanvasElement.findOne({
          canvas: qaCanvas._id,
          type: 'macro',
          $or: [
            { 'content.title': /Live game nepotrebno otvoren Jira case/i },
            { 'content.description': /Live game nepotrebno otvoren Jira case/i }
          ]
        });

        if (liveGameMacro) {
          console.log('📝 MACRO Element (Live game nepotrebno otvoren...):');
          console.log(`   Position: x=${liveGameMacro.position.x}, y=${liveGameMacro.position.y}, z=${liveGameMacro.position.z}`);
          console.log(`   Dimensions: ${liveGameMacro.dimensions.width}x${liveGameMacro.dimensions.height}`);
          console.log(`   Title: ${liveGameMacro.content?.title}`);
          console.log(`   Description: ${liveGameMacro.content?.description?.substring(0, 100)}...\n`);
        } else {
          console.log('❌ Macro "Live game nepotrebno otvoren Jira case" not found\n');
        }

        // Calculate offset between title and macro
        if (liveGamesTitle && liveGameMacro) {
          const offsetX = liveGameMacro.position.x - liveGamesTitle.position.x;
          const offsetY = liveGameMacro.position.y - liveGamesTitle.position.y;
          console.log('📐 SINGLE MACRO TEMPLATE - RELATIVE POSITIONING:');
          console.log(`   Title Position: (0, 0) - BASE`);
          console.log(`   Macro Offset from Title: (${offsetX}, ${offsetY})`);
          console.log(`   Vertical Gap: ${offsetY - liveGamesTitle.dimensions.height}px\n`);
        }
      }
    } else {
      console.log('❌ QA feedbacks workspace not found\n');
    }

    // ==========================================
    // NEW ANNOUNCEMENT TEMPLATE - Announcements workspace
    // ==========================================
    console.log('\n' + '=' .repeat(60));
    console.log('NEW ANNOUNCEMENT TEMPLATE - Announcements workspace');
    console.log('=' .repeat(60));

    const announcementsWorkspace = await Workspace.findOne({
      $or: [
        { type: 'announcements' },
        { name: /Announcements/i }
      ]
    });

    if (announcementsWorkspace) {
      console.log(`\n📁 Workspace: ${announcementsWorkspace.name} (ID: ${announcementsWorkspace._id})`);

      const announcementsCanvas = await Canvas.findOne({ workspace: announcementsWorkspace._id });
      if (announcementsCanvas) {
        console.log(`📋 Canvas ID: ${announcementsCanvas._id}\n`);

        // Find title "LEVEL UP PROCEDURE 10/11/2025"
        const levelUpTitle = await CanvasElement.findOne({
          canvas: announcementsCanvas._id,
          type: 'title',
          'content.value': /LEVEL UP PROCEDURE/i
        });

        if (levelUpTitle) {
          console.log('📝 TITLE Element (LEVEL UP PROCEDURE...):');
          console.log(`   Position: x=${levelUpTitle.position.x}, y=${levelUpTitle.position.y}, z=${levelUpTitle.position.z}`);
          console.log(`   Dimensions: ${levelUpTitle.dimensions.width}x${levelUpTitle.dimensions.height}`);
          console.log(`   Style fontSize: ${levelUpTitle.style?.fontSize}`);
          console.log(`   Content: ${levelUpTitle.content?.value}\n`);
        } else {
          console.log('❌ Title "LEVEL UP PROCEDURE" not found\n');
        }

        // Find description with "user levels up to a new VIP level"
        const levelUpDescription = await CanvasElement.findOne({
          canvas: announcementsCanvas._id,
          type: 'description',
          'content.value': /levels up to a new VIP level/i
        });

        if (levelUpDescription) {
          console.log('📝 DESCRIPTION Element:');
          console.log(`   Position: x=${levelUpDescription.position.x}, y=${levelUpDescription.position.y}, z=${levelUpDescription.position.z}`);
          console.log(`   Dimensions: ${levelUpDescription.dimensions.width}x${levelUpDescription.dimensions.height}`);
          console.log(`   Content: ${levelUpDescription.content?.value?.substring(0, 100)}...\n`);
        } else {
          console.log('❌ Description "levels up to a new VIP level" not found\n');
        }

        // Find macro "LEVEL UP - FIRST RESPONSE"
        const levelUpMacro = await CanvasElement.findOne({
          canvas: announcementsCanvas._id,
          type: 'macro',
          'content.title': /LEVEL UP - FIRST RESPONSE/i
        });

        if (levelUpMacro) {
          console.log('📝 MACRO Element (LEVEL UP - FIRST RESPONSE):');
          console.log(`   Position: x=${levelUpMacro.position.x}, y=${levelUpMacro.position.y}, z=${levelUpMacro.position.z}`);
          console.log(`   Dimensions: ${levelUpMacro.dimensions.width}x${levelUpMacro.dimensions.height}`);
          console.log(`   Title: ${levelUpMacro.content?.title}`);
          console.log(`   Description: ${levelUpMacro.content?.description?.substring(0, 100)}...\n`);
        } else {
          console.log('❌ Macro "LEVEL UP - FIRST RESPONSE" not found\n');
        }

        // Find example "More than 15 minutes"
        const levelUpExample = await CanvasElement.findOne({
          canvas: announcementsCanvas._id,
          type: 'example',
          $or: [
            { 'content.examples.title': /More than 15 minutes/i },
            { 'content.examples.messages.text': /More than 15 minutes/i }
          ]
        });

        if (levelUpExample) {
          console.log('📝 EXAMPLE Element (More than 15 minutes...):');
          console.log(`   Position: x=${levelUpExample.position.x}, y=${levelUpExample.position.y}, z=${levelUpExample.position.z}`);
          console.log(`   Dimensions: ${levelUpExample.dimensions.width}x${levelUpExample.dimensions.height}`);
          console.log(`   Examples count: ${levelUpExample.content?.examples?.length}`);
          if (levelUpExample.content?.examples?.length > 0) {
            console.log(`   First example title: ${levelUpExample.content?.examples[0]?.title}\n`);
          }
        } else {
          console.log('❌ Example "More than 15 minutes" not found\n');
        }

        // Calculate relative positions for NEW ANNOUNCEMENT template
        if (levelUpTitle && levelUpDescription && levelUpMacro && levelUpExample) {
          console.log('📐 NEW ANNOUNCEMENT TEMPLATE - RELATIVE POSITIONING:');
          console.log(`   Title Position: (0, 0) - BASE`);

          const descOffsetX = levelUpDescription.position.x - levelUpTitle.position.x;
          const descOffsetY = levelUpDescription.position.y - levelUpTitle.position.y;
          console.log(`   Description Offset from Title: (${descOffsetX}, ${descOffsetY})`);

          const macroOffsetX = levelUpMacro.position.x - levelUpTitle.position.x;
          const macroOffsetY = levelUpMacro.position.y - levelUpTitle.position.y;
          console.log(`   Macro Offset from Title: (${macroOffsetX}, ${macroOffsetY})`);

          const exampleOffsetX = levelUpExample.position.x - levelUpTitle.position.x;
          const exampleOffsetY = levelUpExample.position.y - levelUpTitle.position.y;
          console.log(`   Example Offset from Title: (${exampleOffsetX}, ${exampleOffsetY})`);

          console.log('\n   Vertical Gaps:');
          console.log(`   - Title to Description: ${descOffsetY - levelUpTitle.dimensions.height}px`);
          console.log(`   - Description to Macro: ${macroOffsetY - descOffsetY - levelUpDescription.dimensions.height}px`);
          console.log(`   - Macro to Example: ${exampleOffsetY - macroOffsetY - levelUpMacro.dimensions.height}px`);
        } else {
          console.log('\n⚠️ Not all elements found. Using fallback positioning...');
          console.log('📐 SUGGESTED FALLBACK POSITIONING:');
          console.log('   Title Position: (0, 0)');
          console.log('   Description Offset: (0, 80)');
          console.log('   Macro Offset: (0, 200)');
          console.log('   Example Offset: (0, 400)');
        }
      }
    } else {
      console.log('❌ Announcements workspace not found\n');
    }

    console.log('\n' + '=' .repeat(60));
    console.log('SUMMARY - TEMPLATE ELEMENT DIMENSIONS');
    console.log('=' .repeat(60));

    // Get typical dimensions for each element type
    const titleDims = await CanvasElement.findOne({ type: 'title' }).select('dimensions style');
    const descDims = await CanvasElement.findOne({ type: 'description' }).select('dimensions style');
    const macroDims = await CanvasElement.findOne({ type: 'macro' }).select('dimensions style');
    const exampleDims = await CanvasElement.findOne({ type: 'example' }).select('dimensions style');

    console.log('\nTypical element dimensions:');
    if (titleDims) console.log(`   Title: ${titleDims.dimensions.width}x${titleDims.dimensions.height}, fontSize: ${titleDims.style?.fontSize}`);
    if (descDims) console.log(`   Description: ${descDims.dimensions.width}x${descDims.dimensions.height}, fontSize: ${descDims.style?.fontSize}`);
    if (macroDims) console.log(`   Macro: ${macroDims.dimensions.width}x${macroDims.dimensions.height}`);
    if (exampleDims) console.log(`   Example: ${exampleDims.dimensions.width}x${exampleDims.dimensions.height}`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
};

getTemplatePositions();
