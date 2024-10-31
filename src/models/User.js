const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  password: {
    type: String,
    required: true
  },
  regNumber: {
    type: String,
    validate: {
      validator: function(v) {
        // For students, regNumber must be provided and non-empty
        // For faculty, regNumber should be undefined
        return this.role === 'faculty' || (this.role === 'student' && v && v.length > 0);
      },
      message: 'Registration number is required for students'
    },
    // Remove unique and sparse options from schema level
  },
  role: {
    type: String,
    enum: ['student', 'faculty'],
    required: true
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  score: {
    type: Number,
    default: 0
  },
  problemsSolved: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Pre-save middleware to handle regNumber
userSchema.pre('save', function(next) {
  if (this.role === 'faculty') {
    this.regNumber = undefined;
  }
  next();
});

// Create a unique index on regNumber that ignores null/undefined values
userSchema.index({ 
  regNumber: 1 
}, { 
  unique: true, 
  sparse: true,
  partialFilterExpression: { regNumber: { $type: "string" } }
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  try {
    // Only hash the password if it has been modified or is new
    if (!this.isModified('password')) {
      return next();
    }

    // Convert password to string if it's not already
    const plainTextPassword = this.password.toString();
    
    // Use bcryptjs instead of bcrypt
    const salt = await bcrypt.genSalt(8);
    this.password = await bcrypt.hash(plainTextPassword, salt);
    
    console.log('Password hashed:', {
      original: plainTextPassword,
      hashed: this.password
    });
    
    next();
  } catch (error) {
    console.error('Error hashing password:', error);
    next(error);
  }
});

// Method to check password
userSchema.methods.comparePassword = async function(candidatePassword) {
  try {
    // Ensure the candidate password is a string
    const candidate = candidatePassword.toString().trim();
    
    console.log('Password comparison:', {
      candidatePassword: candidate,
      hashedPassword: this.password,
      candidateLength: candidate.length,
    });
    
    // Use bcryptjs.compare
    const isMatch = await bcrypt.compare(candidate, this.password);
    console.log('Password match result:', isMatch);
    return isMatch;
  } catch (error) {
    console.error('Password comparison error:', error);
    throw error;
  }
};

const User = mongoose.model('User', userSchema);

module.exports = User;
