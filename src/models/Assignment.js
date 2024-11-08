const mongoose = require('mongoose');

const problemSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Problem title is required'],
    trim: true
  },
  description: {
    type: String,
    required: [true, 'Problem description is required'],
    trim: true
  },
  points: {
    type: Number,
    default: 10,
    min: [0, 'Points cannot be negative']
  },
  language: {
    type: String,
    enum: ['python', 'javascript', 'java', 'cpp'],
    default: 'python'
  },
  testCases: {
    type: [{
      input: {
        type: String,
        required: [true, 'Test case input is required'],
        trim: true
      },
      output: {
        type: String,
        required: [true, 'Test case output is required'],
        trim: true
      },
      isHidden: {
        type: Boolean,
        default: false
      }
    }],
    validate: {
      validator: function(testCases) {
        return testCases && testCases.length > 0;
      },
      message: 'At least one test case is required'
    }
  }
});

const assignmentSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true,
    trim: true
  },
  dueDate: {
    type: Date,
    required: true
  },
  problems: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Problem',
    required: true
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
    problemId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true
    },
    code: String,
    language: String,
    status: {
      type: String,
      enum: ['PASSED', 'FAILED'],
      required: true
    },
    submittedAt: {
      type: Date,
      default: Date.now
    }
  }]
}, {
  timestamps: true
});

// Add virtual for calculating student progress
assignmentSchema.virtual('studentProgress').get(function() {
  const progressMap = new Map();
  
  this.submissions.forEach(submission => {
    const studentId = submission.student.toString();
    if (!progressMap.has(studentId)) {
      progressMap.set(studentId, {
        problemsSolved: new Set(),
        lastSubmission: submission.submittedAt
      });
    }
    
    const progress = progressMap.get(studentId);
    if (submission.status === 'PASSED') {
      progress.problemsSolved.add(submission.problemId.toString());
    }
    if (submission.submittedAt > progress.lastSubmission) {
      progress.lastSubmission = submission.submittedAt;
    }
  });
  
  return Array.from(progressMap.entries()).map(([studentId, progress]) => ({
    studentId,
    problemsSolved: progress.problemsSolved.size,
    lastSubmission: progress.lastSubmission,
    percentage: (progress.problemsSolved.size / (this.problems?.length || 1)) * 100
  }));
});

module.exports = mongoose.model('Assignment', assignmentSchema);