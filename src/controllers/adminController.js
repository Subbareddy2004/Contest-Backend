const User = require('../models/User');
const Problem = require('../models/Problem');
const Contest = require('../models/Contest');
const Assignment = require('../models/Assignment');
const bcrypt = require('bcryptjs');

// Get dashboard statistics
exports.getDashboardStats = async (req, res) => {
  try {
    const [students, faculty, programs, contests, assignments] = await Promise.all([
      User.countDocuments({ role: 'student' }),
      User.countDocuments({ role: 'faculty' }),
      Problem.countDocuments(),
      Contest.countDocuments(),
      Assignment.countDocuments()
    ]);

    // Calculate average usage time
    const users = await User.find({}, 'totalUsageTime');
    const totalTime = users.reduce((acc, user) => acc + user.totalUsageTime, 0);
    const averageUsageTime = users.length > 0 ? Math.round(totalTime / users.length) : 0;

    res.json({
      students,
      faculty,
      programs,
      contests,
      assignments,
      averageUsageTime
    });
  } catch (error) {
    console.error('Error in getDashboardStats:', error);
    res.status(500).json({ message: 'Error fetching dashboard stats' });
  }
};

// Get faculty list
exports.getFacultyList = async (req, res) => {
  try {
    const faculty = await User.find({ role: 'faculty' }, '-password');
    res.json(faculty);
  } catch (error) {
    console.error('Error in getFacultyList:', error);
    res.status(500).json({ message: 'Error fetching faculty list' });
  }
};

// Create new faculty
exports.createFaculty = async (req, res) => {
  try {
    const { name, email, password, department } = req.body;

    // Check if faculty already exists
    const existingFaculty = await User.findOne({ email });
    if (existingFaculty) {
      return res.status(400).json({ message: 'Faculty with this email already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create new faculty user
    const faculty = new User({
      name,
      email,
      password: hashedPassword,
      department,
      role: 'faculty'
    });

    await faculty.save();
    
    const facultyResponse = { ...faculty.toObject() };
    delete facultyResponse.password;
    
    res.status(201).json(facultyResponse);
  } catch (error) {
    console.error('Error in createFaculty:', error);
    res.status(500).json({ message: 'Error creating faculty member' });
  }
};

// Update faculty
exports.updateFaculty = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, department, password } = req.body;

    const updateData = { name, email, department };

    // Only update password if provided
    if (password) {
      updateData.password = await bcrypt.hash(password, 10);
    }

    const faculty = await User.findByIdAndUpdate(
      id,
      updateData,
      { new: true, select: '-password' }
    );

    if (!faculty) {
      return res.status(404).json({ message: 'Faculty not found' });
    }

    res.json(faculty);
  } catch (error) {
    console.error('Error in updateFaculty:', error);
    res.status(500).json({ message: 'Error updating faculty member' });
  }
};

// Delete faculty
exports.deleteFaculty = async (req, res) => {
  try {
    const { id } = req.params;
    const faculty = await User.findByIdAndDelete(id);

    if (!faculty) {
      return res.status(404).json({ message: 'Faculty not found' });
    }

    res.json({ message: 'Faculty deleted successfully' });
  } catch (error) {
    console.error('Error in deleteFaculty:', error);
    res.status(500).json({ message: 'Error deleting faculty member' });
  }
};

// Get students list
exports.getStudentsList = async (req, res) => {
  try {
    const students = await User.find({ role: 'student' }, '-password');
    res.json(students);
  } catch (error) {
    console.error('Error in getStudentsList:', error);
    res.status(500).json({ message: 'Error fetching students list' });
  }
};