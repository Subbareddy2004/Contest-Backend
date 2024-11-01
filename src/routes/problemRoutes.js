const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const { isFaculty } = require('../middleware/faculty');
const Problem = require('../models/Problem');

// Get recent problems
router.get('/recent', auth, async (req, res) => {
  try {
    console.log('Fetching recent problems...');
    
    const problems = await Problem.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .select('title difficulty _id')
      .populate('createdBy', 'name');
    
    console.log('Found problems:', problems);
    res.json(problems);
  } catch (error) {
    console.error('Error fetching recent problems:', error);
    res.status(500).json({ 
      message: 'Error fetching recent problems',
      error: error.message 
    });
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

// Get all problems (public route)
router.get('/', async (req, res) => {
  try {
    const problems = await Problem.find()
      .select('-testCases')
      .populate('createdBy', 'name')
      .sort('-createdAt');
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

router.get('/seed', auth, async (req, res) => {
  try {
    const count = await Problem.countDocuments();
    if (count === 0) {
      const testProblems = [
        {
          title: 'Two Sum',
          description: 'Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target.',
          difficulty: 'Easy',
          createdBy: req.user.id,
          testCases: [
            {
              input: '[2,7,11,15]\n9',
              output: '[0,1]',
              isHidden: false
            }
          ],
          constraints: [
            '2 <= nums.length <= 104',
            '-109 <= nums[i] <= 109'
          ],
          sampleInput: '[2,7,11,15]\n9',
          sampleOutput: '[0,1]',
          tags: ['Array', 'Hash Table']
        },
        {
          title: 'Three Sum',
          description: 'Given an integer array nums, return all the triplets [nums[i], nums[j], nums[k]] such that i != j, i != k, and j != k, and nums[i] + nums[j] + nums[k] == 0.',
          difficulty: 'Medium',
          createdBy: req.user.id,
          testCases: [
            {
              input: '[-1,0,1,2,-1,-4]',
              output: '[[-1,-1,2],[-1,0,1]]',
              isHidden: false
            }
          ],
          constraints: [
            '3 <= nums.length <= 3000',
            '-105 <= nums[i] <= 105'
          ],
          sampleInput: '[-1,0,1,2,-1,-4]',
          sampleOutput: '[[-1,-1,2],[-1,0,1]]',
          tags: ['Array', 'Two Pointers']
        }
      ];

      await Problem.insertMany(testProblems);
      res.json({ message: 'Test problems created' });
    } else {
      res.json({ message: 'Problems already exist' });
    }
  } catch (error) {
    console.error('Error seeding problems:', error);
    res.status(500).json({ 
      message: 'Error seeding problems',
      error: error.message 
    });
  }
});

module.exports = router;
