const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { auth } = require('../middleware/auth');
const bcrypt = require('bcryptjs');

// Update the login endpoint
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    console.log('Login attempt for:', email);

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      console.log('User not found:', email);
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Verify password
    const isMatch = await bcrypt.compare(password, user.password);
    console.log('Password verification result:', isMatch);
    
    if (!isMatch) {
      console.log('Password mismatch for:', email);
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Generate token
    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    console.log('Login successful for:', email);
    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Error logging in' });
  }
});

// Get user profile
router.get('/profile', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching profile' });
  }
});

// Add this new route for admin registration
router.post('/register-admin', async (req, res) => {
  try {
    const { name, email, password, adminCode } = req.body;

    // Verify admin registration code (you should store this securely, perhaps in env variables)
    if (adminCode !== process.env.ADMIN_REGISTRATION_CODE) {
      return res.status(403).json({ message: 'Invalid admin registration code' });
    }

    // Check if admin already exists
    const existingAdmin = await User.findOne({ email });
    if (existingAdmin) {
      return res.status(400).json({ message: 'Email already registered' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create new admin
    const admin = new User({
      name,
      email,
      password: hashedPassword,
      role: 'admin',
      institution: req.body.institution, // Optional: Add institution name
      department: req.body.department    // Optional: Add department
    });

    await admin.save();

    res.status(201).json({
      message: 'Admin registered successfully',
      admin: {
        name: admin.name,
        email: admin.email,
        role: admin.role
      }
    });
  } catch (error) {
    console.error('Error registering admin:', error);
    res.status(500).json({ message: 'Error registering admin' });
  }
});

module.exports = router;
