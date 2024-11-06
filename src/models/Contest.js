const mongoose = require('mongoose');

const activeParticipantSchema = new mongoose.Schema({
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  startTime: {
    type: Date,
    required: true
  },
  submissions: [{
    problemId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Problem',
      required: true
    },
    code: {
      type: String,
      required: true
    },
    language: {
      type: String,
      required: true,
      enum: ['cpp', 'python', 'java', 'javascript']
    },
    status: {
      type: String,
      required: true,
      enum: ['IN_PROGRESS', 'PASSED', 'FAILED']
    },
    submittedAt: {
      type: Date,
      required: true
    }
  }]
}, { _id: false });

const contestSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true
  },
  description: String,
  startTime: {
    type: Date,
    required: true
  },
  duration: {
    type: Number,
    required: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  isPublished: {
    type: Boolean,
    default: false
  },
  problems: [{
    problem: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Problem'
    },
    points: Number
  }],
  registeredStudents: [{
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    startedAt: Date,
    submissions: [{
      problemId: mongoose.Schema.Types.ObjectId,
      code: String,
      language: String,
      status: String,
      submittedAt: Date
    }]
  }],
  activeParticipants: [{
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    startTime: Date,
    submissions: [{
      problemId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Problem'
      },
      code: String,
      language: String,
      status: String,
      submittedAt: Date
    }]
  }]
}, {
  timestamps: true
});

// Add initialization middleware
contestSchema.pre('save', function(next) {
  if (!this.registeredStudents) {
    this.registeredStudents = [];
  }
  if (!this.activeParticipants) {
    this.activeParticipants = [];
  }
  
  this.registeredStudents.forEach(participant => {
    if (!participant.submissions) {
      participant.submissions = [];
    }
  });
  
  this.activeParticipants.forEach(participant => {
    if (!participant.submissions) {
      participant.submissions = [];
    }
  });
  
  next();
});

// Update the virtual to handle null cases
contestSchema.virtual('studentProgress').get(function() {
  const progressMap = new Map();
  
  if (!this.registeredStudents || !Array.isArray(this.registeredStudents)) {
    return [];
  }
  
  this.registeredStudents.forEach(participant => {
    if (!participant || !participant.student || !participant.submissions) return;
    
    const studentId = participant.student.toString();
    if (!progressMap.has(studentId)) {
      progressMap.set(studentId, {
        problemsSolved: new Set(),
        lastSubmission: null
      });
    }
    
    const progress = progressMap.get(studentId);
    participant.submissions.forEach(submission => {
      if (!submission || !submission.problemId) return;
      
      if (submission.status === 'PASSED') {
        progress.problemsSolved.add(submission.problemId.toString());
      }
      if (!progress.lastSubmission || submission.submittedAt > progress.lastSubmission) {
        progress.lastSubmission = submission.submittedAt;
      }
    });
  });
  
  return Array.from(progressMap.entries()).map(([studentId, progress]) => ({
    studentId,
    problemsSolved: progress.problemsSolved.size,
    lastSubmission: progress.lastSubmission,
    percentage: this.problems?.length ? (progress.problemsSolved.size / this.problems.length) * 100 : 0
  }));
});

module.exports = mongoose.model('Contest', contestSchema);