const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const { isStudent } = require('../middleware/roleCheck');
const { isFaculty } = require('../middleware/roleCheck');
const Problem = require('../models/Problem');
const axios = require('axios');

// Student routes should come before generic routes
// Get all problems for students
router.get('/student/problems', auth, isStudent, async (req, res) => {
  try {
    console.log('Fetching problems for student');
    const problems = await Problem.find()
      .select('title description difficulty points')
      .lean();
    
    console.log(`Found ${problems.length} problems`);
    res.json(problems);
  } catch (error) {
    console.error('Error fetching problems:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get specific problem details for students
router.get('/student/problems/:id', auth, isStudent, async (req, res) => {
  try {
    console.log(`Fetching problem with ID: ${req.params.id}`);
    const problem = await Problem.findById(req.params.id)
      .select('title description difficulty points sampleInput sampleOutput testCases template language')
      .lean();

    if (!problem) {
      console.log('Problem not found');
      return res.status(404).json({ message: 'Problem not found' });
    }

    console.log('Problem found:', problem.title);
    res.json(problem);
  } catch (error) {
    console.error('Error fetching problem:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Run code for a problem
router.post('/student/problems/:id/run', auth, isStudent, async (req, res) => {
  try {
    const { code, language } = req.body;
    
    // Input validation
    if (!code || !language) {
      return res.status(400).json({ 
        success: false,
        message: 'Code and language are required'
      });
    }

    // Get the problem to check test cases
    const problem = await Problem.findById(req.params.id);
    if (!problem) {
      return res.status(404).json({
        success: false,
        message: 'Problem not found'
      });
    }

    // Map language to Judge0 language ID
    const languageMap = {
      'cpp': 54,    // C++ (GCC 9.2.0)
      'c': 50,      // C (GCC 9.2.0)
      'python': 71, // Python (3.8.1)
      'java': 62    // Java (OpenJDK 13.0.1)
    };

    const judge0LanguageId = languageMap[language];
    if (!judge0LanguageId) {
      return res.status(400).json({
        success: false,
        message: 'Unsupported programming language'
      });
    }

    // Execute code against test case
    try {
      const testCase = problem.testCases[0]; // Use first test case for initial run

      // Prepare submission for Judge0
      const submission = {
        source_code: Buffer.from(code).toString('base64'),
        language_id: judge0LanguageId,
        stdin: Buffer.from(testCase.input).toString('base64'),
        expected_output: Buffer.from(testCase.output).toString('base64')
      };

      // Submit to Judge0
      const response = await axios.post(
        `${process.env.JUDGE0_API_URL}/submissions?base64_encoded=true&wait=true`,
        submission,
        {
          headers: {
            'Content-Type': 'application/json',
            'X-RapidAPI-Host': process.env.JUDGE0_HOST,
            'X-RapidAPI-Key': process.env.JUDGE0_API_KEY
          }
        }
      );

      // Process Judge0 response
      const actualOutput = Buffer.from(response.data.stdout || '', 'base64').toString();
      const errorOutput = Buffer.from(response.data.stderr || '', 'base64').toString();
      const passed = response.data.status.id === 3; // 3 is Accepted in Judge0

      res.json({
        success: true,
        output: actualOutput,
        error: errorOutput,
        testCase: {
          input: testCase.input,
          expectedOutput: testCase.output,
          actualOutput: actualOutput,
          passed: passed
        }
      });

    } catch (execError) {
      console.error('Code execution error:', execError);
      res.status(400).json({
        success: false,
        message: execError.response?.data?.message || execError.message,
        isExecutionError: true
      });
    }

  } catch (error) {
    console.error('Error processing code execution:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while processing code execution',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

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
