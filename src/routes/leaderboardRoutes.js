const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const User = require('../models/User');

// Get student leaderboard
router.get('/students', auth, async (req, res) => {
  try {
    const students = await User.find({ role: 'student' })
      .select('name score')
      .sort('-score');

    res.json(students);
  } catch (error) {
    console.error('Error fetching student leaderboard:', error);
    res.status(500).json({ message: 'Error fetching leaderboard' });
  }
});

module.exports = router;