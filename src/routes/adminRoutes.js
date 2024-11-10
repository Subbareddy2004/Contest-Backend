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

module.exports = router; 