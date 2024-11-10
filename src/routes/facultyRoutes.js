const mongoose = require('mongoose');
const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const { isFaculty } = require('../middleware/faculty');
const User = require('../models/User');
const Problem = require('../models/Problem');
const Assignment = require('../models/Assignment');
const multer = require('multer');
const csv = require('csv-parser');
const bcrypt = require('bcryptjs');
const { sendWelcomeEmail } = require('../utils/emailService');
const cloudinary = require('../config/cloudinary');
const Submission = require('../models/Submission');
const checkOwnership = require('../middleware/checkOwnership');
const Contest = require('../models/Contest');

// IMPORTANT: Replace the existing multer configuration with this one
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
});

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

// Change faculty password
router.put('/change-password', auth, isFaculty, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const faculty = await User.findById(req.user.id);
    
    // Verify current password
    const isMatch = await bcrypt.compare(currentPassword, faculty.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);
    
    // Update password
    await User.findByIdAndUpdate(req.user.id, {
      password: hashedPassword
    });

    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    console.error('Error changing faculty password:', error);
    res.status(500).json({ message: 'Error changing password' });
  }
});

// Get dashboard stats
router.get('/dashboard-stats', auth, isFaculty, async (req, res) => {
  try {
    const [totalStudents, totalAssignments, totalProblems, totalContests] = await Promise.all([
      User.countDocuments({ addedBy: req.user.id, role: 'student' }),
      Assignment.countDocuments({ createdBy: req.user.id }),
      Problem.countDocuments({ createdBy: req.user.id }),
      Contest.countDocuments({ createdBy: req.user.id })
    ]);

    res.json({
      totalStudents,
      totalAssignments,
      totalProblems,
      totalContests
    });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({ message: 'Error fetching dashboard stats' });
  }
});

// Get problems
router.get('/problems', auth, isFaculty, async (req, res) => {
  try {
    console.log('Fetching problems for faculty:', req.user.id);
    const problems = await Problem.find({ 
      createdBy: req.user.id  // Only get problems created by current faculty
    }).sort('-createdAt');

    res.json(problems);
  } catch (error) {
    console.error('Error fetching problems:', error);
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
    console.log('Fetching assignments for faculty:', req.user.id);
    const assignments = await Assignment.find({ 
      createdBy: req.user.id  // Only get assignments created by current faculty
    })
    .populate({
      path: 'problems',
      match: { createdBy: req.user.id }
    })
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
    if (!title || !description || !dueDate || !problems || !problems.length) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required'
      });
    }

    // Convert problem IDs to ObjectIds using new keyword
    const problemIds = problems.map(id => new mongoose.Types.ObjectId(id));

    // Create new assignment
    const assignment = new Assignment({
      title,
      description,
      dueDate: new Date(dueDate),
      problems: problemIds,
      createdBy: req.user._id,
      class: 'DEFAULT'  // Using default class as it's required
    });

    const savedAssignment = await assignment.save();

    res.status(201).json({
      success: true,
      message: 'Assignment created successfully',
      assignment: savedAssignment
    });

  } catch (error) {
    console.error('Error creating assignment:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating assignment',
      error: error.message
    });
  }
});

// Update assignment
router.put('/assignments/:id', auth, isFaculty, async (req, res) => {
  try {
    const assignment = await Assignment.findOneAndUpdate(
      { _id: req.params.id, createdBy: req.user.id },
      req.body,
      { new: true }
    );
    
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
router.get('/assignments/:id', auth, isFaculty, checkOwnership(Assignment), async (req, res) => {
  res.json(req.document);
});

// Update the submissions route
router.get('/assignments/:id/submissions', auth, isFaculty, async (req, res) => {
  try {
    const assignment = await Assignment.findById(req.params.id)
      .populate({
        path: 'submissions.student',
        select: 'name email'
      });

    if (!assignment) {
      return res.status(404).json({ message: 'Assignment not found' });
    }

    // Get all students
    const students = await User.find({ role: 'student' }).select('name email');

    // Create a map to store the latest submission for each student and problem
    const studentSubmissions = new Map();

    // Process all submissions
    assignment.submissions.forEach(submission => {
      const studentId = submission.student._id.toString();
      if (!studentSubmissions.has(studentId)) {
        studentSubmissions.set(studentId, {
          student: submission.student,
          problemsCompleted: new Set(),
          lastSubmission: submission.submittedAt,
          status: submission.status
        });
      }

      const studentData = studentSubmissions.get(studentId);
      
      // Update last submission time if this is more recent
      if (new Date(submission.submittedAt) > new Date(studentData.lastSubmission)) {
        studentData.lastSubmission = submission.submittedAt;
        studentData.status = submission.status;
      }

      // Add to completed problems if PASSED
      if (submission.status === 'PASSED') {
        studentData.problemsCompleted.add(submission.problemId.toString());
      }
    });

    // Create final submissions array
    const submissions = students.map(student => {
      const studentData = studentSubmissions.get(student._id.toString()) || {
        student,
        problemsCompleted: new Set(),
        lastSubmission: null,
        status: 'Pending'
      };

      const problemsCompleted = studentData.problemsCompleted.size;
      const score = Math.round((problemsCompleted / assignment.problems.length) * 100);

      return {
        student: {
          _id: student._id,
          name: student.name,
          email: student.email
        },
        status: studentData.status,
        problemsCompleted: `${problemsCompleted} / ${assignment.problems.length}`,
        lastSubmission: studentData.lastSubmission,
        score: problemsCompleted > 0 ? score : 0
      };
    });

    res.json(submissions);
  } catch (error) {
    console.error('Error fetching submissions:', error);
    res.status(500).json({ message: 'Error fetching submissions' });
  }
});

// Get all contests for faculty
router.get('/contests', auth, isFaculty, async (req, res) => {
  try {
    const contests = await Contest.find({ createdBy: req.user.id })
      .populate('problems.problem')
      .sort('-createdAt');

    const formattedContests = contests.map(contest => {
      const duration = Math.round((new Date(contest.endTime) - new Date(contest.startTime)) / (1000 * 60));
      const now = new Date();
      let status = 'Draft';
      
      if (contest.isPublished) {
        if (now < new Date(contest.startTime)) status = 'Upcoming';
        else if (now > new Date(contest.endTime)) status = 'Completed';
        else status = 'Active';
      }

      return {
        _id: contest._id,
        title: contest.title,
        startTime: contest.startTime,
        endTime: contest.endTime,
        duration: duration,
        status: status,
        problemCount: contest.problems.length,
        isPublished: contest.isPublished,
        description: contest.description,
        problems: contest.problems
      };
    });

    res.json(formattedContests);
  } catch (error) {
    console.error('Error fetching contests:', error);
    res.status(500).json({ message: 'Error fetching contests' });
  }
});

// Update contest publish status
router.patch('/contests/:id/publish', auth, isFaculty, async (req, res) => {
  try {
    const contest = await Contest.findOneAndUpdate(
      { _id: req.params.id, createdBy: req.user.id },
      { isPublished: req.body.isPublished },
      { new: true }
    );
    
    if (!contest) {
      return res.status(404).json({ message: 'Contest not found' });
    }
    
    res.json(contest);
  } catch (error) {
    console.error('Error updating contest publish status:', error);
    res.status(500).json({ message: 'Error updating contest' });
  }
});

// Helper function to determine contest status
const getContestStatus = (startTime, endTime) => {
  if (!startTime || !endTime) return 'Draft';
  
  const now = new Date();
  if (now < startTime) return 'Upcoming';
  if (now > endTime) return 'Completed';
  return 'Active';
};

// Create contest
router.post('/contests', auth, isFaculty, async (req, res) => {
  try {
    const { title, description, startTime, duration, problems } = req.body;
    
    const contest = new Contest({
      title,
      description,
      startTime,
      duration,
      problems: problems.map(p => ({
        problem: p.problem,
        points: p.points || 100
      })),
      createdBy: req.user.id
    });

    await contest.save();
    res.status(201).json(contest);
  } catch (error) {
    console.error('Error creating contest:', error);
    res.status(500).json({ message: 'Error creating contest' });
  }
});

// Update contest
router.put('/contests/:id', auth, isFaculty, async (req, res) => {
  try {
    const { title, description, startTime, duration, problems } = req.body;
    
    // Calculate endTime based on startTime and duration
    const endTime = new Date(new Date(startTime).getTime() + (parseInt(duration) * 60000));

    const contest = await Contest.findOneAndUpdate(
      { _id: req.params.id, createdBy: req.user.id },
      {
        title,
        description,
        startTime,
        endTime,
        duration: parseInt(duration),
        problems: problems.map(p => ({
          problem: p.problem,
          points: p.points || 100
        }))
      },
      { new: true, runValidators: true }
    );

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
  if (!req.file) {
    return res.status(400).json({ message: 'No file uploaded' });
  }

  try {
    const results = [];
    const fileContent = req.file.buffer.toString();
    
    // Parse CSV content
    const rows = fileContent.split('\n').slice(1); // Skip header row
    
    for (let row of rows) {
      if (!row.trim()) continue; // Skip empty rows
      
      const [name, email, regNumber] = row.split(',').map(field => field.trim());
      
      if (!name || !email || !regNumber) continue;

      // Check if student already exists
      const existingStudent = await User.findOne({ email });
      if (existingStudent) {
        console.log(`Skipping existing student: ${email}`);
        continue;
      }

      // Use regNumber as password
      const student = new User({
        name,
        email,
        regNumber,
        password: regNumber, // Will be hashed by pre-save middleware
        role: 'student',
        addedBy: req.user.id
      });

      await student.save();
      results.push({ 
        name, 
        email, 
        regNumber,
        initialPassword: regNumber 
      });
    }

    res.json({ 
      message: 'Students imported successfully', 
      count: results.length,
      students: results
    });
  } catch (error) {
    console.error('Error importing students:', error);
    res.status(500).json({ message: 'Error importing students' });
  }
});

// Get students for faculty
router.get('/students', auth, isFaculty, async (req, res) => {
  try {
    console.log('Fetching students for faculty:', req.user.id); // Debug log
    
    const students = await User.find({ 
      addedBy: req.user.id,
      role: 'student' 
    })
    .select('-password')
    .sort({ name: 1 });

    console.log(`Found ${students.length} students`); // Debug log
    res.json(students);
  } catch (error) {
    console.error('Error fetching students:', error);
    res.status(500).json({ message: 'Error fetching students' });
  }
});

// Add student
router.post('/students', auth, isFaculty, async (req, res) => {
  try {
    const { name, email, regNumber } = req.body;
    console.log('Adding student:', { name, email, regNumber }); // Debug log

    // Check if student already exists
    const existingStudent = await User.findOne({ email });
    if (existingStudent) {
      return res.status(400).json({ 
        message: 'A user with this email already exists' 
      });
    }

    // Generate initial password
    const initialPassword = regNumber || 'user01';
    
    // Hash the password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(initialPassword, salt);

    // Create new student
    const student = new User({
      name,
      email,
      regNumber,
      password: hashedPassword,
      role: 'student',
      addedBy: req.user.id
    });

    await student.save();

    // Log success
    console.log('Student created successfully:', {
      id: student._id,
      email: student.email,
      regNumber: student.regNumber
    });

    res.status(201).json({ 
      message: `Student added successfully. Initial password: ${initialPassword}`,
      student: {
        id: student._id,
        name: student.name,
        email: student.email,
        regNumber: student.regNumber,
        initialPassword
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
        resource_type: 'auto',
        allowed_formats: ['jpg', 'png', 'pdf', 'csv'], // adjust as needed
        max_bytes: 5 * 1024 * 1024 // 5MB limit
      }
    );

    res.json({ 
      url: uploadResponse.secure_url,
      public_id: uploadResponse.public_id 
    });
  } catch (error) {
    console.error('Error uploading file:', error);
    res.status(500).json({ 
      message: 'Error uploading file',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get faculty dashboard stats
router.get('/dashboard', auth, isFaculty, async (req, res) => {
  try {
    const facultyId = req.user.id;
    const currentDate = new Date();

    // Get basic stats
    const [assignments, totalStudents, totalContests, activeContests] = await Promise.all([
      Assignment.find({ createdBy: facultyId }).select('title problems submissions').lean(),
      User.countDocuments({ addedBy: facultyId, role: 'student' }),
      Contest.countDocuments({ createdBy: facultyId }),
      Contest.countDocuments({
        createdBy: facultyId,
        startTime: { $lte: currentDate },
        $or: [
          { endTime: { $gte: currentDate } },
          { startTime: { $gte: currentDate } }
        ]
      })
    ]);

    // Process assignment stats
    const assignmentStats = assignments.map(assignment => {
      const studentsCompleted = new Set(
        (assignment.submissions || [])
          .filter(sub => sub.status === 'PASSED')
          .map(sub => sub.student.toString())
      ).size;

      return {
        _id: assignment._id,
        title: assignment.title,
        totalStudents,
        completedStudents: studentsCompleted,
        completionRate: Math.round((studentsCompleted / totalStudents) * 100)
      };
    });

    const response = {
      stats: {
        totalAssignments: assignments.length,
        totalStudents,
        totalContests,
        activeContests
      },
      assignmentStats
    };

    res.json(response);
  } catch (error) {
    console.error('Error fetching faculty dashboard:', error);
    res.status(500).json({ message: 'Error fetching dashboard statistics' });
  }
});

// Get submissions
router.get('/submissions', auth, isFaculty, async (req, res) => {
  try {
    // Get all students added by this faculty
    const studentIds = await User.find({ 
      addedBy: req.user.id,
      role: 'student' 
    }).distinct('_id');

    // Get submissions from these students only
    const submissions = await Submission.find({
      userId: { $in: studentIds },
      problemId: { 
        $in: await Problem.find({ createdBy: req.user.id }).distinct('_id')
      }
    })
    .populate('userId', 'name email')
    .populate('problemId', 'title')
    .sort('-submittedAt');

    res.json(submissions);
  } catch (error) {
    console.error('Error fetching submissions:', error);
    res.status(500).json({ message: 'Error fetching submissions' });
  }
});

// Get submission statistics
router.get('/submissions/stats', auth, isFaculty, async (req, res) => {
  try {
    const studentIds = await User.find({ 
      addedBy: req.user.id,
      role: 'student' 
    }).distinct('_id');

    const problemIds = await Problem.find({ 
      createdBy: req.user.id 
    }).distinct('_id');

    const stats = await Submission.aggregate([
      {
        $match: {
          userId: { $in: studentIds },
          problemId: { $in: problemIds }
        }
      },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    res.json(stats);
  } catch (error) {
    console.error('Error fetching submission stats:', error);
    res.status(500).json({ message: 'Error fetching submission statistics' });
  }
});

// Get recent submissions
router.get('/submissions/recent', auth, isFaculty, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 5;
    
    // Get students added by this faculty
    const studentIds = await User.find({ 
      addedBy: req.user.id,
      role: 'student' 
    }).distinct('_id');

    // Get problems created by this faculty
    const problemIds = await Problem.find({ 
      createdBy: req.user.id 
    }).distinct('_id');

    const submissions = await Submission.find({
      userId: { $in: studentIds },
      problemId: { $in: problemIds }
    })
    .populate('userId', 'name')
    .populate('problemId', 'title')
    .sort('-submittedAt')
    .limit(limit);

    res.json(submissions);
  } catch (error) {
    console.error('Error fetching recent submissions:', error);
    res.status(500).json({ message: 'Error fetching submissions' });
  }
});

// Get submission stats
router.get('/submissions/stats', auth, isFaculty, async (req, res) => {
  try {
    // Get students added by this faculty
    const studentIds = await User.find({ 
      addedBy: req.user.id,
      role: 'student' 
    }).distinct('_id');

    // Get problems created by this faculty
    const problemIds = await Problem.find({ 
      createdBy: req.user.id 
    }).distinct('_id');

    const stats = await Submission.aggregate([
      {
        $match: {
          userId: { $in: studentIds },
          problemId: { $in: problemIds }
        }
      },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    res.json(stats);
  } catch (error) {
    console.error('Error fetching submission stats:', error);
    res.status(500).json({ message: 'Error fetching submission statistics' });
  }
});

// Get single assignment
router.get('/assignments/:id', auth, isFaculty, checkOwnership(Assignment), async (req, res) => {
  res.json(req.document);
});

// Get single problem
router.get('/problems/:id', auth, isFaculty, checkOwnership(Problem), async (req, res) => {
  res.json(req.document);
});

// Reset student password
router.post('/students/:id/reset-password', auth, isFaculty, async (req, res) => {
  try {
    const student = await User.findOne({
      _id: req.params.id,
      role: 'student',
      addedBy: req.user.id
    });

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    // Reset password to regNumber or 'user01'
    const newPassword = student.regNumber || 'user01';
    student.password = newPassword;
    await student.save();

    res.json({ 
      message: 'Password reset successfully',
      initialPassword: newPassword
    });
  } catch (error) {
    console.error('Error resetting password:', error);
    res.status(500).json({ message: 'Error resetting password' });
  }
});

// Get assignments created by faculty
router.get('/assignments', auth, async (req, res) => {
  try {
    const assignments = await Assignment.find({ createdBy: req.user.id })
      .sort('-createdAt')
      .populate('problems', 'title difficulty')
      .select('title dueDate status problems createdAt');

    const formattedAssignments = assignments.map(assignment => ({
      id: assignment._id,
      title: assignment.title,
      dueDate: assignment.dueDate,
      status: new Date() > new Date(assignment.dueDate) ? 'Expired' : 'Active',
      problems: assignment.problems.length,
      createdAt: assignment.createdAt
    }));

    res.json(formattedAssignments);
  } catch (error) {
    console.error('Error fetching faculty assignments:', error);
    res.status(500).json({ message: 'Error fetching assignments' });
  }
});

// Get assignment by ID
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

// Add these new routes
router.get('/submission-stats', auth, async (req, res) => {
  try {
    const stats = await Assignment.aggregate([
      {
        $unwind: '$submissions'
      },
      {
        $group: {
          _id: '$submissions.status',
          count: { $sum: 1 }
        }
      }
    ]);
    
    res.json(stats);
  } catch (error) {
    console.error('Error fetching submission stats:', error);
    res.status(500).json({ message: 'Error fetching submission stats' });
  }
});

router.get('/problem-difficulty-stats', auth, async (req, res) => {
  try {
    const stats = await Problem.aggregate([
      {
        $group: {
          _id: '$difficulty',
          count: { $sum: 1 }
        }
      }
    ]);
    
    res.json(stats);
  } catch (error) {
    console.error('Error fetching difficulty stats:', error);
    res.status(500).json({ message: 'Error fetching difficulty stats' });
  }
});

router.get('/recent-submissions', auth, async (req, res) => {
  try {
    const recentSubmissions = await Assignment.aggregate([
      { $unwind: '$submissions' },
      { $sort: { 'submissions.submittedAt': -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: 'users',
          localField: 'submissions.student',
          foreignField: '_id',
          as: 'studentInfo'
        }
      },
      {
        $project: {
          'submissions.status': 1,
          'submissions.submittedAt': 1,
          'title': 1,
          'studentInfo.name': 1
        }
      }
    ]);
    
    res.json(recentSubmissions);
  } catch (error) {
    console.error('Error fetching recent submissions:', error);
    res.status(500).json({ message: 'Error fetching recent submissions' });
  }
});

// Get assignment submissions (faculty view)
router.get('/assignments/:id/submissions', auth, isFaculty, async (req, res) => {
  try {
    const assignment = await Assignment.findById(req.params.id)
      .populate('problems')
      .populate({
        path: 'submissions.student',
        select: 'name email'
      });

    if (!assignment) {
      return res.status(404).json({ message: 'Assignment not found' });
    }

    // Get all students in the class
    const students = await User.find({
      role: 'student',
      addedBy: req.user._id  // Only get students added by this faculty
    }).select('name email');

    // Create a map of student submissions grouped by student ID
    const submissionMap = new Map();
    assignment.submissions.forEach(sub => {
      const studentId = sub.student._id.toString();
      if (!submissionMap.has(studentId)) {
        submissionMap.set(studentId, []);
      }
      submissionMap.get(studentId).push(sub);
    });

    // Process submissions for each student
    const submissions = students.map(student => {
      const studentSubmissions = submissionMap.get(student._id.toString()) || [];
      
      // Count unique passed problems
      const uniquePassedProblems = new Set(
        studentSubmissions
          .filter(sub => sub.status === 'PASSED')
          .map(sub => sub.problemId.toString())
      );

      const problemsCompleted = uniquePassedProblems.size;
      const lastSubmission = studentSubmissions.length > 0 
        ? studentSubmissions.reduce((latest, current) => 
            new Date(current.submittedAt) > new Date(latest.submittedAt) ? current : latest
          ) 
        : null;

      return {
        student: {
          _id: student._id,
          name: student.name,
          email: student.email
        },
        status: lastSubmission ? lastSubmission.status : 'Pending',
        problemsCompleted: `${problemsCompleted} / ${assignment.problems.length}`,
        lastSubmission: lastSubmission ? lastSubmission.submittedAt : null,
        score: problemsCompleted > 0 ? Math.round((problemsCompleted / assignment.problems.length) * 100) : 0
      };
    });

    res.json(submissions);
  } catch (error) {
    console.error('Error fetching submissions:', error);
    res.status(500).json({ message: 'Error fetching submissions' });
  }
});

// Get top students for faculty dashboard
router.get('/top-students', auth, isFaculty, async (req, res) => {
  try {
    const students = await User.find({ 
      addedBy: req.user._id,
      role: 'student'
    }).lean();

    const submissions = await Submission.find({
      student: { $in: students.map(s => s._id) }
    }).lean();

    // Calculate student scores
    const studentStats = students.map(student => {
      const studentSubmissions = submissions.filter(s => s.student.toString() === student._id.toString());
      const problemsSolved = new Set(studentSubmissions.filter(s => s.status === 'PASSED').map(s => s.problemId)).size;
      const score = Math.round((problemsSolved / (studentSubmissions.length || 1)) * 100);
      
      return {
        _id: student._id,
        name: student.name,
        email: student.email,
        problemsSolved,
        score
      };
    });

    // Sort by score and problems solved
    const sortedStats = studentStats.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.problemsSolved - a.problemsSolved;
    });

    res.json(sortedStats);
  } catch (error) {
    console.error('Error fetching top students:', error);
    res.status(500).json({ message: 'Error fetching top students' });
  }
});

// Get faculty leaderboard
router.get('/leaderboard', auth, isFaculty, async (req, res) => {
  try {
    // Get all students under this faculty
    const students = await User.find({
      addedBy: req.user.id,
      role: 'student'
    }).select('name email');

    if (!students || students.length === 0) {
      return res.json([]); 
    }

    // Get all submissions for these students
    const leaderboardData = await Promise.all(
      students.map(async (student) => {
        try {
          // Get all PASSED submissions for this student
          const submissions = await Submission.find({
            student: student._id,
            status: 'PASSED'
          });

          // Count unique problems solved using Set
          const uniqueProblemsSolved = new Set(
            submissions.map(sub => sub.problemId.toString())
          ).size;

          // Count completed assignments
          const completedAssignments = await Assignment.countDocuments({
            'submissions.student': student._id,
            'submissions.status': 'PASSED'
          });

          // Calculate total points (10 points per problem, 20 points per assignment)
          const totalPoints = (uniqueProblemsSolved * 10) + (completedAssignments * 20);

          return {
            student: {
              _id: student._id,
              name: student.name,
              email: student.email
            },
            problemsSolved: uniqueProblemsSolved,
            totalPoints
          };
        } catch (error) {
          console.error(`Error processing student ${student._id}:`, error);
          return null;
        }
      })
    );

    // Filter out any null entries and sort by total points
    const sortedLeaderboard = leaderboardData
      .filter(entry => entry !== null)
      .sort((a, b) => b.totalPoints - a.totalPoints)
      .map((entry, index) => ({
        ...entry,
        rank: index + 1
      }));

    res.json(sortedLeaderboard);
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    res.status(500).json({ 
      message: 'Error fetching leaderboard',
      error: error.message 
    });
  }
});

// Update or add this route
router.get('/assignments/:id/submissions', auth, isFaculty, async (req, res) => {
  try {
    const assignmentId = req.params.id;
    
    // First get the assignment to get total problems
    const assignment = await Assignment.findById(assignmentId);
    if (!assignment) {
      return res.status(404).json({ message: 'Assignment not found' });
    }

    // Get all students assigned to this faculty
    const students = await User.find({ 
      addedBy: req.user._id,
      role: 'student'
    });

    // Get submissions for all students
    const submissions = await Promise.all(students.map(async (student) => {
      // Get all submissions for this student and assignment
      const studentSubmissions = await Submission.find({
        student: student._id,
        assignment: assignmentId
      }).sort({ submittedAt: -1 });

      // Calculate problems completed
      const problemsCompleted = new Set(
        studentSubmissions
          .filter(sub => sub.status === 'PASSED')
          .map(sub => sub.problemId.toString())
      ).size;

      // Calculate score
      const score = (problemsCompleted / assignment.problems.length) * 100;

      // Get last submission date
      const lastSubmission = studentSubmissions.length > 0 
        ? studentSubmissions[0].submittedAt 
        : null;

      return {
        student: {
          name: student.name,
          email: student.email
        },
        status: score >= 70 ? 'PASSED' : 'IN_PROGRESS',
        problemsCompleted,
        totalProblems: assignment.problems.length,
        lastSubmission,
        score: Math.round(score)
      };
    }));

    res.json(submissions);
  } catch (error) {
    console.error('Error fetching submissions:', error);
    res.status(500).json({ message: 'Error fetching submissions' });
  }
});

// Add this route for faculty dashboard
router.get('/dashboard', auth, async (req, res) => {
  try {
    const facultyId = req.user.id;

    // Get all assignments created by this faculty
    const assignments = await Assignment.find({ createdBy: facultyId })
      .select('title problems submissions')
      .lean();

    // Get total students under this faculty
    const totalStudents = await User.countDocuments({
      addedBy: facultyId,
      role: 'student'
    });

    // Process each assignment to get completion stats
    const assignmentStats = assignments.map(assignment => {
      const studentsCompleted = new Set(
        assignment.submissions
          .filter(sub => sub.status === 'PASSED')
          .map(sub => sub.student.toString())
      ).size;

      return {
        _id: assignment._id,
        title: assignment.title,
        totalStudents,
        completedStudents: studentsCompleted,
        completionRate: Math.round((studentsCompleted / totalStudents) * 100)
      };
    });

    const response = {
      totalAssignments: assignments.length,
      totalStudents,
      assignmentStats
    };

    res.json(response);
  } catch (error) {
    console.error('Error fetching faculty dashboard:', error);
    res.status(500).json({ message: 'Error fetching dashboard statistics' });
  }
});

module.exports = router;
 