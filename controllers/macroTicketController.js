const MacroTicket = require('../models/MacroTicket');
const Ticket = require('../models/Ticket');
const Agent = require('../models/Agent');

// @desc    Send a ticket to the user who manages the agent
// @route   POST /api/qa/macro-tickets
// @access  Private
const sendMacroTicket = async (req, res) => {
  try {
    const { agent, ticketId, notes, dateEntered } = req.body;

    // Validate required fields
    if (!agent || !ticketId) {
      return res.status(400).json({ message: 'Agent and Ticket ID are required' });
    }

    // Find the agent and get the user who has this agent in their activeForUsers
    const agentDoc = await Agent.findById(agent);
    if (!agentDoc) {
      return res.status(404).json({ message: 'Agent not found' });
    }

    // Get the first user who has this agent (the assigned grader)
    if (!agentDoc.activeForUsers || agentDoc.activeForUsers.length === 0) {
      return res.status(400).json({
        message: 'This agent is not assigned to any grader. Cannot send ticket.'
      });
    }

    // Get the first active user for this agent (primary grader)
    const recipientUserId = agentDoc.activeForUsers[0];

    // Allow sending to yourself for testing purposes
    // if (recipientUserId.toString() === req.user.id) {
    //   return res.status(400).json({
    //     message: 'Cannot send macro ticket to yourself. This agent is assigned to you.'
    //   });
    // }

    // Create the macro ticket
    const macroTicket = await MacroTicket.create({
      agent,
      ticketId,
      notes: notes || '',
      dateEntered: dateEntered || new Date(),
      sentBy: req.user.id,
      sentTo: recipientUserId,
      status: 'pending'
    });

    // Populate agent and user info for response
    await macroTicket.populate([
      { path: 'agent', select: 'name' },
      { path: 'sentTo', select: 'name email' }
    ]);

    res.status(201).json({
      message: `Ticket sent to ${macroTicket.sentTo.name || macroTicket.sentTo.email}`,
      macroTicket
    });
  } catch (error) {
    console.error('Error sending macro ticket:', error);
    res.status(500).json({ message: 'Failed to send ticket', error: error.message });
  }
};

// @desc    Get pending macro tickets for current user
// @route   GET /api/qa/macro-tickets/pending
// @access  Private
const getPendingMacroTickets = async (req, res) => {
  try {
    const macroTickets = await MacroTicket.find({
      sentTo: req.user.id,
      status: 'pending'
    })
    .populate('agent', 'name')
    .populate('sentBy', 'name email')
    .sort({ createdAt: -1 });

    res.json(macroTickets);
  } catch (error) {
    console.error('Error fetching pending tickets:', error);
    res.status(500).json({ message: 'Failed to fetch pending tickets', error: error.message });
  }
};

// @desc    Accept a macro ticket (creates a real ticket)
// @route   POST /api/qa/macro-tickets/:id/accept
// @access  Private
const acceptMacroTicket = async (req, res) => {
  try {
    const macroTicket = await MacroTicket.findById(req.params.id)
      .populate('agent', 'name');

    if (!macroTicket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    // Verify the current user is the recipient
    if (macroTicket.sentTo.toString() !== req.user.id) {
      return res.status(403).json({ message: 'You are not authorized to accept this ticket' });
    }

    // Check if already processed
    if (macroTicket.status !== 'pending') {
      return res.status(400).json({ message: `This ticket has already been ${macroTicket.status}` });
    }

    // Create a real ticket from the sent ticket
    const ticket = await Ticket.create({
      agent: macroTicket.agent._id,
      ticketId: macroTicket.ticketId,
      notes: macroTicket.notes,
      dateEntered: macroTicket.dateEntered,
      status: 'Selected',
      createdBy: req.user.id
    });

    // Update sent ticket status
    macroTicket.status = 'accepted';
    await macroTicket.save();

    // Populate ticket for response
    await ticket.populate('agent', 'name');

    res.json({
      message: 'Ticket accepted and added to your list',
      ticket
    });
  } catch (error) {
    console.error('Error accepting ticket:', error);

    // Handle duplicate ticket error
    if (error.code === 11000) {
      return res.status(400).json({
        message: 'A ticket with this ID already exists for this agent'
      });
    }

    res.status(500).json({ message: 'Failed to accept ticket', error: error.message });
  }
};

// @desc    Decline a macro ticket
// @route   POST /api/qa/macro-tickets/:id/decline
// @access  Private
const declineMacroTicket = async (req, res) => {
  try {
    const macroTicket = await MacroTicket.findById(req.params.id);

    if (!macroTicket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    // Verify the current user is the recipient
    if (macroTicket.sentTo.toString() !== req.user.id) {
      return res.status(403).json({ message: 'You are not authorized to decline this ticket' });
    }

    // Check if already processed
    if (macroTicket.status !== 'pending') {
      return res.status(400).json({ message: `This ticket has already been ${macroTicket.status}` });
    }

    // Update status to declined
    macroTicket.status = 'declined';
    await macroTicket.save();

    res.json({ message: 'Ticket declined' });
  } catch (error) {
    console.error('Error declining ticket:', error);
    res.status(500).json({ message: 'Failed to decline ticket', error: error.message });
  }
};

// @desc    Get macro ticket details
// @route   GET /api/qa/macro-tickets/:id
// @access  Private
const getMacroTicket = async (req, res) => {
  try {
    const macroTicket = await MacroTicket.findById(req.params.id)
      .populate('agent', 'name')
      .populate('sentBy', 'name email')
      .populate('sentTo', 'name email');

    if (!macroTicket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    // Only allow sender or recipient to view
    if (macroTicket.sentTo._id.toString() !== req.user.id &&
        macroTicket.sentBy._id.toString() !== req.user.id) {
      return res.status(403).json({ message: 'You are not authorized to view this ticket' });
    }

    res.json(macroTicket);
  } catch (error) {
    console.error('Error fetching ticket:', error);
    res.status(500).json({ message: 'Failed to fetch ticket', error: error.message });
  }
};

module.exports = {
  sendMacroTicket,
  getPendingMacroTickets,
  acceptMacroTicket,
  declineMacroTicket,
  getMacroTicket
};
