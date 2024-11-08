const axios = require('axios');

const executeCode = async (code, language, input = '') => {
  // Map language to Codex format
  const codexLanguage = {
    'cpp': 'cpp',
    'python': 'py',
    'java': 'java',
    'javascript': 'js',
    'c': 'c'
  }[language];

  if (!codexLanguage) {
    throw new Error('Unsupported language');
  }

  try {
    // Make request to Codex API with increased timeout
    const response = await axios.post('https://api.codex.jaagrav.in', {
      code,
      language: codexLanguage,
      input
    }, {
      timeout: 60000, // Increase timeout to 60 seconds
      headers: {
        'Content-Type': 'application/json'
      }
    });

    // Check for API-specific error responses
    if (response.data.error) {
      throw new Error(response.data.error);
    }

    return {
      success: true,
      output: response.data.output,
      error: null
    };

  } catch (error) {
    // Handle different types of errors
    if (error.code === 'ECONNABORTED' || error.response?.status === 408) {
      throw new Error('Code execution timed out. Please check for infinite loops or optimize your solution.');
    }

    if (error.response?.data?.error) {
      throw new Error(error.response.data.error);
    }

    // Log the error for debugging
    console.error('Code execution error details:', {
      error: error.message,
      response: error.response?.data,
      code: error.code
    });

    throw new Error('Failed to execute code: ' + (error.message || 'Unknown error'));
  }
};

module.exports = { executeCode };