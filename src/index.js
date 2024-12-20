const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const authRoutes = require('./routes/authRoutes');
const problemRoutes = require('./routes/problemRoutes');
const studentRoutes = require('./routes/studentRoutes');
const multer = require('multer');
const assignmentRoutes = require('./routes/assignmentRoutes');
const submissionRoutes = require('./routes/submissionRoutes');
const facultyRoutes = require('./routes/facultyRoutes');
const leaderboardRoutes = require('./routes/leaderboardRoutes');
const adminRoutes = require('./routes/adminRoutes');
const contestRoutes = require('./routes/contestRoutes');
const { requestLogger } = require('./middleware/logging');
const { auth } = require('./middleware/auth');
const Assignment = require('./models/Assignment');
const User = require('./models/User');
const Problem = require('./models/Problem');
const dashboardRoutes = require('./routes/dashboardRoutes');
const codeRoutes = require('./routes/codeRoutes');
const fileUpload = require('express-fileupload');
const adminContestRoutes = require('./routes/adminContestRoutes');

const app = express();

// Middleware
app.use(cors({
  origin: [process.env.CLIENT_URL || 'http://localhost:5173', 'https://eyelabs.vercel.app'],
  credentials: true
}));


// Increase the payload size limit if needed
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Add request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.originalUrl}`);
  if (req.body && Object.keys(req.body).length > 0) {
    console.log('Request body:', req.body);
  }
  next();
});

// Add this before your routes
app.use((req, res, next) => {
  const userRole = req.headers['user-role'] || 'student';
  req.userRole = userRole;
  next();
});

app.use(fileUpload({
  createParentPath: true,
  limits: { 
    fileSize: 5 * 1024 * 1024 // 5MB max file size
  },
}));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/student', studentRoutes);
app.use('/api/faculty', facultyRoutes);
app.use('/api/problems', problemRoutes);
app.use('/api/assignments', assignmentRoutes);
app.use('/api/submissions', submissionRoutes);
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/contests', contestRoutes);
app.use('/api/execute', contestRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/code', codeRoutes);
app.use('/api/admin/contests', adminContestRoutes);
app.use('/admin/contests', adminContestRoutes);


// Add this before your error handling middleware
app.use((err, req, res, next) => {
  console.error('Error details:', {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    body: req.body
  });
  next(err);
});

// Add this after your routes
app.use((err, req, res, next) => {
  console.error('Error:', err);

  if (err.name === 'CastError' && err.kind === 'ObjectId') {
    return res.status(400).json({ 
      message: 'Invalid ID format',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }

  if (err instanceof mongoose.Error) {
    return res.status(400).json({ 
      message: 'Database operation failed',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }

  res.status(500).json({ 
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('Connected to MongoDB'))
.catch(err => console.error('MongoDB connection error:', err));

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ message: 'File upload error' });
  }

  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ message: 'Invalid JSON payload' });
  }

  if (err.name === 'UnauthorizedError') {
    return res.status(401).json({ message: 'Invalid token' });
  }

  res.status(500).json({ 
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

const PORT = process.env.PORT || 5000;
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

// Export the Express app for Vercel
module.exports = app;
