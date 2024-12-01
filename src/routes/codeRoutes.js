const express = require('express');
const router = express.Router();
const axios = require('axios');

const JUDGE0_API = 'https://judge0-ce.p.rapidapi.com';
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

router.get('/status/:token', async (req, res) => {
  try {
    const { token } = req.params;
    
    const result = await axios.get(`${JUDGE0_API}/submissions/${token}`, {
      headers: {
        'X-RapidAPI-Host': 'judge0-ce.p.rapidapi.com',
        'X-RapidAPI-Key': process.env.RAPIDAPI_KEY
      }
    });

    res.json(result.data);
  } catch (error) {
    console.error('Status check error:', error);
    res.status(500).json({ error: 'Error checking submission status' });
  }
});

router.post('/execute', async (req, res) => {
  try {
    const { code, language_id, input } = req.body;

    // First, create the submission
    const submission = await axios.post(`${JUDGE0_API}/submissions`, {
      source_code: code,
      language_id: language_id,
      stdin: input,
      wait: true  // This tells Judge0 to wait for the result
    }, {
      headers: {
        'Content-Type': 'application/json',
        'X-RapidAPI-Host': 'judge0-ce.p.rapidapi.com',
        'X-RapidAPI-Key': process.env.RAPIDAPI_KEY
      }
    });

    // Wait a moment for the submission to be processed
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Get the result
    const result = await axios.get(`${JUDGE0_API}/submissions/${submission.data.token}`, {
      headers: {
        'X-RapidAPI-Host': 'judge0-ce.p.rapidapi.com',
        'X-RapidAPI-Key': process.env.RAPIDAPI_KEY
      }
    });

    // Send back a more detailed response
    res.json({
      ...result.data,
      output: result.data.stdout || result.data.compile_output || result.data.stderr,
      error: result.data.stderr || result.data.compile_output,
      status: result.data.status
    });

  } catch (error) {
    console.error('Code execution error:', error);
    res.status(500).json({ 
      error: error.response?.data?.error || 'Error executing code',
      details: error.response?.data
    });
  }
});

router.post('/execute-sql', async (req, res) => {
  try {
    const { code, dbType = 'sqlite' } = req.body;
    
    // Configure database-specific settings
    const dbConfig = {
      sqlite: {
        languageId: LANGUAGE_IDS.sql,
        stdin: '', // SQLite doesn't need stdin
      },
      mysql: {
        languageId: LANGUAGE_IDS.mysql,
        stdin: JSON.stringify({
          database: 'test_db',
          query: code
        })
      },
      postgresql: {
        languageId: LANGUAGE_IDS.postgresql,
        stdin: JSON.stringify({
          database: 'test_db',
          query: code
        })
      }
    };

    const config = dbConfig[dbType];
    
    const response = await axios.post(`${JUDGE0_API}/submissions`, {
      source_code: code,
      language_id: config.languageId,
      stdin: config.stdin,
      expected_output: '',
    }, {
      headers: {
        'Content-Type': 'application/json',
        'X-RapidAPI-Host': process.env.JUDGE0_API_HOST,
        'X-RapidAPI-Key': process.env.RAPIDAPI_KEY,
      }
    });

    // ... rest of execution logic ...
    
  } catch (error) {
    console.error('SQL execution error:', error);
    res.status(500).json({ 
      error: error.response?.data?.error || 'Error executing SQL query'
    });
  }
});

module.exports = router; 