const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const Assignment = require('../models/Assignment');
const axios = require('axios');
const User = require('../models/User');
const Problem = require('../models/Problem');
const Submission = require('../models/Submission');

// Move this route BEFORE any routes with :id parameter
router.get('/leaderboard', auth, async (req, res) => {
  try {
    // Get the faculty who added this student
    const student = await User.findById(req.user.id).populate('addedBy');
    
    // Get all students added by the same faculty
    const students = await User.find({ 
      role: 'student',
      class: req.user.class,
      addedBy: student.addedBy._id // Only get students added by the same faculty
    }).select('name email').lean();

    // Get all assignments from this faculty
    const assignments = await Assignment.find({ 
      class: req.user.class,
      createdBy: student.addedBy._id // Only get assignments from the same faculty
    }).populate('submissions.student', 'name email').lean();

    // Initialize points map with all students
    const studentPoints = new Map(
      students.map(student => [
        student._id.toString(),
        {
          student: {
            _id: student._id,
            name: student.name,
            email: student.email
          },
          totalPoints: 0,
          problemsSolved: 0
        }
      ])
    );

    // Calculate points for each student
    assignments.forEach(assignment => {
      const uniqueSolvedProblems = new Map(); // Track unique solved problems per student

      assignment.submissions?.forEach(submission => {
        if (submission.status === 'PASSED') {
          const studentId = submission.student._id.toString();
          const problemId = submission.problemId.toString();
          
          if (!uniqueSolvedProblems.has(studentId)) {
            uniqueSolvedProblems.set(studentId, new Set());
          }

          // Only count points for unique problems solved
          if (!uniqueSolvedProblems.get(studentId).has(problemId)) {
            uniqueSolvedProblems.get(studentId).add(problemId);
            const studentData = studentPoints.get(studentId);
            if (studentData) {
              studentData.totalPoints += 10;
              studentData.problemsSolved += 1;
            }
          }
        }
      });
    });

    // Convert to array and sort by points
    const leaderboard = Array.from(studentPoints.values())
      .sort((a, b) => b.totalPoints - a.totalPoints || b.problemsSolved - a.problemsSolved)
      .map((entry, index) => ({
        ...entry,
        rank: index + 1
      }));

    res.json(leaderboard);
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    res.status(500).json({ message: 'Error fetching leaderboard' });
  }
});

// Get all assignments for student
router.get('/', auth, async (req, res) => {
  try {
    // Get the faculty who added this student
    const student = await User.findById(req.user.id).populate('addedBy');
    
    const assignments = await Assignment.find({
      class: req.user.class,
      createdBy: student.addedBy._id // Only get assignments from the faculty who added the student
    })
    .populate('createdBy', 'name')
    .lean();

    const formattedAssignments = assignments.map(assignment => {
      // Get unique solved problems (avoid counting duplicates)
      const solvedProblems = new Set(
        (assignment.submissions || [])
          .filter(sub => 
            sub.student.toString() === req.user.id && 
            sub.status === 'PASSED'
          )
          .map(sub => sub.problemId.toString())
      );

      // Calculate total points (10 points per problem)
      const earnedPoints = solvedProblems.size * 10;
      const totalPoints = assignment.problems.length * 10;

      return {
        _id: assignment._id,
        title: assignment.title,
        description: assignment.description,
        dueDate: assignment.dueDate,
        createdBy: assignment.createdBy,
        problems: assignment.problems.map(problem => ({
          _id: problem._id,
          title: problem.title,
          description: problem.description,
          points: 10, // Set fixed points
          language: problem.language
        })),
        totalProblems: assignment.problems.length,
        problemsSolved: solvedProblems.size,
        earnedPoints,
        totalPoints
      };
    });

    res.json(formattedAssignments);
  } catch (error) {
    console.error('Error fetching assignments:', error);
    res.status(500).json({ message: 'Error fetching assignments' });
  }
});

// Get specific assignment for student
router.get('/:id', auth, async (req, res) => {
  try {
    const assignment = await Assignment.findById(req.params.id)
      .populate('createdBy', 'name')
      .populate({
        path: 'problems',
        select: 'title description points language testCases'
      })
      .lean();

    if (!assignment) {
      return res.status(404).json({ message: 'Assignment not found' });
    }

    // Get all solved problems for this student
    const solvedProblems = new Set(
      assignment.submissions
        ?.filter(sub => 
          sub.student.toString() === req.user.id.toString() && 
          sub.status === 'PASSED'
        )
        .map(sub => sub.problemId.toString())
    );

    // Calculate points
    const earnedPoints = solvedProblems.size * 10;
    const totalPoints = assignment.problems.length * 10;

    const formattedProblems = assignment.problems.map(problem => ({
      ...problem,
      solved: solvedProblems.has(problem._id.toString()),
      points: 10 // Ensure each problem shows points
    }));

    const formattedAssignment = {
      ...assignment,
      problems: formattedProblems,
      problemsSolved: solvedProblems.size,
      totalProblems: assignment.problems.length,
      earnedPoints,
      totalPoints
    };

    res.json(formattedAssignment);
  } catch (error) {
    console.error('Error fetching assignment:', error);
    res.status(500).json({ message: 'Error fetching assignment' });
  }
});

// Add this route after your existing routes
router.post('/:id/submit', auth, async (req, res) => {
  try {
    const { problemId, code, language } = req.body;
    const assignment = await Assignment.findById(req.params.id)
      .populate({
        path: 'problems',
        match: { _id: problemId },
        populate: {
          path: 'testCases'
        }
      });

    if (!assignment) {
      return res.status(404).json({ message: 'Assignment not found' });
    }

    // Add class field if it doesn't exist
    if (!assignment.class) {
      assignment.class = req.user.class;
    }

    const problem = assignment.problems[0];
    if (!problem) {
      return res.status(404).json({ message: 'Problem not found in assignment' });
    }

    if (!problem.testCases || problem.testCases.length === 0) {
      return res.status(400).json({ message: 'No test cases found for this problem' });
    }

    // Test all test cases using CodeX API
    let allTestsPassed = true;
    let failedTestCase = null;

    for (const testCase of problem.testCases) {
      try {
        const response = await axios.post('https://api.codex.jaagrav.in', {
          code,
          language: language === 'cpp' ? 'cpp' : language,
          input: testCase.input
        });

        if (response.data.error) {
          return res.status(400).json({ 
            success: false, 
            message: 'Compilation Error', 
            error: response.data.error 
          });
        }

        const actualOutput = response.data.output?.trim() || '';
        const expectedOutput = testCase.output?.trim() || '';

        console.log('Test case comparison:', {
          input: testCase.input,
          actualOutput,
          expectedOutput,
          rawTestCase: testCase
        });

        if (actualOutput !== expectedOutput) {
          allTestsPassed = false;
          failedTestCase = {
            input: testCase.input,
            expectedOutput,
            actualOutput
          };
          break;
        }
      } catch (error) {
        console.error('CodeX API error:', error);
        return res.status(500).json({
          success: false,
          message: 'Error executing code',
          error: error.message
        });
      }
    }

    // Update submission in the assignment
    const submission = {
      student: req.user.id,
      problemId,
      code,
      language,
      status: allTestsPassed ? 'PASSED' : 'FAILED',
      class: req.user.class
    };

    if (!assignment.submissions) {
      assignment.submissions = [];
    }
    
    assignment.submissions.push(submission);

    // Use save with validation disabled for this update
    await assignment.save({ validateBeforeSave: false });

    if (allTestsPassed) {
      // Update the assignment's submissions
      await Assignment.findByIdAndUpdate(req.params.id, {
        $push: {
          submissions: {
            student: req.user.id,
            problemId,
            code,
            language,
            status: 'PASSED',
            points: 10, // Add points field
            submittedAt: new Date()
          }
        }
      });

      // Reload the assignment data to get updated counts
      const updatedAssignment = await Assignment.findById(req.params.id).lean();
      const solvedProblems = new Set(
        updatedAssignment.submissions
          .filter(sub => 
            sub.student.toString() === req.user.id.toString() && 
            sub.status === 'PASSED'
          )
          .map(sub => sub.problemId.toString())
      );

      const earnedPoints = solvedProblems.size * 10;
      const totalPoints = updatedAssignment.problems.length * 10;

      res.json({
        success: true,
        message: 'All test cases passed!',
        problemsSolved: solvedProblems.size,
        totalProblems: updatedAssignment.problems.length,
        earnedPoints,
        totalPoints
      });
    } else {
      res.json({
        success: false,
        message: 'Some test cases failed',
        failedTestCase: !allTestsPassed && !failedTestCase?.isHidden ? failedTestCase : null
      });
    }

  } catch (error) {
    console.error('Submission error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error processing submission',
      error: error.message 
    });
  }
});

// Get assignment submissions (faculty view)
router.get('/:id/submissions', auth, async (req, res) => {
  try {
    // Get the assignment with populated problems and submissions
    const assignment = await Assignment.findById(req.params.id)
      .populate({
        path: 'problems',
        select: '_id title'
      })
      .populate({
        path: 'submissions.student',
        select: 'name email regNumber'
      })
      .lean();

    if (!assignment) {
      return res.status(404).json({ message: 'Assignment not found' });
    }

    // Get all students in the class
    const students = await User.find({
      addedBy: req.user.id,
      role: 'student',
      class: assignment.class
    }).select('name email regNumber').lean();

    // Create a map to track student progress
    const studentProgress = new Map();

    // Initialize progress for all students
    students.forEach(student => {
      studentProgress.set(student._id.toString(), {
        student: {
          _id: student._id,
          name: student.name,
          email: student.email,
          regNumber: student.regNumber
        },
        problemsSolved: new Set(),
        lastSubmission: null,
        totalPoints: 0,
        submissions: []
      });
    });

    // Process all submissions
    assignment.submissions?.forEach(submission => {
      const studentId = submission.student._id.toString();
      const progress = studentProgress.get(studentId);
      
      if (progress && submission.status === 'PASSED') {
        // Only count unique solved problems
        if (!progress.problemsSolved.has(submission.problemId.toString())) {
          progress.problemsSolved.add(submission.problemId.toString());
          progress.totalPoints += 10; // 10 points per problem
        }
        
        // Track submission details
        progress.submissions.push({
          problemId: submission.problemId,
          submittedAt: submission.submittedAt,
          status: submission.status
        });
        
        // Update last submission time
        if (!progress.lastSubmission || new Date(submission.submittedAt) > new Date(progress.lastSubmission)) {
          progress.lastSubmission = submission.submittedAt;
        }
      }
    });

    // Format the response
    const submissionsList = Array.from(studentProgress.values())
      .map(progress => {
        const problemsCompleted = progress.problemsSolved.size;
        const totalProblems = assignment.problems.length;

        return {
          student: progress.student,
          status: problemsCompleted === 0 ? 'NOT_STARTED' 
                 : problemsCompleted === totalProblems ? 'COMPLETED' 
                 : 'IN_PROGRESS',
          problemsCompleted: `${problemsCompleted} / ${totalProblems}`,
          lastSubmission: progress.lastSubmission 
            ? new Date(progress.lastSubmission).toLocaleString()
            : 'Not submitted',
          score: Math.round((problemsCompleted / totalProblems) * 100),
          totalPoints: progress.totalPoints,
          submissions: progress.submissions.sort((a, b) => 
            new Date(b.submittedAt) - new Date(a.submittedAt)
          )
        };
      })
      .sort((a, b) => b.totalPoints - a.totalPoints);

    res.json(submissionsList);

  } catch (error) {
    console.error('Error fetching assignment submissions:', error);
    res.status(500).json({ 
      message: 'Error fetching submissions',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined 
    });
  }
});

// Add this route for faculty assignment creation
router.post('/faculty/assignments', auth, async (req, res) => {
  try {
    if (req.user.role !== 'faculty') {
      return res.status(403).json({ message: 'Only faculty can create assignments' });
    }

    const { title, description, class: className, dueDate, problemIds } = req.body;

    // Validate problemIds array
    if (!Array.isArray(problemIds) || problemIds.length === 0) {
      return res.status(400).json({ message: 'At least one problem is required' });
    }

    // Fetch the problems from the Problems collection
    const problems = await Problem.find({
      _id: { $in: problemIds },
      createdBy: req.user.id
    }).lean();

    if (problems.length !== problemIds.length) {
      return res.status(400).json({ message: 'Some problems were not found' });
    }

    const assignment = new Assignment({
      title: title.trim(),
      description: description.trim(),
      class: className,
      dueDate,
      problems: problems.map(problem => ({
        _id: problem._id,
        title: problem.title,
        description: problem.description,
        points: problem.points,
        language: problem.language,
        testCases: problem.testCases
      })),
      createdBy: req.user.id
    });

    await assignment.save();
    res.status(201).json(assignment);
  } catch (error) {
    console.error('Error creating assignment:', error);
    res.status(500).json({ message: 'Error creating assignment' });
  }
});

// Get faculty assignments
router.get('/faculty/assignments', auth, async (req, res) => {
  try {
    if (req.user.role !== 'faculty') {
      return res.status(403).json({ message: 'Only faculty can access this route' });
    }

    const assignments = await Assignment.find({ createdBy: req.user.id })
      .populate('createdBy', 'name')
      .sort('-createdAt')
      .lean();

    const assignmentsWithStats = assignments.map(assignment => ({
      ...assignment,
      totalProblems: assignment.problems.length,
      totalSubmissions: assignment.submissions.length,
      uniqueSubmissions: new Set(assignment.submissions.map(s => s.student.toString())).size
    }));

    res.json(assignmentsWithStats);
  } catch (error) {
    console.error('Error fetching faculty assignments:', error);
    res.status(500).json({ message: 'Error fetching assignments' });
  }
});

// Get specific assignment for faculty
router.get('/faculty/assignments/:id', auth, async (req, res) => {
  try {
    if (req.user.role !== 'faculty') {
      return res.status(403).json({ message: 'Only faculty can access this route' });
    }

    const assignment = await Assignment.findOne({
      _id: req.params.id,
      createdBy: req.user.id
    }).populate('createdBy', 'name').lean();

    if (!assignment) {
      return res.status(404).json({ message: 'Assignment not found' });
    }

    res.json(assignment);
  } catch (error) {
    console.error('Error fetching assignment:', error);
    res.status(500).json({ message: 'Error fetching assignment' });
  }
});

// Get assignment details with student submissions for faculty
router.get('/faculty/:id', auth, async (req, res) => {
  try {
    // Get assignment with populated problems
    const assignment = await Assignment.findOne({
      _id: req.params.id,
      createdBy: req.user.id
    })
    .populate('problems')
    .populate('submissions.student', 'name email')
    .lean();

    if (!assignment) {
      return res.status(404).json({ message: 'Assignment not found' });
    }

    // Get all students assigned to this faculty
    const students = await User.find({
      addedBy: req.user.id,
      role: 'student'
    }).select('name email').lean();

    // Create a map of student submissions
    const submissionMap = new Map();
    assignment.submissions?.forEach(submission => {
      const studentId = submission.student._id.toString();
      if (!submissionMap.has(studentId)) {
        submissionMap.set(studentId, {
          student: submission.student,
          problemsSolved: new Set(),
          lastSubmission: null,
          status: 'Pending'
        });
      }
      
      const studentData = submissionMap.get(studentId);
      if (submission.status === 'PASSED') {
        studentData.problemsSolved.add(submission.problemId.toString());
      }
      
      // Update last submission time
      const submissionTime = new Date(submission.submittedAt);
      if (!studentData.lastSubmission || submissionTime > new Date(studentData.lastSubmission)) {
        studentData.lastSubmission = submission.submittedAt;
      }
      
      // Update status if any submission is PASSED
      if (submission.status === 'PASSED') {
        studentData.status = 'PASSED';
      }
    });

    // Format student submissions including students with no submissions
    const studentSubmissions = students.map(student => {
      const studentId = student._id.toString();
      const submissionData = submissionMap.get(studentId) || {
        problemsSolved: new Set(),
        lastSubmission: null,
        status: 'Pending'
      };

      // Calculate score based on problems solved
      const problemsSolvedCount = submissionData.problemsSolved.size;
      const totalProblems = assignment.problems.length;
      const score = totalProblems > 0 
        ? Math.round((problemsSolvedCount / totalProblems) * 100) 
        : 0;

      return {
        student: {
          name: student.name,
          email: student.email
        },
        status: submissionData.status,
        problemsCompleted: problemsSolvedCount,
        totalProblems: totalProblems,
        lastSubmission: submissionData.lastSubmission,
        score: score
      };
    });

    res.json({
      ...assignment,
      studentSubmissions
    });
  } catch (error) {
    console.error('Error fetching assignment details:', error);
    res.status(500).json({ message: 'Error fetching assignment details' });
  }
});

// Get assignment submissions (faculty view)
router.get('/faculty/assignments/:id/submissions', auth, async (req, res) => {
  try {
    console.log('Fetching submissions for assignment:', req.params.id);
    
    if (req.user.role !== 'faculty') {
      return res.status(403).json({ message: 'Only faculty can access this route' });
    }

    // Get the assignment with its problems
    const assignment = await Assignment.findOne({
      _id: req.params.id,
      createdBy: req.user._id
    }).populate('problems').lean();

    console.log('Assignment found:', {
      id: assignment?._id,
      totalProblems: assignment?.problems?.length,
    });

    if (!assignment) {
      return res.status(404).json({ message: 'Assignment not found' });
    }

    // Get all students in the class
    const students = await User.find({
      addedBy: req.user._id,
      role: 'student',
      class: assignment.class
    }).select('name email regNumber').lean();

    console.log('Students found:', students.length);

    // Get all submissions for this assignment
    const submissions = await Submission.find({
      assignment: assignment._id
    }).lean();

    console.log('Total submissions found:', submissions.length);
    console.log('Sample submission:', submissions[0]);

    // Create a map to track student progress
    const studentProgress = new Map();

    // Initialize progress for all students
    students.forEach(student => {
      studentProgress.set(student._id.toString(), {
        student: {
          _id: student._id,
          name: student.name,
          email: student.email,
          regNumber: student.regNumber
        },
        problemsSolved: new Set(),
        lastSubmission: null,
        status: 'NOT_STARTED',
        totalPoints: 0
      });
    });

    // Process all submissions
    submissions.forEach(submission => {
      const studentId = submission.student.toString();
      const progress = studentProgress.get(studentId);
      
      console.log('Processing submission:', {
        studentId,
        problemId: submission.problemId,
        status: submission.status,
        submittedAt: submission.submittedAt
      });
      
      if (progress && submission.status === 'PASSED') {
        if (!progress.problemsSolved.has(submission.problemId.toString())) {
          progress.problemsSolved.add(submission.problemId.toString());
          progress.totalPoints += 10;
          
          console.log('Updated student progress:', {
            studentId,
            problemsSolved: progress.problemsSolved.size,
            totalPoints: progress.totalPoints
          });
        }
        
        const submissionTime = new Date(submission.submittedAt);
        if (!progress.lastSubmission || submissionTime > new Date(progress.lastSubmission)) {
          progress.lastSubmission = submission.submittedAt;
        }
      }
    });

    // Format and return the response
    const submissionsList = Array.from(studentProgress.values())
      .map(progress => {
        const problemsCompleted = progress.problemsSolved.size;
        const totalProblems = assignment.problems.length;
        
        console.log('Formatting student submission:', {
          studentId: progress.student._id,
          problemsCompleted,
          totalProblems,
          lastSubmission: progress.lastSubmission
        });

        let status = 'NOT_STARTED';
        if (problemsCompleted > 0) {
          status = problemsCompleted === totalProblems ? 'COMPLETED' : 'IN_PROGRESS';
        }

        return {
          student: progress.student,
          status: status,
          problemsCompleted: `${problemsCompleted} / ${totalProblems}`,
          lastSubmission: progress.lastSubmission 
            ? new Date(progress.lastSubmission).toLocaleString()
            : 'Not submitted',
          score: totalProblems > 0 
            ? Math.round((problemsCompleted / totalProblems) * 100)
            : 0,
          totalPoints: progress.totalPoints
        };
      });

    console.log('Final submissions list:', submissionsList.map(s => ({
      student: s.student.email,
      problemsCompleted: s.problemsCompleted,
      status: s.status,
      score: s.score
    })));

    res.json(submissionsList);

  } catch (error) {
    console.error('Error fetching assignment submissions:', error);
    res.status(500).json({ 
      message: 'Error fetching submissions',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined 
    });
  }
});

module.exports = router;