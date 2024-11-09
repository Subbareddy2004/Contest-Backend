const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const { isStudent } = require('../middleware/roleCheck');
const Submission = require('../models/Submission');
const Assignment = require('../models/Assignment');
const Contest = require('../models/Contest');
const Problem = require('../models/Problem');

router.get('/stats', auth, isStudent, async (req, res) => {
  try {
    const userId = req.user.id;

    // Get problems solved count
    const problemsSolved = await Submission.distinct('problemId', {
      student: userId,
      status: 'PASSED'
    }).count();

    // Get leaderboard ranking
    const leaderboardRanking = await Submission.aggregate([
      {
        $match: { status: 'PASSED' }
      },
      {
        $group: {
          _id: '$student',
          solvedCount: { $addToSet: '$problemId' }
        }
      },
      {
        $project: {
          solvedCount: { $size: '$solvedCount' }
        }
      },
      {
        $sort: { solvedCount: -1 }
      }
    ]);

    const userRank = leaderboardRanking.findIndex(user => 
      user._id.toString() === userId.toString()
    ) + 1;

    // Get completed assignments
    const completedAssignments = await Assignment.countDocuments({
      'submissions': {
        $elemMatch: {
          student: userId,
          status: 'PASSED'
        }
      }
    });

    // Get recent problems
    const recentProblems = await Problem.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .select('title difficulty');

    // Get upcoming assignments
    const upcomingAssignments = await Assignment.find({
      dueDate: { $gt: new Date() }
    })
    .sort({ dueDate: 1 })
    .limit(3)
    .select('title dueDate');

    // Get upcoming contests
    const upcomingContests = await Contest.find({
      startTime: { $gt: new Date() },
      isPublished: true
    })
    .sort({ startTime: 1 })
    .limit(3)
    .select('title startTime');

    res.json({
      stats: {
        problemsSolved: problemsSolved || 0,
        leaderboardRanking: userRank || 0,
        completedAssignments: completedAssignments || 0
      },
      recentProblems,
      upcomingAssignments,
      upcomingContests
    });

  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({ 
      message: 'Error fetching dashboard stats',
      error: error.message 
    });
  }
});

module.exports = router;