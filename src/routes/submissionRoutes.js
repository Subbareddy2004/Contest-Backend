const express = require('express');
const router = express.Router();
const Submission = require('../models/Submission');
const { auth } = require('../middleware/auth');
const { isFaculty } = require('../middleware/faculty');

// Get submission statistics
router.get('/stats', auth, isFaculty, async (req, res) => {
  try {
    const stats = await Submission.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    res.json(stats.map(stat => ({
      status: stat._id,
      count: stat.count
    })));
  } catch (error) {
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