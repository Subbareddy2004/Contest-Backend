const isFaculty = (req, res, next) => {
    try {
      if (req.user.role !== 'faculty') {
        return res.status(403).json({ message: 'Access denied. Faculty only.' });
      }
      next();
    } catch (error) {
      res.status(401).json({ message: 'Invalid token' });
    }
  };
  
  module.exports = { isFaculty };