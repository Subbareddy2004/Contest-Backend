const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const Contest = require('../models/Contest');

// Move this route to the top, before any /:id routes
router.get('/upcoming', auth, async (req, res) => {
  try {
    const contests = await Contest.find({
      startTime: { $gt: new Date() }
    })
    .sort({ startTime: 1 })
    .limit(5)
    .select('title startTime');
    
    res.json(contests);
  } catch (error) {
    console.error('Error fetching upcoming contests:', error);
    res.status(500).json({ message: 'Error fetching upcoming contests' });
  }
});

// Get all contests
router.get('/', auth, async (req, res) => {
  try {
    const contests = await Contest.find()
      .populate('createdBy', 'name')
      .populate('problems.problem', 'title difficulty')
      .sort('-createdAt');

    // Filter contests based on user role and participation
    const filteredContests = contests.map(contest => {
      const isCreator = contest.createdBy._id.toString() === req.user.id;
      const hasParticipated = contest.submissions?.some(sub => 
        sub.student && sub.student.toString() === req.user.id
      );

      return {
        ...contest.toObject(),
        isCreator,
        hasParticipated,
        // Only show submissions count to faculty
        submissionsCount: req.user.role === 'faculty' ? contest.submissions?.length : undefined
      };
    });

    res.json(filteredContests);
  } catch (error) {
    console.error('Error fetching contests:', error);
    res.status(500).json({ message: 'Error fetching contests' });
  }
});

// Get single contest details
router.get('/:id', auth, async (req, res) => {
  try {
    const contest = await Contest.findById(req.params.id)
      .populate('problems.problem', 'title difficulty')
      .lean();
    
    if (!contest) {
      return res.status(404).json({ message: 'Contest not found' });
    }

    res.json(contest);
  } catch (error) {
    console.error('Error fetching contest:', error);
    res.status(500).json({ message: 'Error fetching contest' });
  }
});

// Join contest route
router.post('/:id/join', auth, async (req, res) => {
  try {
    const contest = await Contest.findById(req.params.id);
    
    if (!contest) {
      return res.status(404).json({ message: 'Contest not found' });
    }

    // Check if user already joined
    const alreadyJoined = contest.participants.some(
      participant => participant.user.toString() === req.user.id
    );

    if (alreadyJoined) {
      return res.status(400).json({ message: 'Already joined this contest' });
    }

    // Check if contest has started
    const now = new Date();
    const startTime = new Date(contest.startTime);
    const endTime = new Date(startTime.getTime() + contest.duration * 60000);

    if (now > endTime) {
      return res.status(400).json({ message: 'Contest has already ended' });
    }

    // Add user to participants
    const newParticipant = {
      user: req.user.id,
      joinedAt: new Date(),
      submissions: []
    };

    contest.participants.push(newParticipant);
    await contest.save();

    res.json({ 
      message: 'Successfully joined contest',
      contestId: contest._id,
      startTime: contest.startTime,
      duration: contest.duration
    });

  } catch (error) {
    console.error('Error joining contest:', error);
    res.status(500).json({ message: 'Error joining contest' });
  }
});

// Get contest leaderboard
router.get('/:id/leaderboard', auth, async (req, res) => {
  try {
    const contest = await Contest.findById(req.params.id)
      .populate('problems')
      .populate({
        path: 'submissions',
        populate: [
          { path: 'student', select: 'name' },
          { path: 'problem', select: 'title points' }
        ]
      });
    
    if (!contest) {
      return res.status(404).json({ message: 'Contest not found' });
    }

    // Process submissions to create leaderboard
    const participantScores = {};
    
    contest.submissions.forEach(submission => {
      const studentId = submission.student._id.toString();
      if (!participantScores[studentId]) {
        participantScores[studentId] = {
          user: submission.student,
          score: 0,
          submissions: 0
        };
      }
      
      if (submission.status === 'Accepted') {
        participantScores[studentId].score += submission.problem.points || 0;
      }
      participantScores[studentId].submissions += 1;
    });

    const leaderboard = Object.values(participantScores)
      .sort((a, b) => b.score - a.score);

    res.json(leaderboard);
  } catch (error) {
    console.error('Error fetching contest leaderboard:', error);
    res.status(500).json({ message: 'Error fetching leaderboard' });
  }
});

// Get all contests (for faculty)
router.get('/faculty/contests', auth, async (req, res) => {
  try {
    const contests = await Contest.find()
      .populate('problems', 'title points')
      .populate('createdBy', 'name')
      .populate('participants.user', 'name')
      .sort('-createdAt')
      .lean();

    res.json(contests);
  } catch (error) {
    console.error('Error fetching contests:', error);
    res.status(500).json({ message: 'Error fetching contests' });
  }
});

// Create contest (for faculty)
router.post('/faculty/contests', auth, async (req, res) => {
  try {
    const { title, description, startTime, duration, problems } = req.body;
    
    const contest = new Contest({
      title,
      description,
      startTime,
      duration,
      problems,
      createdBy: req.user.id
    });

    await contest.save();
    res.status(201).json(contest);
  } catch (error) {
    console.error('Error creating contest:', error);
    res.status(500).json({ message: 'Error creating contest' });
  }
});

module.exports = router;
