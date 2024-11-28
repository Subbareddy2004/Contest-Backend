const express = require('express');
const router = express.Router();
const axios = require('axios');

const JUDGE0_API = 'https://judge0-ce.p.rapidapi.com';
const LANGUAGE_IDS = {
  'py': 71,    // Python
  'cpp': 54,   // C++
  'java': 62,  // Java
  'c': 50      // C
};

router.post('/execute', async (req, res) => {
  try {
    const { code, language, input } = req.body;

    // Create submission
    const submission = await axios.post(`${JUDGE0_API}/submissions`, {
      source_code: code,
      language_id: LANGUAGE_IDS[language],
      stdin: input
    }, {
      headers: {
        'Content-Type': 'application/json',
        'X-RapidAPI-Host': 'judge0-ce.p.rapidapi.com',
        'X-RapidAPI-Key': process.env.RAPIDAPI_KEY // Add this to your .env file
      }
    });

    // Get submission token
    const token = submission.data.token;

    // Wait for result
    let result;
    do {
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
      result = await axios.get(`${JUDGE0_API}/submissions/${token}`, {
        headers: {
          'X-RapidAPI-Host': 'judge0-ce.p.rapidapi.com',
          'X-RapidAPI-Key': process.env.RAPIDAPI_KEY
        }
      });
    } while (result.data.status.id <= 2); // While submission is in queue or processing

    res.json({
      output: result.data.stdout || '',
      error: result.data.stderr || result.data.compile_output || '',
      status: result.data.status
    });
  } catch (error) {
    console.error('Code execution error:', error);
    res.status(500).json({ 
      error: error.response?.data?.error || 'Error executing code'
    });
  }
});

module.exports = router; 