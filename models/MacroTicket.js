const mongoose = require('mongoose');

const macroTicketSchema = new mongoose.Schema({
  agent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Agent',
    required: [true, 'Agent is required']
  },
  ticketId: {
    type: String,
    required: [true, 'Ticket ID is required'],
    trim: true,
    maxlength: [100, 'Ticket ID cannot exceed 100 characters']
  },
  notes: {
    type: String,
    trim: true
  },
  dateEntered: {
    type: Date,
    default: Date.now
  },
  sentBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Sender is required']
  },
  sentTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Recipient is required']
  },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'declined'],
    default: 'pending'
  }
}, {
  timestamps: true
});

// Indexes for performance
macroTicketSchema.index({ sentTo: 1, status: 1 });
macroTicketSchema.index({ sentBy: 1 });
macroTicketSchema.index({ agent: 1 });
macroTicketSchema.index({ createdAt: -1 });

module.exports = mongoose.model('MacroTicket', macroTicketSchema);
