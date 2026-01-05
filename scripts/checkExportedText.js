require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const ScrapedConversation = require('../models/ScrapedConversation');

async function check() {
  await connectDB();

  // Get sample conversations
  const convs = await ScrapedConversation.find().limit(5).lean();

  console.log('Checking', convs.length, 'conversations:\n');

  convs.forEach((conv, i) => {
    console.log(`${i+1}. ID: ${conv.conversationId}`);
    console.log(`   exportedText length: ${conv.exportedText?.length || 0}`);
    console.log(`   combinedText length: ${conv.combinedText?.length || 0}`);
    console.log(`   messages count: ${conv.messages?.length || 0}`);
    console.log(`   messageCount field: ${conv.messageCount}`);

    if (conv.exportedText && conv.exportedText.length > 0) {
      console.log(`   exportedText preview: "${conv.exportedText.substring(0, 200)}..."`);
    }
    console.log('');
  });

  process.exit(0);
}
check();
