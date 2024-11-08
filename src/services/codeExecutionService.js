const axios = require('axios');

const executeCode = async (code, language, input = '') => {
  try {
    const response = await axios.post('https://api.codex.jaagrav.in', {
      code,
      language,
      input
    }, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    return {
      output: response.data.output,
      error: response.data.error,
      status: response.data.status
    };
  } catch (error) {
    console.error('Code execution error:', error);
    throw new Error('Failed to execute code');
  }
};

module.exports = { executeCode };