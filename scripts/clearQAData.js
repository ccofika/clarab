const mongoose = require('mongoose');
require('dotenv').config();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('MongoDB connected'))
.catch(err => {
  console.error('MongoDB connection error:', err);
  process.exit(1);
});

// Import models
const Agent = require('../models/Agent');
const Ticket = require('../models/Ticket');

async function clearQAData() {
  try {
    console.log('Starting to clear QA data...');

    // Delete all tickets
    const ticketsDeleted = await Ticket.deleteMany({});
    console.log(`✅ Deleted ${ticketsDeleted.deletedCount} tickets`);

    // Delete all agents
    const agentsDeleted = await Agent.deleteMany({});
    console.log(`✅ Deleted ${agentsDeleted.deletedCount} agents`);

    console.log('\n🎉 All QA data has been cleared successfully!');
    console.log('Users can now create new agents and tickets from scratch.');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error clearing QA data:', error);
    process.exit(1);
  }
}

clearQAData();
