const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const User = require('../models/User');
const Submission = require('../models/Submission');

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

module.exports = router;