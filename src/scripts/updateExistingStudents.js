const mongoose = require('mongoose');
const User = require('../models/User');

async function updateExistingStudents() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    
    // Get all students without addedBy field
    const studentsToUpdate = await User.find({ 
      role: 'student', 
      addedBy: { $exists: false } 
    });

    console.log(`Found ${studentsToUpdate.length} students to update`);

    // Update each student
    for (const student of studentsToUpdate) {
      // You'll need to specify which faculty should be assigned to these students
      // This is just an example - replace with the correct faculty ID
      await User.findByIdAndUpdate(student._id, {
        addedBy: '671fb1ef5c8dc18bd379c16e'  // Replace with actual faculty ID
      });
    }

    console.log('Successfully updated existing students');
    process.exit(0);
  } catch (error) {
    console.error('Error updating students:', error);
    process.exit(1);
  }
}

updateExistingStudents(); 