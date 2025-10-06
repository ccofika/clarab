const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    validate: {
      validator: function(email) {
        return email.endsWith('@mebit.io');
      },
      message: 'Only @mebit.io email addresses are allowed'
    }
  },
  password: {
    type: String,
    required: function() {
      return !this.googleId; // Password not required if user signed up with Google
    },
    minlength: 6
  },
  googleId: {
    type: String,
    sparse: true,
    unique: true
  },
  isFirstLogin: {
    type: Boolean,
    default: true
  },
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user'
  },
  workspacePreferences: {
    type: Map,
    of: {
      viewMode: {
        type: String,
        enum: ['edit', 'view'],
        default: 'edit'
      }
    },
    default: new Map()
  }
}, {
  timestamps: true
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password') || !this.password) return next();

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
