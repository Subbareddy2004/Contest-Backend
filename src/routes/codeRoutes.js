const express = require('express');
const router = express.Router();
const axios = require('axios');

const JUDGE0_API = process.env.JUDGE0_API_URL;
const LANGUAGE_IDS = {
  'python': 71,    // Python (3.8.1)
  'cpp': 54,       // C++ (GCC 9.2.0)
  'java': 62,      // Java (OpenJDK 13.0.1)
  'javascript': 63,// JavaScript (Node.js 12.14.0)
  'c': 50,         // C (GCC 9.2.0)
  'csharp': 51,    // C# (Mono 6.6.0.161)
  'ruby': 72,      // Ruby (2.7.0)
  'swift': 83,     // Swift (5.2.3)
  'go': 60,        // Go (1.13.5)
  'rust': 73,      // Rust (1.40.0)
  'php': 68,       // PHP (7.4.1)
  'kotlin': 78,    // Kotlin (1.3.70)
  'scala': 81,     // Scala (2.13.2)
  'r': 80,         // R (4.0.0)
  'perl': 85,      // Perl (5.28.1)
  'pascal': 67,    // Pascal (FPC 3.0.4)
  'typescript': 74,// TypeScript (3.7.4)
  'sql': 82,       // SQL (SQLite 3.27.2)
  'mysql': 82,     // MySQL specific mode
  'postgresql': 82 // PostgreSQL specific mode
};

router.post('/execute', async (req, res) => {
  try {
    const { code, language, input } = req.body;

    // Validate language
    const languageId = LANGUAGE_IDS[language];
    if (!languageId) {
      return res.status(400).json({ error: 'Unsupported programming language' });
    }

    // Prepare submission for Judge0
    const submission = {
      source_code: Buffer.from(code).toString('base64'),
      language_id: languageId,
      stdin: input ? Buffer.from(input).toString('base64') : '',
      wait: true
    };

    // Submit to Judge0
    const response = await axios.post(`${JUDGE0_API}/submissions?base64_encoded=true&wait=true`, submission, {
      headers: {
        'Content-Type': 'application/json',
        'X-RapidAPI-Host': process.env.JUDGE0_HOST,
        'X-RapidAPI-Key': process.env.JUDGE0_API_KEY
      }
    });

    // Process the response
    const result = {
      output: response.data.stdout ? Buffer.from(response.data.stdout, 'base64').toString() : '',
      error: response.data.stderr ? Buffer.from(response.data.stderr, 'base64').toString() : '',
      compile_output: response.data.compile_output ? Buffer.from(response.data.compile_output, 'base64').toString() : '',
      status: {
        id: response.data.status.id,
        description: response.data.status.description
      }
    };

    res.json({
      ...result,
      output: result.output || result.compile_output || result.error,
      error: result.error || result.compile_output,
      status: result.status
    });

  } catch (error) {
    console.error('Code execution error:', error);
    res.status(500).json({ 
      error: error.response?.data?.error || 'Error executing code',
      details: error.response?.data
    });
  }
});

router.get('/status/:token', async (req, res) => {
  try {
    const { token } = req.params;
    
    const result = await axios.get(`${JUDGE0_API}/submissions/${token}?base64_encoded=true`, {
      headers: {
        'X-RapidAPI-Host': process.env.JUDGE0_HOST,
        'X-RapidAPI-Key': process.env.JUDGE0_API_KEY
      }
    });

    // Decode base64 outputs
    const response = {
      ...result.data,
      stdout: result.data.stdout ? Buffer.from(result.data.stdout, 'base64').toString() : '',
      stderr: result.data.stderr ? Buffer.from(result.data.stderr, 'base64').toString() : '',
      compile_output: result.data.compile_output ? Buffer.from(result.data.compile_output, 'base64').toString() : ''
    };

    res.json(response);
  } catch (error) {
    console.error('Status check error:', error);
    res.status(500).json({ error: 'Error checking submission status' });
  }
});

module.exports = router; 