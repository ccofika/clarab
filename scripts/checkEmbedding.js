require('dotenv').config();
const mongoose = require('mongoose');
const Ticket = require('../models/Ticket');

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const ticket = await Ticket.findOne({
    status: 'Graded',
    feedback: { $exists: true, $ne: '' },
    embedding: { $exists: true }
  }).lean();

  console.log('Ticket ID:', ticket.ticketId);
  console.log('Notes:', ticket.notes?.substring(0, 100));
  console.log('Embedding type:', typeof ticket.embedding);
  console.log('Is array:', Array.isArray(ticket.embedding));
  console.log('Embedding length:', ticket.embedding?.length || 0);
  console.log('First 5 values:', ticket.embedding?.slice(0, 5));
  process.exit(0);
});
