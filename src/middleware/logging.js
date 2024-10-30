const requestLogger = (req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    if (req.method === 'POST' || req.method === 'PUT') {
      console.log('Request body:', req.body);
    }
    next();
  };
  
  module.exports = { requestLogger };