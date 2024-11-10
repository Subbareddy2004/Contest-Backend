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


router.get('/dashboard', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    console.log('Fetching dashboard for student:', userId);
    const now = new Date();

    // First get the student with their faculty reference
    const student = await User.findById(userId).populate('addedBy');
    if (!student || !student.addedBy) {
      return res.status(404).json({ message: 'Student or faculty not found' });
    }

    // Get contest statistics
    const [activeContests, participatedContests] = await Promise.all([
      Contest.countDocuments({
        isPublished: true,
        startTime: { $lte: now },
        $expr: {
          $gt: [
            { $add: ['$startTime', { $multiply: ['$duration', 60000] }] },
            now
          ]
        }
      }),
      Contest.countDocuments({
        'participants.student': userId
      })
    ]);

    // Get assignments with their progress
    const assignments = await Assignment.find({
      createdBy: student.addedBy._id
    })
    .select('title problems submissions')
    .lean();

    let completedAssignments = 0;
    let totalAssignments = assignments.length;

    // Process each assignment
    const processedAssignments = assignments.map(assignment => {
      const totalProblems = assignment.problems.length;
      let problemsSolved = 0;

      // Count solved problems for this student
      const studentSubmissions = assignment.submissions.filter(sub => 
        sub.student.toString() === userId && sub.status === 'PASSED'
      );
      
      // Count unique solved problems
      const solvedProblemIds = new Set(
        studentSubmissions.map(sub => sub.problemId.toString())
      );
      problemsSolved = solvedProblemIds.size;

      // Check if assignment is completed
      if (problemsSolved === totalProblems) {
        completedAssignments++;
      }

      return {
        ...assignment,
        totalProblems,
        problemsSolved
      };
    });

    console.log(`Student ${userId} stats:`, {
      facultyId: student.addedBy._id,
      totalAssignments,
      completedAssignments,
      assignments: processedAssignments
    });

    const response = {
      stats: {
        activeContests,
        participatedContests,
        completedAssignments
      },
      performanceStats: [{
        category: 'Assignments',
        total: totalAssignments,
        completed: completedAssignments
      }]
    };

    console.log('Sending response:', JSON.stringify(response, null, 2));
    res.json(response);

  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({ message: 'Error fetching dashboard statistics' });
  }
});

// Add this to your student routes where submissions are handled
router.post('/assignments/:assignmentId/problems/:problemId/submit', auth, async (req, res) => {
  try {
    // Verify the assignment exists and student has access
    const assignment = await Assignment.findOne({
      _id: req.params.assignmentId,
      'problems': req.params.problemId
    });

    if (!assignment) {
      return res.status(404).json({ message: 'Assignment or problem not found' });
    }

    // Create and save the submission
    const submission = new Submission({
      student: req.user._id,
      assignment: req.params.assignmentId,
      problemId: req.params.problemId,
      code: req.body.code,
      language: req.body.language,
      status: req.body.status, // 'PASSED' or 'FAILED'
      submittedAt: new Date()
    });

    await submission.save();
    
    res.json(submission);
  } catch (error) {
    console.error('Error submitting solution:', error);
    res.status(500).json({ message: 'Error submitting solution' });
  }
});

module.exports = router;