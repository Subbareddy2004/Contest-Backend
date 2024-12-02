const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const { isAdmin } = require('../middleware/admin');
const Contest = require('../models/Contest');

// Get all admin contests
router.get('/', auth, isAdmin, async (req, res) => {
  try {
    const contests = await Contest.find({ createdBy: req.user.id, isAdminContest: true })
      .populate('problems.problem')
      .sort({ createdAt: -1 });
    res.json(contests);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching contests' });
  }
});

// Create admin contest
router.post('/', auth, isAdmin, async (req, res) => {
  try {
    const contest = new Contest({
      ...req.body,
      createdBy: req.user.id,
      isAdminContest: true
    });
    await contest.save();
    res.status(201).json(contest);
  } catch (error) {
    res.status(500).json({ message: 'Error creating contest' });
  }
});

// Update admin contest
router.put('/:id', auth, isAdmin, async (req, res) => {
  try {
    const contest = await Contest.findOneAndUpdate(
      { _id: req.params.id, createdBy: req.user.id, isAdminContest: true },
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

// Delete admin contest
router.delete('/:id', auth, isAdmin, async (req, res) => {
  try {
    const contest = await Contest.findOneAndDelete({
      _id: req.params.id,
      createdBy: req.user.id,
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

module.exports = router; 