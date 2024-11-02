const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const User = require('../models/User');
const Submission = require('../models/Submission');
const Problem = require('../models/Problem');
const Assignment = require('../models/Assignment');
const Contest = require('../models/Contest');

// Add this function at the top of the file
const calculateLeaderboardRank = async (studentId) => {
  try {
    const student = await User.findById(studentId).populate('addedBy');
    if (!student || !student.addedBy) return 'N/A';

    // Get all students from the same faculty
    const students = await User.find({
      addedBy: student.addedBy._id,
      role: 'student'
    }).select('_id');

    // Calculate scores for all students
    const studentsWithScores = await Promise.all(
      students.map(async (student) => {
        const acceptedSubmissions = await Submission.countDocuments({
          student: student._id,
          status: 'Accepted'
        });
        const completedAssignments = await Assignment.countDocuments({
          'submissions.student': student._id,
          'submissions.status': 'Completed'
        });
        return {
          _id: student._id,
          score: (acceptedSubmissions * 10) + (completedAssignments * 20)
        };
      })
    );

    // Sort by score and find current student's rank
    studentsWithScores.sort((a, b) => b.score - a.score);
    const rank = studentsWithScores.findIndex(s => 
      s._id.toString() === studentId.toString()
    ) + 1;

    return rank;
  } catch (error) {
    console.error('Error calculating leaderboard rank:', error);
    return 'N/A';
  }
};

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

// Add these new routes
router.get('/stats/:id', auth, async (req, res) => {
  try {
    const userId = req.params.id;
    
    // Get problems solved count
    const problemsSolved = await Submission.countDocuments({
      userId,
      status: 'Accepted'
    });

    // Get completed assignments count
    const completedAssignments = await Assignment.countDocuments({
      'submissions.student': userId,
      'submissions.status': 'Completed'
    });

    // Get college rank
    const allStudents = await User.find({ role: 'student' })
      .select('_id problemsSolved')
      .sort({ problemsSolved: -1 });
      
    const rank = allStudents.findIndex(student => 
      student._id.toString() === userId.toString()
    ) + 1;

    res.json({
      problemsSolved,
      completedAssignments,
      collegeRank: rank || 'N/A'
    });
  } catch (error) {
    console.error('Error fetching student stats:', error);
    res.status(500).json({ message: 'Error fetching student stats' });
  }
});

// Get leaderboard
router.get('/leaderboard', auth, async (req, res) => {
  try {
    // Get the student with their faculty reference
    const student = await User.findById(req.user.id).populate('addedBy');
    if (!student || !student.addedBy) {
      return res.status(404).json({ message: 'Student or faculty not found' });
    }

    // Get all students from the same faculty
    const students = await User.find({
      addedBy: student.addedBy._id,
      role: 'student'
    }).select('_id name email regNumber');

    // Get submissions and assignments data
    const leaderboardData = await Promise.all(
      students.map(async (student) => {
        // Count accepted submissions
        const acceptedSubmissions = await Submission.countDocuments({
          student: student._id,
          status: 'Accepted'
        });

        // Count completed assignments
        const completedAssignments = await Assignment.countDocuments({
          'submissions.student': student._id,
          'submissions.status': 'Completed'
        });

        // Calculate score (you can adjust the scoring formula)
        const score = (acceptedSubmissions * 10) + (completedAssignments * 20);

        return {
          _id: student._id,
          name: student.name,
          email: student.email,
          regNumber: student.regNumber,
          acceptedSubmissions,
          assignmentsCompleted: completedAssignments,
          score
        };
      })
    );

    // Sort by score in descending order
    leaderboardData.sort((a, b) => b.score - a.score);

    // Add rank
    const rankedData = leaderboardData.map((student, index) => ({
      ...student,
      rank: index + 1
    }));

    res.json(rankedData);
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    res.status(500).json({ message: 'Error fetching leaderboard' });
  }
});

// Get contests for student
router.get('/contests', auth, async (req, res) => {
  try {
    const student = await User.findById(req.user.id).populate('addedBy');
    if (!student || !student.addedBy) {
      return res.status(404).json({ message: 'Student or faculty not found' });
    }

    const contests = await Contest.find({
      createdBy: student.addedBy._id,
      isPublished: true
    })
    .populate('problems')
    .sort('-startTime');

    const formattedContests = contests.map(contest => ({
      _id: contest._id,
      title: contest.title,
      description: contest.description,
      startTime: contest.startTime,
      endTime: contest.endTime,
      problems: contest.problems.map(problem => ({
        _id: problem._id,
        title: problem.title,
        difficulty: problem.difficulty
      })),
      status: getContestStatus(contest.startTime, contest.endTime)
    }));

    res.json(formattedContests);
  } catch (error) {
    console.error('Error fetching contests:', error);
    res.status(500).json({ message: 'Error fetching contests' });
  }
});

// Helper function to determine contest status
const getContestStatus = (startTime, endTime) => {
  const now = new Date();
  if (now < new Date(startTime)) return 'Upcoming';
  if (now > new Date(endTime)) return 'Completed';
  return 'Active';
};

// Get assignments for student
router.get('/assignments', auth, async (req, res) => {
  try {
    // Get the student with their faculty reference
    const student = await User.findById(req.user.id).populate('addedBy');
    if (!student || !student.addedBy) {
      return res.status(404).json({ message: 'Student or faculty not found' });
    }

    // Get assignments only from the faculty who added this student
    const assignments = await Assignment.find({
      createdBy: student.addedBy._id
    })
    .populate('createdBy', 'name')
    .populate('problems')
    .sort('-createdAt');

    res.json(assignments);
  } catch (error) {
    console.error('Error fetching assignments:', error);
    res.status(500).json({ message: 'Error fetching assignments' });
  }
});

// Get problems for student
router.get('/problems', auth, async (req, res) => {
  try {
    // Get the student with their faculty reference
    const student = await User.findById(req.user.id).populate('addedBy');
    if (!student || !student.addedBy) {
      return res.status(404).json({ message: 'Student or faculty not found' });
    }

    // Get problems only from the faculty who added this student
    const problems = await Problem.find({
      createdBy: student.addedBy._id
    })
    .populate('createdBy', 'name')
    .sort('-createdAt');

    res.json(problems);
  } catch (error) {
    console.error('Error fetching problems:', error);
    res.status(500).json({ message: 'Error fetching problems' });
  }
});

// Add this route for student dashboard data
router.get('/dashboard', auth, async (req, res) => {
  try {
    const student = await User.findById(req.user.id).populate('addedBy');
    if (!student || !student.addedBy) {
      return res.status(404).json({ message: 'Student or faculty not found' });
    }

    // Get stats
    const problemsSolved = await Submission.countDocuments({
      student: student._id,
      status: 'Accepted'
    });

    const completedAssignments = await Assignment.countDocuments({
      'submissions.student': student._id,
      'submissions.status': 'Completed'
    });

    // Get leaderboard rank
    const leaderboardRank = await calculateLeaderboardRank(student._id);

    // Get recent problems from faculty
    const recentProblems = await Problem.find({ createdBy: student.addedBy._id })
      .sort('-createdAt')
      .limit(3)
      .select('title difficulty _id');

    // Get upcoming assignments from faculty - Fixed date comparison and sorting
    const upcomingAssignments = await Assignment.find({
      createdBy: student.addedBy._id,
      dueDate: { $gt: new Date() }  // Only future assignments
    })
      .sort('dueDate')  // Sort by nearest date first
      .limit(3)         // Get top 3
      .select('title dueDate _id');

    // Get upcoming contests from faculty - Fixed field name from startDate to startTime
    const upcomingContests = await Contest.find({
      createdBy: student.addedBy._id,
      startTime: { $gt: new Date() }  // Changed from startDate to startTime
    })
      .sort('startTime')  // Changed from startDate to startTime
      .limit(3)
      .select('title startTime _id');  // Changed from startDate to startTime

    res.json({
      stats: {
        problemsSolved: problemsSolved || 0,
        leaderboardRank: leaderboardRank || 'N/A',
        completedAssignments: completedAssignments || 0
      },
      recentProblems: recentProblems.map(p => ({
        id: p._id,
        name: p.title,
        difficulty: p.difficulty
      })),
      upcomingAssignments: upcomingAssignments.map(a => ({
        id: a._id,
        name: a.title,
        date: new Date(a.dueDate).toLocaleDateString('en-US', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        })
      })),
      upcomingContests: upcomingContests.map(c => ({
        id: c._id,
        name: c.title || c.name,  // Added fallback to name field
        date: new Date(c.startTime).toLocaleDateString('en-US', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        })
      }))
    });
  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    res.status(500).json({ message: 'Error fetching dashboard data' });
  }
});

module.exports = router;