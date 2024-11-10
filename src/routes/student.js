const express = require('express');
const router = express.Router();
const Assignment = require('../models/Assignment');
const Contest = require('../models/Contest');
const auth = require('../middleware/auth');

router.get('/dashboard', auth, async (req, res) => {
  try {
    const studentId = req.user.id;
    console.log('Fetching dashboard for student:', studentId); // Debug log

    // Get active contests
    const activeContests = await Contest.countDocuments({
      startTime: { $lte: new Date() },
      endTime: { $gte: new Date() }
    });
    console.log('Active contests:', activeContests); // Debug log

    // Get participated contests
    const participatedContests = await Contest.countDocuments({
      'participants.studentId': studentId
    });
    console.log('Participated contests:', participatedContests); // Debug log

    // Get assignment statistics
    const assignments = await Assignment.find({});
    console.log('Total assignments:', assignments.length); // Debug log

    // Count completed assignments
    const completedAssignments = await Assignment.countDocuments({
      'submissions': {
        $elemMatch: {
          studentId: studentId,
          status: 'completed'
        }
      }
    });
    console.log('Completed assignments:', completedAssignments); // Debug log

    // Prepare performance data
    const performanceData = [{
      category: 'Assignments',
      total: assignments.length,
      completed: completedAssignments
    }];

    const response = {
      stats: {
        activeContests,
        participatedContests,
        completedAssignments
      },
      performanceStats: performanceData
    };

    console.log('Sending response:', JSON.stringify(response, null, 2)); // Debug log
    res.json(response);

  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({ message: 'Error fetching dashboard statistics' });
  }
});

module.exports = router; 