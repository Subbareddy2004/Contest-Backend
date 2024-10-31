const mongoose = require('mongoose');
require('dotenv').config();

async function fixRegNumberIndex() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Get the users collection
    const collection = mongoose.connection.collection('users');

    // Drop the existing index if it exists
    try {
      await collection.dropIndex('regNumber_1');
      console.log('Dropped existing regNumber index');
    } catch (error) {
      console.log('No existing index to drop');
    }

    // Create new index with partial filter expression
    await collection.createIndex(
      { regNumber: 1 },
      { 
        unique: true, 
        sparse: true,
        partialFilterExpression: { regNumber: { $type: "string" } }
      }
    );
    console.log('Created new regNumber index');

    // Update existing faculty users to have undefined regNumber
    await collection.updateMany(
      { role: 'faculty' },
      { $unset: { regNumber: "" } }
    );
    console.log('Updated faculty users');

    console.log('Migration completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await mongoose.disconnect();
  }
}

// Run the migration
fixRegNumberIndex(); 