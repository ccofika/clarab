require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const ScrapedConversation = require('../models/ScrapedConversation');

// Copy of the parser function
function parseExportedTextToMessages(exportedText) {
  if (!exportedText) return [];

  const messages = [];
  const lines = exportedText.split('\n');
  let currentMessage = null;

  const headerRegex = /^(\d{1,2}:\d{2}\s*(?:AM|PM)?)\s*\|\s*([^:]+):\s*(.*)$/i;

  for (const line of lines) {
    if (line.includes('Conversation with') ||
        line.includes('Started on') ||
        line.trim() === '---' ||
        line.match(/^---\s*\w+\s+\d+,\s*\d+\s*---$/)) {
      continue;
    }

    const match = line.match(headerRegex);

    if (match) {
      if (currentMessage && currentMessage.content.trim()) {
        messages.push(currentMessage);
      }

      const sender = match[2].trim();
      const firstLine = match[3] || '';

      const senderLower = sender.toLowerCase();
      const isAgent = senderLower.includes('stake') ||
                      senderLower.includes('support') ||
                      senderLower.includes('from stake.com');

      currentMessage = {
        role: isAgent ? 'agent' : 'customer',
        sender: sender,
        content: firstLine,
        hasImage: false
      };
    } else if (currentMessage && line.trim()) {
      currentMessage.content += '\n' + line;
      if (line.includes('[Image')) {
        currentMessage.hasImage = true;
      }
    }
  }

  if (currentMessage && currentMessage.content.trim()) {
    messages.push(currentMessage);
  }

  return messages;
}

async function test() {
  await connectDB();

  const convs = await ScrapedConversation.find().limit(3).lean();

  for (const conv of convs) {
    console.log('\n=== Conversation:', conv.conversationId, '===');
    console.log('exportedText length:', conv.exportedText?.length);

    const messages = parseExportedTextToMessages(conv.exportedText);
    console.log('Parsed messages:', messages.length);

    messages.forEach((m, i) => {
      console.log(`  ${i+1}. [${m.role}] ${m.sender}:`);
      console.log(`     "${m.content.substring(0, 100)}${m.content.length > 100 ? '...' : ''}"`);
    });
  }

  process.exit(0);
}
test();
