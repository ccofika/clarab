require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const ScrapedConversation = require('../models/ScrapedConversation');

async function check() {
  await connectDB();

  // Get a sample conversation
  const conv = await ScrapedConversation.findOne().lean();

  if (!conv) {
    console.log('No conversations found');
    process.exit(1);
  }

  console.log('Conversation ID:', conv.conversationId);
  console.log('Message count:', conv.messages?.length);

  // Show first 3 messages
  console.log('\nFirst 3 messages:');
  (conv.messages || []).slice(0, 3).forEach((m, i) => {
    console.log('---');
    console.log('Speaker:', m.speaker);
    console.log('Text length:', (m.text || '').length);
    console.log('Text preview:', (m.text || '').substring(0, 300));
  });

  process.exit(0);
}
check();
