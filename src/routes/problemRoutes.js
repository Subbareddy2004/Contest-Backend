const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const { isFaculty } = require('../middleware/faculty');
const Problem = require('../models/Problem');

// Get all problems (public route)
router.get('/', async (req, res) => {
  try {
    const problems = await Problem.find()
      .select('-testCases')  // Exclude sensitive test cases
      .populate('createdBy', 'name')  // Include creator's name
      .sort('-createdAt');  // Sort by newest first
    res.json(problems);
  } catch (error) {
    console.error('Error fetching problems:', error);
    res.status(500).json({ message: 'Error fetching problems' });
  }
});

// Get a single problem
router.get('/:id', auth, async (req, res) => {
  try {
    const problem = await Problem.findById(req.params.id);
    if (!problem) {
      return res.status(404).json({ message: 'Problem not found' });
    }
    res.json(problem);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching problem' });
  }
});

// Create a new problem (faculty only)
router.post('/', auth, isFaculty, async (req, res) => {
  try {
    const problem = new Problem(req.body);
    await problem.save();
    res.status(201).json(problem);
  } catch (error) {
    res.status(500).json({ message: 'Error creating problem' });
  }
});

// Update a problem (faculty only)
router.put('/:id', auth, isFaculty, async (req, res) => {
  try {
    const problem = await Problem.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );
    if (!problem) {
      return res.status(404).json({ message: 'Problem not found' });
    }
    res.json(problem);
  } catch (error) {
    res.status(500).json({ message: 'Error updating problem' });
  }
});

// Delete a problem (faculty only)
router.delete('/:id', auth, isFaculty, async (req, res) => {
  try {
    const problem = await Problem.findByIdAndDelete(req.params.id);
    if (!problem) {
      return res.status(404).json({ message: 'Problem not found' });
    }
    res.json({ message: 'Problem deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting problem' });
  }
});

// Get all problems (for faculty)
router.get('/faculty/problems', auth, async (req, res) => {
  try {
    const problems = await Problem.find()
      .select('title difficulty points')
      .sort('-createdAt')
      .lean();

    res.json(problems);
  } catch (error) {
    console.error('Error fetching problems:', error);
    res.status(500).json({ message: 'Error fetching problems' });
  }
});

module.exports = router;
