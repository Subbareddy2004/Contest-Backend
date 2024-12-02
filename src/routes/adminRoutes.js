const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const { isAdmin } = require('../middleware/admin');
const User = require('../models/User');
const Problem = require('../models/Problem');
const Assignment = require('../models/Assignment');
const Submission = require('../models/Submission');
const csv = require('csv-parser');
const { Readable } = require('stream');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const Contest = require('../models/Contest');
const mongoose = require('mongoose');
const Report = require('../models/Report');
const { sendEmail } = require('../utils/emailService');

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 1024 * 1024 * 5 // 5MB limit
  }
});

// Get admin dashboard stats
router.get('/stats', auth, isAdmin, async (req, res) => {
  try {
    const [
      totalFaculty,
      totalStudents,
      totalProblems,
      totalContests,
      totalAssignments,
      totalSubmissions
    ] = await Promise.all([
      User.countDocuments({ role: 'faculty' }),
      User.countDocuments({ role: 'student' }),
      Problem.countDocuments(),
      Contest.countDocuments(),
      Assignment.countDocuments(),
      Submission.countDocuments()
    ]);

    // Get usage statistics
    const usageStats = await Submission.aggregate([
      {
        $group: {
          _id: '$userId',
          totalSubmissions: { $sum: 1 },
          avgExecutionTime: { $avg: '$executionTime' }
        }
      }
    ]);

    res.json({
      totalFaculty,
      totalStudents,
      totalProblems,
      totalContests,
      totalAssignments,
      totalSubmissions,
      usageStats
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching stats' });
  }
});

// Get faculty list with their students count
router.get('/faculty', auth, isAdmin, async (req, res) => {
  try {
    const facultyList = await User.aggregate([
      { $match: { role: 'faculty' } },
      {
        $lookup: {
          from: 'users',
          let: { facultyId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$role', 'student'] },
                    { $eq: ['$addedBy', '$$facultyId'] }
                  ]
                }
              }
            }
          ],
          as: 'students'
        }
      },
      {
        $project: {
          _id: 1,
          name: 1,
          email: 1,
          createdAt: 1,
          studentCount: { $size: '$students' },
          totalProblems: '$problemsCreated',
          totalContests: '$contestsCreated'
        }
      }
    ]);

    res.json(facultyList);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching faculty list' });
  }
});

// Add faculty
router.post('/faculty', auth, isAdmin, async (req, res) => {
  try {
    const { name, email, password } = req.body;
    
    // Check if faculty already exists
    const existingFaculty = await User.findOne({ email });
    if (existingFaculty) {
      return res.status(400).json({ message: 'Faculty with this email already exists' });
    }

    // Create new faculty with empty initial data
    const faculty = new User({
      name,
      email,
      password,
      role: 'faculty',
      addedBy: req.user.id, // Reference to admin who created this faculty
      createdAt: new Date(),
      // Initialize with empty arrays/counts
      studentCount: 0,
      problemCount: 0,
      contestCount: 0,
      assignmentCount: 0
    });

    await faculty.save();

    // Return the created faculty without password
    const facultyData = faculty.toObject();
    delete facultyData.password;

    res.status(201).json({
      message: 'Faculty added successfully',
      faculty: facultyData
    });
  } catch (error) {
    console.error('Error adding faculty:', error);
    res.status(500).json({ 
      message: 'Error adding faculty',
      error: error.message 
    });
  }
});

// Get faculty details with their students
router.get('/faculty/:id', auth, isAdmin, async (req, res) => {
  try {
    const faculty = await User.findById(req.params.id).select('-password');
    const students = await User.find({ addedBy: req.params.id, role: 'student' });
    const problems = await Problem.find({ createdBy: req.params.id });
    const contests = await Contest.find({ createdBy: req.params.id });

    res.json({
      faculty,
      statistics: {
        studentCount: students.length,
        problemCount: problems.length,
        contestCount: contests.length
      },
      students,
      recentProblems: problems.slice(-5),
      recentContests: contests.slice(-5)
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching faculty details' });
  }
});

// Get platform usage analytics
router.get('/analytics', auth, isAdmin, async (req, res) => {
  try {
    const analytics = await Submission.aggregate([
      {
        $group: {
          _id: {
            userId: '$userId',
            date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }
          },
          totalTime: { $sum: '$executionTime' },
          submissions: { $sum: 1 }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id.userId',
          foreignField: '_id',
          as: 'user'
        }
      },
      {
        $unwind: '$user'
      },
      {
        $project: {
          date: '$_id.date',
          userRole: '$user.role',
          totalTime: 1,
          submissions: 1
        }
      }
    ]);

    res.json(analytics);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching analytics' });
  }
});

// Get faculty statistics
router.get('/faculty/:id/stats', auth, isAdmin, async (req, res) => {
  try {
    const facultyId = req.params.id;
    const faculty = await User.findById(facultyId);
    
    if (!faculty || faculty.role !== 'faculty') {
      return res.status(404).json({ message: 'Faculty not found' });
    }

    const [
      students,
      problems,
      contests,
      assignments,
      submissions
    ] = await Promise.all([
      User.find({ addedBy: facultyId, role: 'student' }).select('-password'),
      Problem.countDocuments({ createdBy: facultyId }),
      Contest.countDocuments({ createdBy: facultyId }),
      Assignment.countDocuments({ createdBy: facultyId }),
      Submission.countDocuments({ 
        userId: { 
          $in: await User.find({ addedBy: facultyId }).distinct('_id') 
        }
      })
    ]);

    res.json({
      faculty: {
        name: faculty.name,
        email: faculty.email,
        createdAt: faculty.createdAt
      },
      stats: {
        studentCount: students.length,
        problemCount: problems,
        contestCount: contests,
        assignmentCount: assignments,
        submissionCount: submissions
      },
      students
    });
  } catch (error) {
    console.error('Error fetching faculty stats:', error);
    res.status(500).json({ message: 'Error fetching faculty statistics' });
  }
});

// Import faculty from CSV
router.post('/faculty/import', auth, isAdmin, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const results = [];
    const stream = Readable.from(req.file.buffer.toString());

    await new Promise((resolve, reject) => {
      stream
        .pipe(csv())
        .on('data', (data) => results.push(data))
        .on('end', resolve)
        .on('error', reject);
    });

    const importedFaculty = [];
    
    for (const row of results) {
      const password = Math.random().toString(36).slice(-8);
      const hashedPassword = await bcrypt.hash(password, 10);

      const faculty = new User({
        name: row.name,
        email: row.email,
        department: row.department,
        password: hashedPassword,
        role: 'faculty'
      });

      await faculty.save();
      
      importedFaculty.push({
        name: faculty.name,
        email: faculty.email,
        initialPassword: password
      });
    }

    res.json({
      message: 'Faculty imported successfully',
      count: importedFaculty.length,
      faculty: importedFaculty
    });
  } catch (error) {
    console.error('Error importing faculty:', error);
    res.status(500).json({ message: 'Error importing faculty' });
  }
});

// Get students grouped by faculty
router.get('/students-by-faculty', auth, isAdmin, async (req, res) => {
  try {
    const facultyWithStudents = await User.aggregate([
      {
        $match: { role: 'faculty' }
      },
      {
        $lookup: {
          from: 'users',
          let: { facultyId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$role', 'student'] },
                    { $eq: ['$addedBy', '$$facultyId'] }
                  ]
                }
              }
            }
          ],
          as: 'students'
        }
      },
      {
        $project: {
          _id: 1,
          name: 1,
          email: 1,
          studentCount: { $size: '$students' },
          students: {
            $map: {
              input: '$students',
              as: 'student',
              in: {
                _id: '$$student._id',
                name: '$$student.name',
                email: '$$student.email',
                createdAt: '$$student.createdAt'
              }
            }
          }
        }
      }
    ]);

    res.json(facultyWithStudents);
  } catch (error) {
    console.error('Error fetching students by faculty:', error);
    res.status(500).json({ message: 'Error fetching students by faculty' });
  }
});

// Get all students grouped by faculty
router.get('/faculty-students', auth, isAdmin, async (req, res) => {
  try {
    const facultyWithStudents = await User.aggregate([
      {
        $match: { role: 'faculty' }
      },
      {
        $lookup: {
          from: 'users',
          let: { facultyId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$role', 'student'] },
                    { $eq: ['$addedBy', '$$facultyId'] }
                  ]
                }
              }
            },
            {
              $project: {
                _id: 1,
                name: 1,
                email: 1,
                regNumber: 1,
                createdAt: 1
              }
            }
          ],
          as: 'students'
        }
      },
      {
        $project: {
          _id: 1,
          name: 1,
          email: 1,
          studentCount: { $size: '$students' },
          students: 1
        }
      }
    ]);

    res.json(facultyWithStudents);
  } catch (error) {
    console.error('Error fetching faculty students:', error);
    res.status(500).json({ message: 'Error fetching faculty students' });
  }
});

// Add this route after the faculty routes
router.delete('/faculty/:id', auth, isAdmin, async (req, res) => {
  try {
    const faculty = await User.findById(req.params.id);
    
    if (!faculty) {
      return res.status(404).json({ message: 'Faculty not found' });
    }

    if (faculty.role !== 'faculty') {
      return res.status(400).json({ message: 'User is not a faculty member' });
    }

    // Delete the faculty member
    await User.findByIdAndDelete(req.params.id);

    res.json({ message: 'Faculty deleted successfully' });
  } catch (error) {
    console.error('Error deleting faculty:', error);
    res.status(500).json({ message: 'Error deleting faculty' });
  }
});

// Add this route for updating faculty details
router.put('/faculty/:id', auth, isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, password } = req.body;

    // Find faculty and verify they exist
    const faculty = await User.findById(id);
    if (!faculty) {
      return res.status(404).json({ message: 'Faculty not found' });
    }

    if (faculty.role !== 'faculty') {
      return res.status(400).json({ message: 'User is not a faculty member' });
    }

    // Check if email is being changed and if it's already in use
    if (email !== faculty.email) {
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(400).json({ message: 'Email already in use' });
      }
    }

    // Prepare update object
    const updateData = { name, email };
    
    // Only hash and update password if one is provided
    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      updateData.password = hashedPassword;
    }

    // Update faculty details
    const updatedFaculty = await User.findByIdAndUpdate(
      id,
      updateData,
      { new: true, select: '-password' } // Return updated document without password
    );

    res.json({
      message: 'Faculty updated successfully',
      faculty: updatedFaculty
    });

  } catch (error) {
    console.error('Error updating faculty:', error);
    res.status(500).json({ message: 'Error updating faculty' });
  }
});

// Update the dashboard route handler
router.get('/dashboard', auth, isAdmin, async (req, res) => {
  try {
    const timeRange = req.query.timeRange || '1w';
    let startDate = new Date();

    // Calculate start date based on time range
    switch (timeRange) {
      case '24h':
        startDate.setHours(startDate.getHours() - 24);
        break;
      case '1w':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case '1m':
        startDate.setMonth(startDate.getMonth() - 1);
        break;
      case '3m':
        startDate.setMonth(startDate.getMonth() - 3);
        break;
      case '6m':
        startDate.setMonth(startDate.getMonth() - 6);
        break;
      case '1y':
        startDate.setFullYear(startDate.getFullYear() - 1);
        break;
      case 'all':
        startDate = new Date(0); // Beginning of time
        break;
      default:
        startDate.setDate(startDate.getDate() - 7);
    }

    // Get submission statistics
    const submissionStats = await Submission.aggregate([
      {
        $match: {
          submittedAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { 
              format: timeRange === '24h' ? '%H:00' : '%Y-%m-%d',
              date: '$submittedAt'
            }
          },
          submissions: { $sum: 1 }
        }
      },
      {
        $sort: { '_id': 1 }
      },
      {
        $project: {
          _id: 0,
          date: '$_id',
          submissions: 1
        }
      }
    ]);

    // Get overall statistics
    const [
      totalStudents,
      totalFaculty,
      totalProblems,
      totalContests,
      totalAssignments,
      totalSubmissions
    ] = await Promise.all([
      User.countDocuments({ role: 'student' }),
      User.countDocuments({ role: 'faculty' }),
      Problem.countDocuments(),
      Contest.countDocuments(),
      Assignment.countDocuments(),
      Submission.countDocuments()
    ]);

    res.json({
      stats: {
        totalStudents,
        totalFaculty,
        totalProblems,
        totalContests,
        totalAssignments,
        totalSubmissions
      },
      submissionStats
    });

  } catch (error) {
    console.error('Error fetching admin dashboard stats:', error);
    res.status(500).json({ message: 'Error fetching dashboard statistics' });
  }
});

// Create faculty with initial students
router.post('/faculty/create', auth, isAdmin, async (req, res) => {
  try {
    const { name, email, password, students } = req.body;
    
    // Create faculty user
    const faculty = new User({
      name,
      email,
      password,
      role: 'faculty'
    });
    await faculty.save();

    // Handle students if provided
    if (students && students.length > 0) {
      const studentUsers = await Promise.all(students.map(async (student) => {
        const studentUser = new User({
          name: student.name,
          email: student.email,
          password: student.password || 'defaultPassword123', // You might want to generate random passwords
          role: 'student',
          assignedFaculty: faculty._id
        });
        await studentUser.save();
        return studentUser;
      }));
    }

    res.status(201).json({ message: 'Faculty created successfully', faculty });
  } catch (error) {
    console.error('Error creating faculty:', error);
    res.status(500).json({ message: 'Error creating faculty' });
  }
});

// Bulk upload students route
router.post('/faculty/:facultyId/students/bulk', auth, isAdmin, async (req, res) => {
  try {
    const { facultyId } = req.params;
    
    // Log request details
    console.log('Bulk upload request:', {
      files: req.files,
      facultyId: facultyId
    });

    // Verify faculty exists
    const faculty = await User.findOne({ _id: facultyId, role: 'faculty' });
    if (!faculty) {
      console.log('Faculty not found:', facultyId);
      return res.status(404).json({ message: 'Faculty not found' });
    }

    // Check if file exists
    if (!req.files || !req.files.file) {
      console.log('No file in request:', req.files);
      return res.status(400).json({ 
        message: 'No file uploaded',
        details: 'Please ensure you are sending a file with the key "file"'
      });
    }

    const file = req.files.file;
    
    // Log file details
    console.log('File details:', {
      name: file.name,
      size: file.size,
      mimetype: file.mimetype
    });

    // Verify file type
    if (!file.name.endsWith('.csv')) {
      return res.status(400).json({ 
        message: 'Invalid file type',
        details: 'Please upload a CSV file'
      });
    }

    const csvString = file.data.toString();
    const rows = csvString.split('\n');

    console.log('CSV Processing:', {
      totalRows: rows.length,
      firstRow: rows[0],
      sampleData: rows.slice(0, 2)
    });

    const students = [];
    const errors = [];

    // Skip header row if it exists
    const dataRows = rows[0].toLowerCase().includes('name') ? rows.slice(1) : rows;

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i].trim();
      if (!row) continue; // Skip empty rows
      
      const [name, regNumber, email] = row.split(',').map(field => field.trim());
      
      console.log(`Processing row ${i + 1}:`, { name, regNumber, email });

      if (!name || !regNumber || !email) {
        errors.push(`Row ${i + 1}: Missing required fields. Found: name=${name}, regNumber=${regNumber}, email=${email}`);
        continue;
      }

      try {
        // Check for existing student
        const existingStudent = await User.findOne({
          $or: [
            { email },
            { regNumber },
            { registerNumber: regNumber }
          ],
          role: 'student'
        });

        if (existingStudent) {
          errors.push(`Row ${i + 1}: Student with email ${email} or registration number ${regNumber} already exists`);
          continue;
        }

        const student = new User({
          name,
          email,
          regNumber,
          registerNumber: regNumber,
          addedBy: facultyId,
          assignedFaculty: facultyId,
          role: 'student',
          password: regNumber
        });

        await student.save();
        students.push(student);
        console.log(`Successfully added student from row ${i + 1}:`, {
          name: student.name,
          email: student.email,
          regNumber: student.regNumber
        });

      } catch (error) {
        console.error(`Error processing row ${i + 1}:`, error);
        errors.push(`Row ${i + 1}: ${error.message}`);
      }
    }

    console.log('Bulk upload complete:', {
      totalProcessed: dataRows.length,
      successCount: students.length,
      errorCount: errors.length,
      errors: errors
    });

    if (errors.length > 0) {
      return res.status(400).json({
        message: 'Some students could not be imported',
        errors,
        successCount: students.length,
        details: 'Check the errors array for specific issues with each row'
      });
    }

    res.json({
      message: 'Students imported successfully',
      count: students.length,
      students: students.map(s => ({
        name: s.name,
        email: s.email,
        regNumber: s.regNumber
      }))
    });

  } catch (error) {
    console.error('Fatal error in bulk upload:', error);
    res.status(500).json({ 
      message: 'Error uploading students',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Get students for a specific faculty
router.get('/faculty/:facultyId/students', auth, isAdmin, async (req, res) => {
  try {
    const { facultyId } = req.params;
    console.log('Fetching students for faculty:', facultyId);
    
    // Verify faculty exists
    const faculty = await User.findOne({ _id: facultyId, role: 'faculty' });
    if (!faculty) {
      console.log('Faculty not found:', facultyId);
      return res.status(404).json({ message: 'Faculty not found' });
    }
    console.log('Found faculty:', faculty.name);

    // Find all students assigned to this faculty
    const students = await User.find({ 
      addedBy: facultyId,
      role: 'student'
    }).select('name email regNumber createdAt');

    console.log('Query results:', {
      facultyId,
      studentsFound: students.length,
      students: students
    });

    res.json(students);
  } catch (error) {
    console.error('Error fetching faculty students:', error);
    res.status(500).json({ message: 'Error fetching students' });
  }
});

// Add student route
router.post('/faculty/:facultyId/students', auth, isAdmin, async (req, res) => {
  try {
    const { facultyId } = req.params;
    const { name, email, regNumber } = req.body;

    console.log('Creating student with data:', {
      facultyId,
      name,
      email,
      regNumber
    });

    // Verify faculty exists
    const faculty = await User.findOne({ _id: facultyId, role: 'faculty' });
    if (!faculty) {
      return res.status(404).json({ message: 'Faculty not found' });
    }

    // Check if student with same email or regNumber already exists
    const existingStudent = await User.findOne({
      $or: [
        { email }, 
        { regNumber }, 
        { registerNumber: regNumber }
      ],
      role: 'student'
    });

    if (existingStudent) {
      return res.status(400).json({ 
        message: 'Student with this email or registration number already exists' 
      });
    }

    // Create the student with both field names for compatibility
    const student = new User({
      name,
      email,
      regNumber,
      registerNumber: regNumber,  // Set both fields
      addedBy: facultyId,
      assignedFaculty: facultyId, // Set both fields
      role: 'student',
      password: regNumber // Initial password is the registration number
    });

    await student.save();
    console.log('Created student:', student);

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
    console.error('Error creating student:', error);
    res.status(500).json({ 
      message: 'Error creating student',
      error: error.message 
    });
  }
});

// Debug route to check all users
router.get('/debug/users', auth, isAdmin, async (req, res) => {
  try {
    const users = await User.find({}).select('-password');
    res.json({
      total: users.length,
      faculty: users.filter(u => u.role === 'faculty'),
      students: users.filter(u => u.role === 'student')
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching users' });
  }
});

// Debug route to check faculty and their students
router.get('/debug/faculty-students/:facultyId', auth, isAdmin, async (req, res) => {
  try {
    const { facultyId } = req.params;
    
    // Find faculty
    const faculty = await User.findById(facultyId);
    if (!faculty) {
      return res.status(404).json({ message: 'Faculty not found' });
    }

    // Find all students in the database
    const allStudents = await User.find({ role: 'student' });
    
    // Find students assigned to this faculty
    const assignedStudents = await User.find({ 
      addedBy: facultyId,
      role: 'student'
    });

    res.json({
      faculty: {
        _id: faculty._id,
        name: faculty.name,
        email: faculty.email
      },
      totalStudents: allStudents.length,
      assignedStudents: assignedStudents,
      studentsWithFacultyId: allStudents.filter(s => s.addedBy?.toString() === facultyId)
    });
  } catch (error) {
    console.error('Debug route error:', error);
    res.status(500).json({ message: 'Error in debug route' });
  }
});

// Update student route
router.put('/faculty/:facultyId/students/:studentId', auth, isAdmin, async (req, res) => {
  try {
    const { facultyId, studentId } = req.params;
    const { name, email, regNumber } = req.body;

    console.log('Updating student:', {
      facultyId,
      studentId,
      updateData: { name, email, regNumber }
    });

    // Verify faculty exists
    const faculty = await User.findOne({ _id: facultyId, role: 'faculty' });
    if (!faculty) {
      return res.status(404).json({ message: 'Faculty not found' });
    }

    // Find and update the student
    const student = await User.findOneAndUpdate(
      { 
        _id: studentId,
        addedBy: facultyId,
        role: 'student'
      },
      { 
        name,
        email,
        regNumber
      },
      { new: true }
    );

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    console.log('Updated student:', student);

    res.json({
      message: 'Student updated successfully',
      student: {
        _id: student._id,
        name: student.name,
        email: student.email,
        regNumber: student.regNumber
      }
    });
  } catch (error) {
    console.error('Error updating student:', error);
    res.status(500).json({ message: 'Error updating student' });
  }
});

// Delete student route
router.delete('/faculty/:facultyId/students/:studentId', auth, isAdmin, async (req, res) => {
  try {
    const { facultyId, studentId } = req.params;

    // Verify faculty exists
    const faculty = await User.findOne({ _id: facultyId, role: 'faculty' });
    if (!faculty) {
      return res.status(404).json({ message: 'Faculty not found' });
    }

    // Find and delete the student
    const student = await User.findOneAndDelete({
      _id: studentId,
      addedBy: facultyId,
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

// Add these routes to handle admin contests
router.get('/contests', auth, isAdmin, async (req, res) => {
  try {
    const contests = await Contest.find({ isAdminContest: true })
      .populate('problems')
      .sort({ createdAt: -1 });
    res.json(contests);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching contests' });
  }
});

router.post('/contests', auth, isAdmin, async (req, res) => {
  try {
    const contest = new Contest({
      ...req.body,
      isAdminContest: true,
      createdBy: req.user.id
    });
    await contest.save();
    res.status(201).json(contest);
  } catch (error) {
    res.status(500).json({ message: 'Error creating contest' });
  }
});

router.put('/contests/:id', auth, isAdmin, async (req, res) => {
  try {
    const contest = await Contest.findOneAndUpdate(
      { _id: req.params.id, isAdminContest: true },
      req.body,
      { new: true }
    );
    if (!contest) {
      return res.status(404).json({ message: 'Contest not found' });
    }
    res.json(contest);
  } catch (error) {
    res.status(500).json({ message: 'Error updating contest' });
  }
});

router.delete('/contests/:id', auth, isAdmin, async (req, res) => {
  try {
    const contest = await Contest.findOneAndDelete({
      _id: req.params.id,
      isAdminContest: true
    });
    if (!contest) {
      return res.status(404).json({ message: 'Contest not found' });
    }
    res.json({ message: 'Contest deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting contest' });
  }
});

// Get all reports
router.get('/reports', auth, isAdmin, async (req, res) => {
  try {
    const reports = await Report.find()
      .populate('student', 'name email')
      .sort('-createdAt');
    res.json(reports);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching reports' });
  }
});

// Update report status
router.patch('/reports/:id', auth, isAdmin, async (req, res) => {
  try {
    const report = await Report.findByIdAndUpdate(
      req.params.id,
      { status: req.body.status },
      { new: true }
    );
    res.json(report);
  } catch (error) {
    res.status(500).json({ message: 'Error updating report' });
  }
});

module.exports = router; 