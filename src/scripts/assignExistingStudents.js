const mongoose = require('mongoose');
const User = require('../models/User');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function assignExistingStudents(facultyId) {
  try {
    console.log('Connecting to MongoDB:', process.env.MONGODB_URI);
    await mongoose.connect(process.env.MONGODB_URI);
    
    // Get all students without addedBy field
    const studentsToUpdate = await User.find({ 
      role: 'student', 
      addedBy: { $exists: false }
    });

    console.log(`Found ${studentsToUpdate.length} students to update`);

    // Update each student
    for (const student of studentsToUpdate) {
      await User.findByIdAndUpdate(student._id, {
        addedBy: facultyId
      });
      console.log(`Updated student: ${student.name}`);
    }

    console.log('Successfully assigned existing students to faculty');
    process.exit(0);
  } catch (error) {
    console.error('Error assigning students:', error);
    process.exit(1);
  }
}

// Replace with your faculty ID - using the one from your logs
const facultyId = '671fb1ef5c8dc18bd379c16e';
assignExistingStudents(facultyId);