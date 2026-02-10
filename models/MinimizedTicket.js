const mongoose = require('mongoose');

const minimizedTicketSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  ticketObjectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Ticket',
    default: null
  },
  mode: {
    type: String,
    enum: ['create', 'edit'],
    required: true
  },
  source: {
    type: String,
    enum: ['tickets', 'archive'],
    default: 'tickets'
  },
  agentName: {
    type: String,
    default: ''
  },
  formData: {
    type: Object,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 86400 // TTL: auto-delete after 24 hours
  }
});

module.exports = mongoose.model('MinimizedTicket', minimizedTicketSchema);
