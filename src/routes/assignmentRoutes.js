const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const { isFaculty } = require('../middleware/facultyAuth');
const Assignment = require('../models/Assignment');

// Get all assignments for students
router.get('/', auth, async (req, res) => {
  try {
    const assignments = await Assignment.find()
      .populate('problems', 'title')
      .populate('createdBy', 'name')
      .sort('-createdAt');
    res.json(assignments);
  } catch (error) {
    console.error('Error fetching assignments:', error);
    res.status(500).json({ message: 'Error fetching assignments' });
  }
});

// Get assignment submissions
router.get('/:id/submissions', auth, isFaculty, async (req, res) => {
  try {
    const assignment = await Assignment.findById(req.params.id)
      .populate({
        path: 'submissions.student',
        select: 'name email regNumber'
      });
    
    if (!assignment) {
      return res.status(404).json({ message: 'Assignment not found' });
    }

    // Check if faculty member is the creator of the assignment
    if (assignment.createdBy.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized to view these submissions' });
    }

    res.json(assignment.submissions);
  } catch (error) {
    console.error('Error fetching assignment submissions:', error);
    res.status(500).json({ message: 'Error fetching submissions' });
  }
});

// Submit assignment (for students)
router.post('/:id/submit', auth, async (req, res) => {
  try {
    const { code, language } = req.body;
    const assignment = await Assignment.findById(req.params.id);

    if (!assignment) {
      return res.status(404).json({ message: 'Assignment not found' });
    }

    // Check if past due date
    if (new Date() > assignment.dueDate) {
      return res.status(400).json({ message: 'Assignment submission deadline has passed' });
    }

    // Check if student has already submitted
    const existingSubmission = assignment.submissions.find(
      sub => sub.student.toString() === req.user.id
    );

    if (existingSubmission) {
      // Update existing submission
      existingSubmission.code = code;
      existingSubmission.language = language;
      existingSubmission.submittedAt = new Date();
      existingSubmission.status = 'Pending';
    } else {
      // Add new submission
      assignment.submissions.push({
        student: req.user.id,
        code,
        language
      });
    }

    await assignment.save();
    res.json({ message: 'Assignment submitted successfully' });
  } catch (error) {
    console.error('Error submitting assignment:', error);
    res.status(500).json({ message: 'Error submitting assignment' });
  }
});

module.exports = router;