const isFaculty = (req, res, next) => {
  try {
    console.log('User role:', req.user.role); // Debug log
    
    if (req.user.role !== 'faculty') {
      return res.status(403).json({ message: 'Access denied. Faculty only.' });
    }
    next();
  } catch (error) {
    console.error('Faculty middleware error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = { isFaculty };