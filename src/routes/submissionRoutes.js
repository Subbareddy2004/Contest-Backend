const express = require('express');
const router = express.Router();
const Submission = require('../models/Submission');
const { auth } = require('../middleware/auth');
const { isFaculty } = require('../middleware/faculty');
const User = require('../models/User');

// Get submission statistics
router.get('/stats', auth, isFaculty, async (req, res) => {
  try {
    // Get all students under this faculty
    const students = await User.find({
      addedBy: req.user.id,
      role: 'student'
    }).select('_id');

    const studentIds = students.map(s => s._id);

    const stats = await Submission.aggregate([
      {
        $match: {
          student: { $in: studentIds }
        }
      },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    const formattedStats = stats.map(stat => ({
      status: stat._id,
      count: stat.count
    }));

    res.json(formattedStats);
  } catch (error) {
    console.error('Error fetching submission statistics:', error);
    res.status(500).json({ message: 'Error fetching submission statistics' });
  }
});

// Get recent submissions
router.get('/recent', auth, isFaculty, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 5;
    const submissions = await Submission.find()
      .populate('student', 'name regNumber')
      .populate('problem', 'title')
      .sort('-submittedAt')
      .limit(limit);
    
    res.json(submissions);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching recent submissions' });
  }
});

module.exports = router;