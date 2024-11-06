const express = require('express');
const router = express.Router();
const Contest = require('../models/Contest');
const { auth } = require('../middleware/auth');
const { isStudent, isFaculty } = require('../middleware/roleCheck');
const mongoose = require('mongoose');
const { runCode, getCodexLanguage, LANGUAGE_CONFIG } = require('../utils/codeRunner');
const axios = require('axios');

// Student Routes
// GET /api/student/contests - Get all contests for students
router.get('/student/contests', auth, isStudent, async (req, res) => {
  try {
    const contests = await Contest.find({ isPublished: true })
      .populate('problems.problem', 'title')
      .populate('registeredStudents.student', '_id')
      .lean();
    
    const now = new Date();
    const contestsWithStatus = contests.map(contest => {
      const startTime = new Date(contest.startTime);
      const endTime = new Date(startTime.getTime() + contest.duration * 60000);
      
      const registration = contest.registeredStudents?.find(
        reg => reg.student?._id.toString() === req.user._id.toString()
      );

      let status;
      if (now < startTime) {
        status = 'Upcoming';
      } else if (now > endTime) {
        status = 'Completed';
      } else {
        status = 'Active';
      }

      const timeRemaining = formatDuration(Math.max(0, endTime - now));

      return {
        ...contest,
        status,
        timeRemaining,
        duration: `${contest.duration} minutes`,
        isRegistered: !!registration,
        hasStarted: !!registration?.startedAt,
        canStart: status === 'Active' && !!registration && !registration.startedAt
      };
    });

    res.json(contestsWithStatus);
  } catch (error) {
    console.error('Error fetching contests:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

function formatDuration(ms) {
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((ms % (1000 * 60)) / 1000);
  return `${hours}h ${minutes}m ${seconds}s`;
}

// POST /api/student/contests/:id/register
router.post('/student/contests/:id/register', auth, isStudent, async (req, res) => {
  try {
    const userId = req.user._id;
    const contestId = req.params.id;

    const contest = await Contest.findById(contestId);
    if (!contest) {
      return res.status(404).json({ message: 'Contest not found' });
    }

    // Check if already registered
    const isRegistered = contest.registeredStudents?.some(
      p => p?.student?.toString() === userId?.toString()
    );

    if (isRegistered) {
      return res.status(400).json({ message: 'Already registered for this contest' });
    }

    // Add to registered students
    contest.registeredStudents.push({
      student: userId,
      startedAt: null,
      submissions: []
    });

    await contest.save();
    res.json({ message: 'Successfully registered for contest' });
  } catch (error) {
    console.error('Error registering for contest:', error);
    res.status(500).json({ 
      error: 'Failed to register for contest',
      details: error.message 
    });
  }
});

router.post('/student/contests/:id/start', auth, isStudent, async (req, res) => {
  try {
    const userId = req.user._id;
    const contestId = req.params.id;

    const contest = await Contest.findById(contestId);
    if (!contest) {
      return res.status(404).json({ message: 'Contest not found' });
    }

    // Find the participant
    const participant = contest.registeredStudents?.find(
      p => p?.student?.toString() === userId?.toString()
    );

    if (!participant) {
      return res.status(400).json({ message: 'Not registered for this contest' });
    }

    if (participant.startedAt) {
      return res.status(400).json({ message: 'Contest already started' });
    }

    // Set start time
    participant.startedAt = new Date();
    await contest.save();

    res.json({ message: 'Contest started successfully', startTime: participant.startedAt });
  } catch (error) {
    console.error('Error starting contest:', error);
    res.status(500).json({ 
      error: 'Failed to start contest',
      details: error.message 
    });
  }
});

router.get('/student/contests/:id/details', auth, isStudent, async (req, res) => {
  try {
    const contest = await Contest.findById(req.params.id)
      .populate('problems.problem', 'title description')
      .lean();
    
    if (!contest) {
      return res.status(404).json({ message: 'Contest not found' });
    }

    // Check if contest is published
    if (!contest.isPublished) {
      return res.status(403).json({ message: 'Contest is not published' });
    }

    // Find registration
    const registration = contest.registeredStudents?.find(reg => 
      reg.student?.toString() === req.user._id.toString()
    );

    if (!registration) {
      return res.status(403).json({ 
        message: 'Not registered for this contest',
        isRegistered: false 
      });
    }

    const now = new Date();
    const startTime = new Date(contest.startTime);
    const endTime = new Date(startTime.getTime() + contest.duration * 60000);

    // Calculate remaining time
    let timeRemaining;
    if (registration.startedAt) {
      const endAt = new Date(registration.startedAt.getTime() + contest.duration * 60000);
      timeRemaining = Math.max(0, endAt - now);
    } else {
      timeRemaining = Math.max(0, endTime - now);
    }

    res.json({
      _id: contest._id,
      title: contest.title,
      duration: contest.duration,
      startTime: contest.startTime,
      timeRemaining,
      hasStarted: !!registration.startedAt,
      isRegistered: true,
      problems: contest.problems.map(p => ({
        _id: p.problem._id,
        title: p.problem.title,
        description: p.problem.description,
        points: p.points
      }))
    });
  } catch (error) {
    console.error('Error fetching contest details:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/student/contests/:id
router.get('/student/contests/:id', auth, isStudent, async (req, res) => {
  try {
    const contest = await Contest.findById(req.params.id);
    if (!contest) {
      return res.status(404).json({ error: 'Contest not found' });
    }

    // Check if student is already participating
    const isParticipating = contest.activeParticipants?.some(
      p => p.student && p.student.equals(req.user._id)
    );
    
    if (isParticipating) {
      return res.json({ 
        contest,
        isRegistered: true,
        message: 'Already participating'
      });
    }

    // If contest hasn't started, allow registration
    const now = new Date();
    const startTime = new Date(contest.startTime);
    if (now < startTime) {
      return res.status(403).json({ 
        error: 'Contest has not started yet',
        startTime: contest.startTime
      });
    }

    // If contest has ended, don't allow new participants
    const endTime = new Date(startTime.getTime() + contest.duration * 60000);
    if (now > endTime) {
      return res.status(403).json({ error: 'Contest has ended' });
    }

    res.json({ 
      contest,
      isRegistered: false,
      message: 'Contest is active'
    });

  } catch (error) {
    console.error('Error fetching contest:', error);
    res.status(500).json({ error: error.message });
  }
});

// Faculty Routes
router.get('/faculty', auth, isFaculty, async (req, res) => {
  try {
    const contests = await Contest.find({ createdBy: req.user._id })
      .populate('problems.problem', 'title');
    res.json(contests);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/student/contests/:id/end
router.post('/student/contests/:id/end', auth, isStudent, async (req, res) => {
  try {
    const contest = await Contest.findById(req.params.id);
    if (!contest) {
      return res.status(404).json({ message: 'Contest not found' });
    }

    const participant = contest.activeParticipants.find(
      p => p.student && p.student.equals(req.user._id)
    );

    if (!participant) {
      return res.status(400).json({ message: 'You have not started this contest' });
    }

    participant.endedAt = new Date();
    await contest.save();

    res.json({ message: 'Contest submitted successfully' });
  } catch (error) {
    console.error('Error ending contest:', error);
    res.status(500).json({ message: 'Error submitting contest' });
  }
});

// GET /api/student/contests/:id/state
router.get('/student/contests/:id/state', auth, isStudent, async (req, res) => {
  try {
    const userId = req.user._id;
    const contestId = req.params.id;

    // Add logging to debug
    console.log('Fetching contest state for:', { userId, contestId });

    const contest = await Contest.findById(contestId)
      .populate('problems.problem')
      .populate({
        path: 'registeredStudents.student',
        select: '_id name email'
      });

    if (!contest) {
      return res.status(404).json({ message: 'Contest not found' });
    }

    // Add null checks and safe navigation
    const isRegistered = contest.registeredStudents?.some(
      p => p?.student?._id?.toString() === userId?.toString()
    ) || false;

    // Get participant details with null checks
    const participant = contest.registeredStudents?.find(
      p => p?.student?._id?.toString() === userId?.toString()
    );

    const now = new Date();
    const startTime = new Date(contest.startTime);
    const endTime = new Date(startTime.getTime() + (contest.duration || 0) * 60000);

    // Create the state object with default values
    const state = {
      contestId: contest._id,
      isRegistered: isRegistered,
      isActive: false, // Will be determined by time
      canStart: false, // Will be determined by conditions
      hasEnded: now > endTime,
      startTime: startTime,
      endTime: endTime,
      timeRemaining: Math.max(0, endTime - now),
      submissions: participant?.submissions || [],
      problems: contest.problems.map(p => ({
        _id: p._id,
        title: p.problem.title,
        description: p.problem.description,
        points: p.points,
        sampleInput: p.problem.sampleInput,
        sampleOutput: p.problem.sampleOutput,
        testCases: p.problem.testCases.filter(t => !t.isHidden),
        status: participant?.submissions?.find(
          s => s.problemId?.toString() === p.problem._id?.toString()
        )?.status || 'NOT_ATTEMPTED'
      })),
      title: contest.title,
      description: contest.description,
      duration: contest.duration
    };

    // Determine if the student can start the contest
    state.canStart = isRegistered && now >= startTime && now <= endTime;
    state.isActive = isRegistered && now >= startTime && now <= endTime;

    // Add debug logging
    console.log('Contest state:', {
      isRegistered,
      participantFound: !!participant,
      canStart: state.canStart,
      isActive: state.isActive
    });

    res.json(state);
  } catch (error) {
    console.error('Error getting contest state:', error);
    res.status(500).json({ 
      error: 'Failed to get contest state',
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// POST /api/student/contests/:id/problems/:problemId/run
router.post('/student/contests/:id/problems/:problemId/run', auth, isStudent, async (req, res) => {
  try {
    const { code, language } = req.body;
    
    // Validate input
    if (!code || !language) {
      return res.status(400).json({ message: 'Code and language are required' });
    }

    // Find contest and problem
    const contest = await Contest.findById(req.params.id)
      .populate({
        path: 'problems.problem',
        match: { _id: req.params.problemId },
        select: 'title description testCases'
      });

    if (!contest) {
      return res.status(404).json({ message: 'Contest not found' });
    }

    const problemData = contest.problems.find(
      p => p.problem && p.problem._id.toString() === req.params.problemId
    );

    if (!problemData || !problemData.problem) {
      return res.status(404).json({ message: 'Problem not found' });
    }

    // Execute code against test cases
    const results = await Promise.all(problemData.problem.testCases.map(async (testCase) => {
      try {
        const response = await axios.post('https://api.codex.jaagrav.in', {
          code,
          language: getCodexLanguage(language),
          input: testCase.input
        }, {
          headers: {
            'Content-Type': 'application/json'
          },
          timeout: 10000 // 10 second timeout
        });

        const output = response.data.output?.trim() || '';
        const expected = testCase.output?.trim() || '';
        const passed = output === expected;

        return {
          passed,
          input: testCase.isHidden ? 'Hidden' : testCase.input,
          expected: testCase.isHidden ? 'Hidden' : expected,
          actual: testCase.isHidden ? 'Hidden' : output,
          error: response.data.error || '',
          isHidden: testCase.isHidden
        };
      } catch (error) {
        console.error('Test case execution error:', error);
        return {
          passed: false,
          error: 'Code execution failed',
          isHidden: testCase.isHidden
        };
      }
    }));

    // Update submission status if all tests passed
    const allPassed = results.every(r => r.passed);
    if (allPassed) {
      await updateSubmissionStatus(contest, req.user._id, problemData.problem._id, code, language);
    }

    res.json({ results, allPassed });
  } catch (error) {
    console.error('Error running code:', error);
    res.status(500).json({ message: 'Failed to run code', error: error.message });
  }
});

// Helper function to update submission status
async function updateSubmissionStatus(contest, userId, problemId, code, language) {
  const participant = contest.activeParticipants?.find(
    p => p.student?.toString() === userId.toString()
  );

  if (participant) {
    const submission = {
      problemId,
      code,
      language,
      status: 'PASSED',
      submittedAt: new Date()
    };

    const existingIndex = participant.submissions?.findIndex(
      s => s.problemId?.toString() === problemId.toString()
    );

    if (existingIndex !== -1) {
      participant.submissions[existingIndex] = submission;
    } else {
      if (!participant.submissions) participant.submissions = [];
      participant.submissions.push(submission);
    }

    await contest.save();
  }
}

// POST /api/student/contests/:id/save-code
router.post('/student/contests/:id/save-code', auth, isStudent, async (req, res) => {
  try {
    const { problemId, code, language } = req.body;
    const userId = req.user._id;

    // Input validation
    if (!problemId || !code || !language) {
      return res.status(400).json({ 
        message: 'Missing required fields',
        details: { problemId, code: !!code, language }
      });
    }

    // Find contest and populate necessary fields
    const contest = await Contest.findById(req.params.id)
      .populate('problems.problem')
      .populate('activeParticipants.student');
    
    if (!contest) {
      return res.status(404).json({ message: 'Contest not found' });
    }

    // Find participant
    let participant = contest.activeParticipants?.find(
      p => p.student?._id?.toString() === userId.toString()
    );

    if (!participant) {
      return res.status(400).json({ 
        message: 'You must start the contest first',
        details: { userId: userId.toString() }
      });
    }

    // Initialize submissions array if it doesn't exist
    if (!participant.submissions) {
      participant.submissions = [];
    }

    // Find or create submission
    let submission = participant.submissions.find(
      s => s.problemId?.toString() === problemId.toString()
    );

    if (submission) {
      submission.code = code;
      submission.language = language;
      submission.submittedAt = new Date();
    } else {
      participant.submissions.push({
        problemId: new mongoose.Types.ObjectId(problemId),
        code,
        language,
        status: 'IN_PROGRESS',
        submittedAt: new Date()
      });
    }

    await contest.save();
    res.json({ 
      message: 'Code saved successfully',
      submission: submission || participant.submissions[participant.submissions.length - 1]
    });

  } catch (error) {
    console.error('Error saving code:', error);
    res.status(500).json({ 
      error: 'Failed to save code',
      details: error.message,
      stack: error.stack
    });
  }
});

// Faculty Routes for Contest Management
router.get('/faculty/contests', auth, isFaculty, async (req, res) => {
  try {
    console.log('Fetching contests for faculty:', req.user._id);
    
    const contests = await Contest.find({ 
      createdBy: req.user._id
    }).sort({ createdAt: -1 });

    console.log('Found contests:', contests.length);

    // Transform the data to include required fields
    const transformedContests = contests.map(contest => ({
      _id: contest._id,
      title: contest.title,
      description: contest.description,
      startTime: contest.startTime,
      duration: contest.duration,
      isPublished: contest.isPublished,
      status: getContestStatus(contest),
      problemCount: contest.problems?.length || 0,
      participantCount: contest.registeredStudents?.length || 0
    }));

    res.json(transformedContests);
  } catch (error) {
    console.error('Error fetching faculty contests:', error);
    res.status(500).json({ 
      error: 'Failed to fetch contests',
      details: error.message 
    });
  }
});

// Helper function to determine contest status
function getContestStatus(contest) {
  const now = new Date();
  const startTime = new Date(contest.startTime);
  const endTime = new Date(startTime.getTime() + contest.duration * 60000);

  if (!contest.isPublished) return 'Draft';
  if (now < startTime) return 'Upcoming';
  if (now > endTime) return 'Completed';
  return 'Active';
}

router.patch('/faculty/contests/:id/publish', auth, isFaculty, async (req, res) => {
  try {
    const contest = await Contest.findOneAndUpdate(
      { 
        _id: req.params.id, 
        createdBy: req.user._id 
      },
      { 
        isPublished: req.body.isPublished 
      },
      { 
        new: true,
        runValidators: true
      }
    );

    if (!contest) {
      return res.status(404).json({ error: 'Contest not found' });
    }

    res.json({
      message: `Contest ${req.body.isPublished ? 'published' : 'unpublished'} successfully`,
      contest
    });
  } catch (error) {
    console.error('Error updating contest publish status:', error);
    res.status(500).json({ 
      error: 'Failed to update contest status',
      details: error.message 
    });
  }
});

router.delete('/faculty/contests/:id', auth, isFaculty, async (req, res) => {
  try {
    const contest = await Contest.findOneAndDelete({
      _id: req.params.id,
      createdBy: req.user._id
    });
    if (!contest) {
      return res.status(404).json({ error: 'Contest not found' });
    }
    res.json({ message: 'Contest deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete contest' });
  }
});

router.post('/faculty/contests', auth, isFaculty, async (req, res) => {
  try {
    const contest = new Contest({
      ...req.body,
      createdBy: req.user._id
    });
    await contest.save();
    res.status(201).json(contest);
  } catch (error) {
    console.error('Error creating contest:', error);
    res.status(500).json({ error: 'Failed to create contest' });
  }
});

// Update the GET problem details endpoint
router.get('/student/contests/:contestId/problems/:problemId', auth, isStudent, async (req, res) => {
  try {
    const { contestId, problemId } = req.params;
    
    const contest = await Contest.findOne({
      _id: contestId,
      'problems.problem': problemId,
      'registeredStudents.student': req.user._id
    }).populate({
      path: 'problems.problem',
      match: { _id: problemId },
      select: 'title description difficulty points sampleInput sampleOutput testCases language'
    });

    if (!contest) {
      return res.status(404).json({ message: 'Contest or problem not found' });
    }

    const problem = contest.problems.find(p => p.problem?._id.toString() === problemId);
    if (!problem || !problem.problem) {
      return res.status(404).json({ message: 'Problem not found' });
    }

    // Get saved code if exists
    const registration = contest.registeredStudents.find(
      reg => reg.student && reg.student.toString() === req.user._id.toString()
    );

    const savedSubmission = registration?.submissions?.find(
      sub => sub.problemId.toString() === problemId
    );

    res.json({
      _id: problem.problem._id,
      title: problem.problem.title,
      description: problem.problem.description,
      difficulty: problem.problem.difficulty,
      points: problem.points || problem.problem.points,
      sampleInput: problem.problem.sampleInput,
      sampleOutput: problem.problem.sampleOutput,
      language: problem.problem.language,
      testCases: problem.problem.testCases?.filter(t => !t.isHidden) || [],
      savedCode: savedSubmission?.code || '',
      savedLanguage: savedSubmission?.language || 'python'
    });
  } catch (error) {
    console.error('Error fetching problem details:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Add this route for contest details
router.get('/student/contests/:contestId/details', auth, isStudent, async (req, res) => {
  try {
    const contest = await Contest.findById(req.params.contestId)
      .populate({
        path: 'problems.problem',
        select: 'title description difficulty points sampleInput sampleOutput testCases language'
      })
      .populate('registeredStudents.student', '_id')
      .lean();

    if (!contest) {
      return res.status(404).json({ message: 'Contest not found' });
    }

    // Get registration status
    const registration = contest.registeredStudents?.find(
      reg => reg.student && reg.student._id && 
      reg.student._id.toString() === req.user._id.toString()
    );

    if (!registration) {
      return res.status(403).json({ message: 'You are not registered for this contest' });
    }

    // Transform problems data
    const problems = contest.problems
      .filter(p => p && p.problem) // Filter out any null problems
      .map(p => ({
        _id: p.problem._id,
        title: p.problem.title || 'Untitled Problem',
        description: p.problem.description || '',
        difficulty: p.problem.difficulty || 'Medium',
        points: p.points || p.problem.points || 0,
        sampleInput: p.problem.sampleInput || '',
        sampleOutput: p.problem.sampleOutput || '',
        language: p.problem.language || 'python',
        testCases: p.problem.testCases?.filter(t => !t.isHidden) || []
      }));

    // Calculate time remaining
    const startTime = new Date(contest.startTime);
    const now = new Date();
    const endTime = new Date(startTime.getTime() + contest.duration * 60000);
    const timeRemaining = Math.max(0, endTime - now);

    console.log('Sending contest details:', {
      _id: contest._id,
      title: contest.title,
      problems: problems.length,
      timeRemaining
    });

    res.json({
      _id: contest._id,
      title: contest.title,
      description: contest.description,
      startTime: contest.startTime,
      duration: contest.duration,
      timeRemaining,
      problems,
      status: now < startTime ? 'upcoming' : now > endTime ? 'completed' : 'active'
    });
  } catch (error) {
    console.error('Error fetching contest details:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Export the router
module.exports = router;
