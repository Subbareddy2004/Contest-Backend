const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const User = require('../models/User');
const Submission = require('../models/Submission');
const Problem = require('../models/Problem');
const Assignment = require('../models/Assignment');
const Contest = require('../models/Contest');

// Get all students (for faculty)
router.get('/', auth, async (req, res) => {
  try {
    const students = await User.find({ role: 'student' })
      .select('-password')
      .lean();
    res.json(students);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching students' });
  }
});

// Get student profile
router.get('/profile', auth, async (req, res) => {
  try {
    const student = await User.findById(req.user.id)
      .select('-password');
    res.json(student);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching profile' });
  }
});

// Get student submissions
router.get('/submissions', auth, async (req, res) => {
  try {
    const submissions = await Submission.find({ student: req.user.id })
      .populate('problem', 'title')
      .sort('-submittedAt');
    res.json(submissions);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching submissions' });
  }
});

// Get student stats
router.get('/stats', auth, async (req, res) => {
  try {
    // Fix the distinct count query
    const problemsSolved = await Submission.distinct('problem', {
      student: req.user.id,
      status: 'Accepted'
    }).length;

    // Get completed assignments count
    const completedAssignments = await Assignment.countDocuments({
      'submissions.student': req.user.id,
      'submissions.status': 'Completed'
    });

    // Get student ranking (implement your ranking logic here)
    const ranking = 0;

    res.json({
      problemsSolved,
      completedAssignments,
      ranking
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ message: 'Error fetching student stats' });
  }
});

// Get recent problems
router.get('/problems/recent', auth, async (req, res) => {
  try {
    const problems = await Problem.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .select('title difficulty _id');
    res.json(problems);
  } catch (error) {
    console.error('Recent problems error:', error);
    res.status(500).json({ message: 'Error fetching recent problems' });
  }
});

// Get upcoming assignments
router.get('/assignments/upcoming', auth, async (req, res) => {
  try {
    const assignments = await Assignment.find({
      dueDate: { $gt: new Date() }
    })
    .sort({ dueDate: 1 })
    .limit(5)
    .select('title dueDate _id');
    res.json(assignments);
  } catch (error) {
    console.error('Upcoming assignments error:', error);
    res.status(500).json({ message: 'Error fetching upcoming assignments' });
  }
});

// Get upcoming contests
router.get('/contests/upcoming', auth, async (req, res) => {
  try {
    const contests = await Contest.find({
      startTime: { $gt: new Date() }
    })
    .sort({ startTime: 1 })
    .limit(5)
    .select('name startTime _id');
    res.json(contests);
  } catch (error) {
    console.error('Upcoming contests error:', error);
    res.status(500).json({ message: 'Error fetching upcoming contests' });
  }
});

module.exports = router;