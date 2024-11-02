require('dotenv').config();
const mongoose = require('mongoose');
const { createHash } = require('crypto');
const User = require('../src/models/User');

const createAdminUser = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);

    const adminEmail = 'admin@eyelabs.com';
    const adminPassword = 'admin123'; // Change this to a secure password

    const existingAdmin = await User.findOne({ email: adminEmail });
    if (existingAdmin) {
      console.log('Admin user already exists');
      process.exit(0);
    }

    const hashedPassword = createHash('sha256').update(adminPassword).digest('hex');
    const admin = new User({
      name: 'Admin',
      email: adminEmail,
      password: hashedPassword,
      role: 'admin'
    });

    await admin.save();
    console.log('Admin user created successfully');
    process.exit(0);
  } catch (error) {
    console.error('Error creating admin user:', error);
    process.exit(1);
  }
};

createAdminUser(); 