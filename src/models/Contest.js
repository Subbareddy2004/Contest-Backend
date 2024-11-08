const mongoose = require('mongoose');

const contestSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true
  },
  startTime: {
    type: Date,
    required: true
  },
  duration: {
    type: Number,
    required: true,
    min: 1
  },
  problems: [{
    problem: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Problem',
      required: true
    },
    points: {
      type: Number,
      required: true,
      min: 0,
      default: 100
    }
  }],
  isPublished: {
    type: Boolean,
    default: false
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  participants: [{
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    startTime: Date,
    completedProblems: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Problem'
    }],
    totalPoints: {
      type: Number,
      default: 0
    },
    submissions: [{
      problem: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Problem'
      },
      code: String,
      status: {
        type: String,
        enum: ['PENDING', 'PASSED', 'FAILED'],
        default: 'PENDING'
      },
      submittedAt: {
        type: Date,
        default: Date.now
      }
    }]
  }]
}, {
  timestamps: true
});

// Add indexes for better performance
contestSchema.index({ 'participants.student': 1 });
contestSchema.index({ 'problems.problem': 1 });

module.exports = mongoose.model('Contest', contestSchema); 