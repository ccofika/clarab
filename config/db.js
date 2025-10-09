const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    // Check if MONGODB_URI is defined
    if (!process.env.MONGODB_URI) {
      throw new Error(
        'MONGODB_URI is not defined! Please add it to your environment variables.\n' +
        'For Render: Go to Dashboard > Your Service > Environment > Add MONGODB_URI'
      );
    }

    await mongoose.connect(process.env.MONGODB_URI);
    console.log('MongoDB Connected Successfully');
  } catch (error) {
    console.error('MongoDB Connection Error:', error.message);
    process.exit(1);
  }
};

module.exports = connectDB;
