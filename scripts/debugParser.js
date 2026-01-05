require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const ScrapedConversation = require('../models/ScrapedConversation');

async function test() {
  await connectDB();

  const conv = await ScrapedConversation.findOne({ conversationId: '215472510381923' }).lean();

  console.log('=== Full exportedText ===');
  console.log(conv.exportedText);
  console.log('\n=== Line by line analysis ===');

  const headerRegex = /^(\d{1,2}:\d{2}\s*(?:AM|PM)?)\s*\|\s*([^:]+):\s*(.*)$/i;
  const lines = conv.exportedText.split('\n');

  lines.forEach((line, i) => {
    const match = line.match(headerRegex);
    const skip = line.includes('Conversation with') ||
                 line.includes('Started on') ||
                 line.trim() === '---' ||
                 line.match(/^---\s*\w+\s+\d+,\s*\d+\s*---$/);

    if (skip) {
      console.log(`Line ${i}: [SKIP] "${line.substring(0, 50)}"`);
    } else if (match) {
      console.log(`Line ${i}: [MATCH] time="${match[1]}" sender="${match[2]}" content="${match[3].substring(0, 30)}..."`);
    } else {
      console.log(`Line ${i}: [NO MATCH] "${line.substring(0, 50)}"`);
    }
  });

  process.exit(0);
}
test();
