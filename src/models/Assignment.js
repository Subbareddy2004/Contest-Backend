const mongoose = require('mongoose');

const assignmentSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true
  },
  dueDate: {
    type: Date,
    required: true
  },
  problems: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Problem'
  }],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  submissions: [{
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    submittedAt: {
      type: Date,
      default: Date.now
    },
    code: {
      type: String,
      required: true
    },
    language: {
      type: String,
      required: true
    },
    status: {
      type: String,
      enum: ['Pending', 'Graded'],
      default: 'Pending'
    },
    grade: {
      type: Number,
      min: 0,
      max: 100
    },
    feedback: String
  }]
}, {
  timestamps: true
});

// Add index for better query performance
assignmentSchema.index({ createdBy: 1 });

module.exports = mongoose.model('Assignment', assignmentSchema);