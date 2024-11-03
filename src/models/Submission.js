const mongoose = require('mongoose');

const submissionSchema = new mongoose.Schema({
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  assignment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Assignment',
    required: true
  },
  problemId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  code: String,
  language: String,
  status: {
    type: String,
    enum: ['PASSED', 'FAILED', 'IN_PROGRESS'],
    required: true
  },
  submittedAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Submission', submissionSchema);