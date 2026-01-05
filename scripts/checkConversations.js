require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const ScrapedConversation = require('../models/ScrapedConversation');

async function check() {
  await connectDB();

  // Get sample conversations
  const convs = await ScrapedConversation.find().limit(10).lean();

  console.log('Found', convs.length, 'conversations\n');

  convs.forEach((conv, i) => {
    const messageCount = conv.messages?.length || 0;
    const hasText = conv.messages?.some(m => m.text && m.text.length > 0);
    const hasSpeaker = conv.messages?.some(m => m.speaker);

    // Check if rawHtml exists
    const hasRawHtml = conv.rawHtml && conv.rawHtml.length > 0;

    console.log(`${i+1}. ID: ${conv.conversationId}`);
    console.log(`   Messages: ${messageCount}, hasText: ${hasText}, hasSpeaker: ${hasSpeaker}, hasRawHtml: ${hasRawHtml}`);

    if (conv.messages && conv.messages[0]) {
      console.log(`   First msg speaker: ${conv.messages[0].speaker}, text: "${(conv.messages[0].text || '').substring(0, 50)}"`);
    }
  });

  process.exit(0);
}
check();
