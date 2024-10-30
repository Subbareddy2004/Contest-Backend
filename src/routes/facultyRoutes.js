const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const { isFaculty } = require('../middleware/faculty');
const User = require('../models/User');
const Problem = require('../models/Problem');
const Assignment = require('../models/Assignment');
const Contest = require('../models/Contest');
const multer = require('multer');
const csv = require('csv-parser');
const bcrypt = require('bcryptjs');
const { sendWelcomeEmail } = require('../utils/emailService');

// Configure multer to use memory storage
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Get faculty profile
router.get('/profile', auth, isFaculty, async (req, res) => {
  try {
    const faculty = await User.findById(req.user.id)
      .select('-password');
    res.json(faculty);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching profile' });
  }
});

// Update faculty profile
router.put('/profile', auth, isFaculty, async (req, res) => {
  try {
    const { name, email } = req.body;
    
    // Check if email is already in use
    const existingUser = await User.findOne({ email, _id: { $ne: req.user.id } });
    if (existingUser) {
      return res.status(400).json({ message: 'Email already in use' });
    }

    const faculty = await User.findByIdAndUpdate(
      req.user.id,
      { name, email },
      { new: true }
    ).select('-password');

    res.json(faculty);
  } catch (error) {
    res.status(500).json({ message: 'Error updating profile' });
  }
});

// Get dashboard stats
router.get('/dashboard-stats', auth, isFaculty, async (req, res) => {
  try {
    // Add your dashboard stats logic here
    res.json({
      totalStudents: 0,
      totalAssignments: 0,
      totalSubmissions: 0
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching dashboard stats' });
  }
});

// Get faculty problems
router.get('/problems', auth, isFaculty, async (req, res) => {
  try {
    console.log('Fetching problems for faculty:', req.user.id);
    const problems = await Problem.find({ createdBy: req.user.id })
      .sort('-createdAt');
    res.json(problems);
  } catch (error) {
    console.error('Error fetching faculty problems:', error);
    res.status(500).json({ message: 'Error fetching problems' });
  }
});

// Create new problem
router.post('/problems', auth, isFaculty, async (req, res) => {
  try {
    console.log('Creating problem with data:', req.body);
    
    const problemData = {
      ...req.body,
      createdBy: req.user.id
    };
    
    if (!problemData.title || !problemData.description || !problemData.difficulty) {
      return res.status(400).json({ 
        message: 'Missing required fields',
        required: ['title', 'description', 'difficulty']
      });
    }
    
    const problem = new Problem(problemData);
    await problem.save();
    
    console.log('Problem created successfully:', problem._id);
    res.status(201).json(problem);
  } catch (error) {
    console.error('Error creating problem:', error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({ 
        message: 'Validation error',
        errors: Object.values(error.errors).map(err => err.message)
      });
    }
    res.status(500).json({ 
      message: 'Error creating problem',
      error: error.message 
    });
  }
});

// Update existing problem
router.put('/problems/:id', auth, isFaculty, async (req, res) => {
  try {
    const problem = await Problem.findOneAndUpdate(
      { _id: req.params.id, createdBy: req.user.id },
      req.body,
      { new: true }
    );
    
    if (!problem) {
      return res.status(404).json({ message: 'Problem not found' });
    }
    
    res.json(problem);
  } catch (error) {
    console.error('Error updating problem:', error);
    res.status(500).json({ message: 'Error updating problem' });
  }
});

// Delete problem
router.delete('/problems/:id', auth, isFaculty, async (req, res) => {
  try {
    const problem = await Problem.findOneAndDelete({
      _id: req.params.id,
      createdBy: req.user.id
    });
    
    if (!problem) {
      return res.status(404).json({ message: 'Problem not found' });
    }
    
    res.json({ message: 'Problem deleted successfully' });
  } catch (error) {
    console.error('Error deleting problem:', error);
    res.status(500).json({ message: 'Error deleting problem' });
  }
});

// Get all assignments
router.get('/assignments', auth, isFaculty, async (req, res) => {
  try {
    const assignments = await Assignment.find({ createdBy: req.user.id })
      .populate('problems')
      .sort('-createdAt');
    res.json(assignments);
  } catch (error) {
    console.error('Error fetching assignments:', error);
    res.status(500).json({ message: 'Error fetching assignments' });
  }
});

// Create new assignment
router.post('/assignments', auth, isFaculty, async (req, res) => {
  try {
    const { title, description, dueDate, problems } = req.body;

    // Validate required fields
    if (!title || !description || !dueDate || !problems) {
      return res.status(400).json({ 
        message: 'Missing required fields. Please provide title, description, dueDate, and problems.' 
      });
    }

    const assignment = new Assignment({
      title,
      description,
      dueDate,
      problems,
      createdBy: req.user.id
    });

    await assignment.save();
    res.status(201).json(assignment);
  } catch (error) {
    console.warn('Error creating assignment:', error);
    res.status(500).json({ message: 'Error creating assignment', error: error.message });
  }
});

// Update assignment
router.put('/assignments/:id', auth, isFaculty, async (req, res) => {
  try {
    const assignment = await Assignment.findOneAndUpdate(
      { _id: req.params.id, createdBy: req.user.id },
      req.body,
      { new: true }
    ).populate('problems');

    if (!assignment) {
      return res.status(404).json({ message: 'Assignment not found' });
    }

    res.json(assignment);
  } catch (error) {
    console.error('Error updating assignment:', error);
    res.status(500).json({ message: 'Error updating assignment' });
  }
});

// Delete assignment
router.delete('/assignments/:id', auth, isFaculty, async (req, res) => {
  try {
    const assignment = await Assignment.findOneAndDelete({
      _id: req.params.id,
      createdBy: req.user.id
    });

    if (!assignment) {
      return res.status(404).json({ message: 'Assignment not found' });
    }

    res.json({ message: 'Assignment deleted successfully' });
  } catch (error) {
    console.error('Error deleting assignment:', error);
    res.status(500).json({ message: 'Error deleting assignment' });
  }
});

// Get single assignment
router.get('/assignments/:id', auth, isFaculty, async (req, res) => {
  try {
    const assignment = await Assignment.findOne({
      _id: req.params.id,
      createdBy: req.user.id
    }).populate('problems');

    if (!assignment) {
      return res.status(404).json({ message: 'Assignment not found' });
    }

    res.json(assignment);
  } catch (error) {
    console.error('Error fetching assignment:', error);
    res.status(500).json({ message: 'Error fetching assignment' });
  }
});

// Update the submissions route
router.get('/assignments/:id/submissions', auth, isFaculty, async (req, res) => {
  try {
    // Get the assignment with existing submissions
    const assignment = await Assignment.findOne({
      _id: req.params.id,
      createdBy: req.user.id
    }).populate({
      path: 'submissions',
      populate: {
        path: 'student',
        select: 'name email'
      }
    });

    if (!assignment) {
      return res.status(404).json({ message: 'Assignment not found' });
    }

    // Get all students
    const allStudents = await User.find({ role: 'student' })
      .select('name email');

    // Create a map of existing submissions
    const submissionMap = new Map(
      assignment.submissions?.map(sub => [sub.student._id.toString(), sub]) || []
    );

    // Combine all students with their submission status
    const allSubmissions = allStudents.map(student => {
      const existingSubmission = submissionMap.get(student._id.toString());
      
      return existingSubmission || {
        student: {
          _id: student._id,
          name: student.name,
          email: student.email
        },
        status: 'Pending',
        submittedAt: null,
        score: null
      };
    });

    res.json(allSubmissions);
  } catch (error) {
    console.error('Error fetching assignment submissions:', error);
    res.status(500).json({ message: 'Error fetching submissions' });
  }
});

// Add this new route for contest leaderboard
router.get('/contests/:id/leaderboard', auth, isFaculty, async (req, res) => {
  try {
    const contest = await Contest.findOne({
      _id: req.params.id,
      createdBy: req.user.id
    }).populate({
      path: 'problems.problem',
      select: 'title'
    }).populate({
      path: 'submissions',
      populate: {
        path: 'student',
        select: 'name email'
      }
    });

    if (!contest) {
      return res.status(404).json({ message: 'Contest not found' });
    }

    // Get all students
    const allStudents = await User.find({ role: 'student' })
      .select('name email');

    // Create submission map for quick lookup
    const submissionMap = new Map(
      contest.submissions.map(sub => [sub.student._id.toString(), sub])
    );

    // Create leaderboard with all students
    const leaderboard = allStudents.map(student => {
      const submission = submissionMap.get(student._id.toString());
      return {
        student: {
          _id: student._id,
          name: student.name,
          email: student.email
        },
        status: submission ? 'Submitted' : 'Pending',
        score: submission?.score || 0,
        submittedAt: submission?.submittedAt || null,
        problemScores: submission?.problemScores || [],
        totalTime: submission ? 
          (new Date(submission.submittedAt) - new Date(contest.startTime)) / 1000 / 60 : 
          null
      };
    });

    // Sort by score (descending) and submission time
    leaderboard.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (!a.submittedAt) return 1;
      if (!b.submittedAt) return -1;
      return a.totalTime - b.totalTime;
    });

    res.json({
      contest,
      leaderboard
    });
  } catch (error) {
    console.error('Error fetching contest leaderboard:', error);
    res.status(500).json({ message: 'Error fetching leaderboard' });
  }
});

// Get contest submissions
router.get('/contests/:id/submissions', auth, isFaculty, async (req, res) => {
  try {
    const contest = await Contest.findOne({
      _id: req.params.id,
      createdBy: req.user.id
    }).populate({
      path: 'submissions',
      populate: {
        path: 'student',
        select: 'name email'
      }
    });

    if (!contest) {
      return res.status(404).json({ message: 'Contest not found' });
    }

    // Get all students and their submission status
    const students = await User.find({ role: 'student' })
      .select('name email');
    
    // Create a map of existing submissions
    const submissionMap = new Map(
      contest.submissions.map(sub => [sub.student._id.toString(), sub])
    );

    // Combine all students with their submission status
    const allSubmissions = students.map(student => ({
      student: {
        _id: student._id,
        name: student.name,
        email: student.email
      },
      status: submissionMap.has(student._id.toString()) ? 'Completed' : 'Pending',
      submittedAt: submissionMap.get(student._id.toString())?.submittedAt || null,
      score: submissionMap.get(student._id.toString())?.score || 0
    }));

    res.json({
      contest: {
        _id: contest._id,
        title: contest.title
      },
      submissions: allSubmissions
    });
  } catch (error) {
    console.error('Error fetching contest submissions:', error);
    res.status(500).json({ message: 'Error fetching submissions' });
  }
});

// Get all contests
router.get('/contests', auth, isFaculty, async (req, res) => {
  try {
    const contests = await Contest.find({ createdBy: req.user.id })
      .populate({
        path: 'problems.problem',
        select: 'title difficulty'
      })
      .populate({
        path: 'submissions',
        select: '_id'
      })
      .sort('-createdAt');
    res.json(contests);
  } catch (error) {
    console.error('Error fetching contests:', error);
    res.status(500).json({ message: 'Error fetching contests' });
  }
});

// Create contest
router.post('/contests', auth, isFaculty, async (req, res) => {
  try {
    const contestData = {
      ...req.body,
      createdBy: req.user.id
    };

    // Validate required fields
    if (!contestData.title || !contestData.startTime || !contestData.duration) {
      return res.status(400).json({
        message: 'Missing required fields',
        required: ['title', 'startTime', 'duration']
      });
    }

    // Ensure problems array is properly formatted
    if (!Array.isArray(contestData.problems) || contestData.problems.length === 0) {
      return res.status(400).json({
        message: 'Contest must have at least one problem'
      });
    }

    const contest = new Contest(contestData);
    await contest.save();

    // Populate the problems before sending response
    await contest.populate({
      path: 'problems.problem',
      select: 'title difficulty'
    });

    res.status(201).json(contest);
  } catch (error) {
    console.error('Error creating contest:', error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        message: 'Validation error',
        errors: Object.values(error.errors).map(err => err.message)
      });
    }
    res.status(500).json({
      message: 'Error creating contest',
      error: error.message
    });
  }
});

// Update contest
router.put('/contests/:id', auth, isFaculty, async (req, res) => {
  try {
    const contest = await Contest.findOneAndUpdate(
      { _id: req.params.id, createdBy: req.user.id },
      req.body,
      { new: true }
    ).populate('problems.problem');
    
    if (!contest) {
      return res.status(404).json({ message: 'Contest not found' });
    }
    
    res.json(contest);
  } catch (error) {
    console.error('Error updating contest:', error);
    res.status(500).json({ message: 'Error updating contest' });
  }
});

// Delete contest
router.delete('/contests/:id', auth, isFaculty, async (req, res) => {
  try {
    const contest = await Contest.findOneAndDelete({
      _id: req.params.id,
      createdBy: req.user.id
    });
    
    if (!contest) {
      return res.status(404).json({ message: 'Contest not found' });
    }
    
    res.json({ message: 'Contest deleted successfully' });
  } catch (error) {
    console.error('Error deleting contest:', error);
    res.status(500).json({ message: 'Error deleting contest' });
  }
});

// Update the import students route
router.post('/students/import', auth, isFaculty, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const results = [];
    const errors = [];
    const successfulImports = [];

    // Convert buffer to string and process CSV
    const fileContent = req.file.buffer.toString('utf-8');
    const rows = fileContent.split('\n');
    
    // Process header row
    const header = rows[0].trim().split(',');
    
    // Process data rows
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i].trim();
      if (!row) continue; // Skip empty rows
      
      const values = row.split(',');
      const data = {};
      header.forEach((h, index) => {
        data[h.trim()] = values[index]?.trim();
      });

      try {
        const email = data.email?.toLowerCase();
        const regNumber = data.regNumber?.toString();
        
        if (!email || !regNumber) {
          errors.push(`Row ${i}: Missing email or registration number`);
          continue;
        }

        // Check if user exists
        const existingUser = await User.findOne({
          $or: [{ email }, { regNumber }]
        });
        
        if (existingUser) {
          errors.push(`User with email ${email} or registration number ${regNumber} already exists`);
          continue;
        }

        // Create new student
        const newUser = new User({
          name: data.name,
          email,
          regNumber,
          password: regNumber, // Will be hashed by pre-save middleware
          role: 'student',
          isVerified: true
        });

        await newUser.save();
        successfulImports.push(data);

        // Send welcome email
        try {
          await sendWelcomeEmail({
            name: data.name,
            email,
            regNumber,
            password: regNumber,
            loginUrl: process.env.FRONTEND_URL || 'http://localhost:5173'
          });
        } catch (emailError) {
          console.error(`Failed to send welcome email to ${email}:`, emailError);
        }
      } catch (error) {
        errors.push(`Error adding user ${data.email}: ${error.message}`);
      }
    }

    res.json({
      message: `Imported ${successfulImports.length} students successfully`,
      errors: errors.length > 0 ? errors : undefined,
      successfulImports
    });
  } catch (error) {
    console.error('Error importing students:', error);
    res.status(500).json({ 
      message: 'Error importing students', 
      error: error.message 
    });
  }
});

// Get all students
router.get('/students', auth, isFaculty, async (req, res) => {
  try {
    const students = await User.find({ role: 'student' })
      .select('name email regNumber')
      .sort('name');
    res.json(students);
  } catch (error) {
    console.error('Error fetching students:', error);
    res.status(500).json({ message: 'Error fetching students' });
  }
});

// Add single student manually
router.post('/students', auth, isFaculty, async (req, res) => {
  try {
    const { name, email, regNumber } = req.body;

    // Validate required fields
    if (!name || !email || !regNumber) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    // Check if user exists
    const existingUser = await User.findOne({ 
      $or: [{ email: email.toLowerCase() }, { regNumber }] 
    });
    
    if (existingUser) {
      return res.status(400).json({ 
        message: 'User with this email or registration number already exists' 
      });
    }

    // Create new student with registration number as password
    const student = new User({
      name,
      email: email.toLowerCase(),
      regNumber,
      password: regNumber, // Let the pre-save middleware handle hashing
      role: 'student',
      isVerified: true
    });

    await student.save();
    console.log('Student created successfully:', {
      email,
      regNumber
    });
    
    // Send welcome email
    try {
      await sendWelcomeEmail({
        name,
        email: email.toLowerCase(),
        regNumber,
        password: regNumber,
        loginUrl: process.env.FRONTEND_URL || 'http://localhost:5173'
      });
    } catch (emailError) {
      console.error('Failed to send welcome email:', emailError);
    }

    res.status(201).json({
      message: 'Student added successfully',
      student: {
        _id: student._id,
        name: student.name,
        email: student.email,
        regNumber: student.regNumber
      }
    });
  } catch (error) {
    console.error('Error adding student:', error);
    res.status(500).json({ message: 'Error adding student' });
  }
});

// Delete student
router.delete('/students/:id', auth, isFaculty, async (req, res) => {
  try {
    const student = await User.findOneAndDelete({
      _id: req.params.id,
      role: 'student'
    });
    
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }
    
    res.json({ message: 'Student deleted successfully' });
  } catch (error) {
    console.error('Error deleting student:', error);
    res.status(500).json({ message: 'Error deleting student' });
  }
});

// Update student
router.put('/students/:id', auth, isFaculty, async (req, res) => {
  try {
    const { name, email, regNumber } = req.body;

    // Check if email/regNumber is already in use by another student
    const existingUser = await User.findOne({
      $or: [{ email }, { regNumber }],
      _id: { $ne: req.params.id }
    });

    if (existingUser) {
      return res.status(400).json({
        message: 'Email or registration number already in use'
      });
    }

    const student = await User.findOneAndUpdate(
      { _id: req.params.id, role: 'student' },
      { name, email, regNumber },
      { new: true }
    ).select('-password');

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    res.json({ message: 'Student updated successfully', student });
  } catch (error) {
    console.error('Error updating student:', error);
    res.status(500).json({ message: 'Error updating student' });
  }
});

// File upload route
router.post('/upload', auth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    // Convert buffer to base64
    const fileStr = req.file.buffer.toString('base64');
    const uploadResponse = await cloudinary.uploader.upload(
      `data:${req.file.mimetype};base64,${fileStr}`,
      { 
        folder: 'contest-platform',
        resource_type: 'auto'
      }
    );

    res.json({ 
      url: uploadResponse.secure_url,
      public_id: uploadResponse.public_id 
    });
  } catch (error) {
    console.error('Error uploading file:', error);
    res.status(500).json({ message: 'Error uploading file' });
  }
});

module.exports = router;
 