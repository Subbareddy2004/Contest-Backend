const express = require('express');
const router = express.Router();
const Contest = require('../models/Contest');
const { auth } = require('../middleware/auth');
const { isFaculty } = require('../middleware/roleCheck');
const axios = require('axios');

// Create contest
router.post('/', auth, isFaculty, async (req, res) => {
  try {
    const formattedProblems = req.body.problems.map(p => ({
      problem: p.problemId || p.problem,
      points: Number(p.points) || 100
    }));

    const contest = new Contest({
      title: req.body.title,
      description: req.body.description,
      startTime: req.body.startTime,
      duration: Number(req.body.duration),
      problems: formattedProblems,
      createdBy: req.user.id,
      participants: []
    });

    await contest.save();
    res.status(201).json(contest);
  } catch (error) {
    console.error('Error creating contest:', error);
    res.status(500).json({ 
      message: 'Error creating contest',
      error: error.message 
    });
  }
});

// Get all contests
router.get('/', auth, async (req, res) => {
  try {
    let query = {};
    
    // Faculty sees their own contests
    if (req.user.role === 'faculty') {
      query.createdBy = req.user.id;
    } else if (req.user.role === 'student') {
      query.isPublished = true;
    }

    const contests = await Contest.find(query)
      .populate('problems.problem', 'title description')
      .populate('createdBy', 'name')
      .sort('-createdAt');
    
    res.json(contests);
  } catch (error) {
    console.error('Error fetching contests:', error);
    res.status(500).json({ message: 'Error fetching contests' });
  }
});

// Get contest by ID
router.get('/:id', auth, async (req, res) => {
  try {
    const contest = await Contest.findById(req.params.id)
      .populate('problems.problem', 'title description sampleInput sampleOutput')
      .populate('createdBy', 'name')
      .populate('participants.student', 'name');
    
    if (!contest) {
      return res.status(404).json({ message: 'Contest not found' });
    }

    // Faculty can only access their own contests
    if (req.user.role === 'faculty' && contest.createdBy._id.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Students can only access published contests
    if (req.user.role === 'student' && !contest.isPublished) {
      return res.status(403).json({ message: 'Contest not yet published' });
    }

    res.json(contest);
  } catch (error) {
    console.error('Error fetching contest:', error);
    res.status(500).json({ 
      message: 'Error fetching contest',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined 
    });
  }
});

// Start contest (for students)
router.post('/:id/start', auth, async (req, res) => {
  try {
    const contest = await Contest.findById(req.params.id);
    
    if (!contest) {
      return res.status(404).json({ message: 'Contest not found' });
    }

    // Check if contest has started
    const now = new Date();
    const startTime = new Date(contest.startTime);
    
    if (now < startTime) {
      return res.status(400).json({ message: 'Contest has not started yet' });
    }

    // Check if contest has ended
    const endTime = new Date(startTime.getTime() + contest.duration * 60000);
    if (now > endTime) {
      return res.status(400).json({ message: 'Contest has already ended' });
    }

    // Check if student is already a participant
    const existingParticipant = contest.participants.find(
      p => p.student.toString() === req.user.id
    );

    if (existingParticipant) {
      // If already participating, return success with participant data
      return res.json({ 
        message: 'Rejoined contest successfully',
        startTime: existingParticipant.startTime,
        submissions: existingParticipant.submissions,
        totalPoints: existingParticipant.totalPoints
      });
    }

    // Add new participant
    contest.participants.push({
      student: req.user.id,
      startTime: now,
      submissions: [],
      totalPoints: 0
    });

    await contest.save();
    res.json({ 
      message: 'Successfully joined contest',
      startTime: now,
      submissions: [],
      totalPoints: 0
    });
  } catch (error) {
    console.error('Error starting contest:', error);
    res.status(500).json({ message: 'Error starting contest' });
  }
});

// Submit solution for contest problem
router.post('/:id/problems/:problemId/submit', auth, async (req, res) => {
  try {
    const contest = await Contest.findById(req.params.id);
    if (!contest) {
      return res.status(404).json({ message: 'Contest not found' });
    }

    const participant = contest.participants.find(
      p => p.student.toString() === req.user.id
    );

    if (!participant) {
      return res.status(403).json({ message: 'Not participating in contest' });
    }

    // Check if contest is still ongoing
    const now = new Date();
    const endTime = new Date(participant.startTime);
    endTime.setMinutes(endTime.getMinutes() + contest.duration);

    if (now > endTime) {
      return res.status(403).json({ message: 'Contest has ended' });
    }

    // Add submission
    const problem = contest.problems.find(
      p => p.problemId.toString() === req.params.problemId
    );

    if (!problem) {
      return res.status(404).json({ message: 'Problem not found in contest' });
    }

    const submission = {
      problemId: req.params.problemId,
      status: req.body.status,
      points: req.body.status === 'PASSED' ? problem.points : 0,
      submittedAt: now
    };

    participant.submissions.push(submission);
    participant.totalPoints = participant.submissions.reduce(
      (sum, sub) => sum + (sub.points || 0), 
      0
    );

    await contest.save();
    res.json(submission);
  } catch (error) {
    res.status(500).json({ message: 'Error submitting solution' });
  }
});

// Get contest leaderboard
router.get('/:id/leaderboard', auth, async (req, res) => {
  try {
    const contest = await Contest.findById(req.params.id)
      .populate('participants.student', 'name email');

    if (!contest) {
      return res.status(404).json({ message: 'Contest not found' });
    }

    const leaderboard = contest.participants
      .map(participant => ({
        student: {
          name: participant.student.name,
          email: participant.student.email
        },
        totalPoints: participant.totalPoints,
        problemsSolved: participant.submissions.filter(s => s.status === 'PASSED').length,
        lastSubmission: participant.submissions.length > 0 
          ? participant.submissions[participant.submissions.length - 1].submittedAt
          : null
      }))
      .sort((a, b) => {
        if (b.totalPoints !== a.totalPoints) {
          return b.totalPoints - a.totalPoints;
        }
        return a.lastSubmission - b.lastSubmission;
      });

    res.json(leaderboard);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching leaderboard' });
  }
});

// Update contest
router.put('/:id', auth, isFaculty, async (req, res) => {
  try {
    const contest = await Contest.findOne({
      _id: req.params.id,
      createdBy: req.user.id
    });

    if (!contest) {
      return res.status(404).json({ message: 'Contest not found' });
    }

    // Update basic fields
    const allowedUpdates = ['title', 'description', 'startTime', 'duration', 'isPublished'];
    allowedUpdates.forEach(field => {
      if (req.body[field] !== undefined) {
        contest[field] = field === 'duration' ? Number(req.body[field]) : req.body[field];
      }
    });

    // Update problems with correct field names
    if (req.body.problems) {
      contest.problems = req.body.problems.map(p => ({
        problem: p.problemId || p.problem,
        points: Number(p.points) || 100
      }));
    }

    await contest.save();
    res.json(contest);
  } catch (error) {
    console.error('Error updating contest:', error);
    res.status(500).json({ 
      message: 'Error updating contest',
      error: error.message 
    });
  }
});

// Delete contest
router.delete('/:id', auth, isFaculty, async (req, res) => {
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

// Run code for contest problem
router.post('/:id/problems/:problemId/run', auth, async (req, res) => {
  try {
    const { code, language } = req.body;
    
    // Find the contest and problem
    const contest = await Contest.findById(req.params.id)
      .populate('problems.problem');
    
    if (!contest) {
      return res.status(404).json({ message: 'Contest not found' });
    }

    const problemData = contest.problems.find(
      p => p.problem._id.toString() === req.params.problemId
    );

    if (!problemData || !problemData.problem) {
      return res.status(404).json({ message: 'Problem not found' });
    }

    const problem = problemData.problem;
    
    const codexLanguage = {
      'cpp': 'cpp',
      'python': 'py',
      'java': 'java',
      'javascript': 'js'
    }[language];

    if (!codexLanguage) {
      return res.status(400).json({ message: 'Unsupported language' });
    }

    // Run code using Codex API
    const response = await axios.post('https://api.codex.jaagrav.in', {
      code,
      language: codexLanguage,
      input: problem.sampleInput
    });

    // Format the results
    const results = [{
      passed: response.data.output.trim() === problem.sampleOutput.trim(),
      input: problem.sampleInput,
      expected: problem.sampleOutput,
      actual: response.data.output,
      error: response.data.error,
      isHidden: false
    }];

    res.json({
      success: true,
      results,
      allPassed: results.every(r => r.passed)
    });

  } catch (error) {
    console.error('Error running code:', error);
    res.status(500).json({ message: 'Error running code' });
  }
});

// Mark problem as completed
router.post('/:id/problems/:problemId/complete', auth, async (req, res) => {
  try {
    console.log('Complete request received:', {
      contestId: req.params.id,
      problemId: req.params.problemId,
      userId: req.user.id
    });

    const contest = await Contest.findById(req.params.id);
    if (!contest) {
      return res.status(404).json({ message: 'Contest not found' });
    }

    // Find participant
    const participant = contest.participants.find(
      p => p.student.toString() === req.user.id
    );

    if (!participant) {
      return res.status(404).json({ message: 'Participant not found' });
    }

    // Find problem in contest
    const contestProblem = contest.problems.find(
      p => p.problem.toString() === req.params.problemId
    );

    if (!contestProblem) {
      return res.status(404).json({ message: 'Problem not found in contest' });
    }

    // Check if problem is already completed
    if (!participant.completedProblems.includes(req.params.problemId)) {
      // Add to completed problems
      participant.completedProblems.push(req.params.problemId);
      
      // Update total points
      participant.totalPoints = (participant.totalPoints || 0) + contestProblem.points;

      // Add submission
      participant.submissions.push({
        problem: req.params.problemId,
        code: req.body.code,
        status: 'PASSED',
        submittedAt: new Date()
      });

      // Save changes
      await contest.save();
    }

    // Populate response data
    await contest.populate([
      {
        path: 'problems.problem',
        select: 'title description sampleInput sampleOutput'
      },
      {
        path: 'participants.student',
        select: 'name email'
      }
    ]);

    console.log('Updated participant data:', {
      completedProblems: participant.completedProblems,
      totalPoints: participant.totalPoints
    });

    res.json(contest);
  } catch (error) {
    console.error('Error completing problem:', error);
    res.status(500).json({ message: 'Error completing problem' });
  }
});

// POST /contests/:contestId/problems/:problemId/complete
router.post('/:contestId/problems/:problemId/complete', auth, async (req, res) => {
  try {
    const contest = await Contest.findById(req.params.contestId);
    if (!contest) {
      return res.status(404).json({ message: 'Contest not found' });
    }

    const participant = contest.participants.find(
      p => p.student.toString() === req.user.id
    );

    if (!participant) {
      return res.status(404).json({ message: 'Participant not found' });
    }

    // Find the problem in the contest
    const contestProblem = contest.problems.find(
      p => p.problem.toString() === req.params.problemId
    );

    if (!contestProblem) {
      return res.status(404).json({ message: 'Problem not found in contest' });
    }

    // Add to completedProblems if not already completed
    if (!participant.completedProblems.includes(req.params.problemId)) {
      participant.completedProblems.push(req.params.problemId);
      participant.totalPoints += contestProblem.points;
      
      // Add submission record
      participant.submissions.push({
        problem: req.params.problemId,
        code: req.body.code,
        status: 'PASSED',
        submittedAt: new Date()
      });

      await contest.save();
    }

    // Populate the response data
    await contest.populate([
      {
        path: 'problems.problem',
        select: 'title description sampleInput sampleOutput'
      },
      {
        path: 'participants.student',
        select: 'name email'
      }
    ]);

    res.json(contest);
  } catch (error) {
    console.error('Error completing problem:', error);
    res.status(500).json({ message: 'Error completing problem' });
  }
});

module.exports = router; 