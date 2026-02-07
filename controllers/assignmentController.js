const QAAssignment = require('../models/QAAssignment');
const Agent = require('../models/Agent');
const Ticket = require('../models/Ticket');

// Get all assignments for an agent
exports.getAgentAssignments = async (req, res) => {
  try {
    const { agentId } = req.params;

    const assignments = await QAAssignment.find({ agentId })
      .sort({ createdAt: -1 })
      .lean();

    res.json({ assignments });
  } catch (error) {
    console.error('Error fetching assignments:', error);
    res.status(500).json({ message: 'Failed to fetch assignments' });
  }
};

// Get active assignment for an agent (current week or most recent)
// Returns the current week's assignment if it exists, otherwise the most recent one
// This ensures the modal always shows when ANY assignment exists for this agent
exports.getActiveAssignment = async (req, res) => {
  try {
    const { agentId } = req.params;
    const weekId = QAAssignment.getCurrentWeekId();

    // First try current week
    let assignment = await QAAssignment.findOne({
      agentId,
      weekId
    }).lean();

    // If no current week assignment, find the most recent one (any week)
    if (!assignment) {
      assignment = await QAAssignment.findOne({
        agentId
      }).sort({ createdAt: -1 }).lean();
    }

    res.json({ assignment });
  } catch (error) {
    console.error('Error fetching active assignment:', error);
    res.status(500).json({ message: 'Failed to fetch active assignment' });
  }
};

// Create new assignment
exports.createAssignment = async (req, res) => {
  try {
    const {
      agentId,
      assignmentName,
      ticketIds,
      ticketObjectIds,
      rubricName,
      qaEmail
    } = req.body;

    // Validate agent exists
    const agent = await Agent.findById(agentId);
    if (!agent) {
      return res.status(404).json({ message: 'Agent not found' });
    }

    const weekId = QAAssignment.getCurrentWeekId();

    // Check if assignment already exists for this agent and week
    let assignment = await QAAssignment.findOne({ agentId, weekId });

    if (assignment) {
      // Add new tickets to existing assignment
      const newTicketIds = ticketIds.filter(id => !assignment.ticketIds.includes(id));
      if (newTicketIds.length > 0) {
        assignment.ticketIds.push(...newTicketIds);
        if (ticketObjectIds) {
          assignment.ticketObjectIds.push(...ticketObjectIds.filter(id =>
            !assignment.ticketObjectIds.includes(id)
          ));
        }
        // Reset status to in_progress since we have new tickets to grade
        assignment.status = 'in_progress';
        assignment.completedAt = null;
        assignment.updatedAt = new Date();
        await assignment.save();
      }
    } else {
      // Create new assignment
      assignment = new QAAssignment({
        agentId,
        assignmentName: assignmentName || QAAssignment.generateAssignmentName(agent.name),
        weekId,
        ticketIds: ticketIds || [],
        ticketObjectIds: ticketObjectIds || [],
        gradedTicketIds: [],
        status: 'created',
        maestroData: {
          rubricName,
          qaEmail
        }
      });
      await assignment.save();
    }

    res.status(201).json({ assignment });
  } catch (error) {
    console.error('Error creating assignment:', error);
    res.status(500).json({ message: 'Failed to create assignment' });
  }
};

// Update assignment
exports.updateAssignment = async (req, res) => {
  try {
    const { assignmentId } = req.params;
    const updates = req.body;

    const assignment = await QAAssignment.findByIdAndUpdate(
      assignmentId,
      { ...updates, updatedAt: new Date() },
      { new: true }
    );

    if (!assignment) {
      return res.status(404).json({ message: 'Assignment not found' });
    }

    res.json({ assignment });
  } catch (error) {
    console.error('Error updating assignment:', error);
    res.status(500).json({ message: 'Failed to update assignment' });
  }
};

// Add tickets to existing assignment
exports.addTicketsToAssignment = async (req, res) => {
  try {
    const { assignmentId } = req.params;
    const { ticketIds, ticketObjectIds } = req.body;

    const assignment = await QAAssignment.findById(assignmentId);
    if (!assignment) {
      return res.status(404).json({ message: 'Assignment not found' });
    }

    // Add new tickets (avoid duplicates)
    const newTicketIds = ticketIds.filter(id => !assignment.ticketIds.includes(id));
    assignment.ticketIds.push(...newTicketIds);

    if (ticketObjectIds) {
      const newObjectIds = ticketObjectIds.filter(id =>
        !assignment.ticketObjectIds.map(o => o.toString()).includes(id.toString())
      );
      assignment.ticketObjectIds.push(...newObjectIds);
    }

    assignment.status = 'in_progress';
    assignment.updatedAt = new Date();
    await assignment.save();

    res.json({ assignment });
  } catch (error) {
    console.error('Error adding tickets to assignment:', error);
    res.status(500).json({ message: 'Failed to add tickets' });
  }
};

// Mark ticket as graded in assignment
exports.markTicketGraded = async (req, res) => {
  try {
    const { assignmentId, ticketId } = req.params;

    const assignment = await QAAssignment.findById(assignmentId);
    if (!assignment) {
      return res.status(404).json({ message: 'Assignment not found' });
    }

    // Add to graded list if not already there
    if (!assignment.gradedTicketIds.includes(ticketId)) {
      assignment.gradedTicketIds.push(ticketId);
    }

    // Check if all tickets are graded
    if (assignment.gradedTicketIds.length >= assignment.ticketIds.length) {
      assignment.status = 'completed';
      assignment.completedAt = new Date();
    } else {
      assignment.status = 'in_progress';
    }

    assignment.updatedAt = new Date();
    await assignment.save();

    res.json({ assignment });
  } catch (error) {
    console.error('Error marking ticket graded:', error);
    res.status(500).json({ message: 'Failed to mark ticket graded' });
  }
};

// Delete assignment (reset)
exports.deleteAssignment = async (req, res) => {
  try {
    const { assignmentId } = req.params;

    const assignment = await QAAssignment.findByIdAndDelete(assignmentId);
    if (!assignment) {
      return res.status(404).json({ message: 'Assignment not found' });
    }

    res.json({ message: 'Assignment deleted successfully', assignmentId });
  } catch (error) {
    console.error('Error deleting assignment:', error);
    res.status(500).json({ message: 'Failed to delete assignment' });
  }
};
