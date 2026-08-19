require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

const fixAdmin = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB...');

    // Delete both old and new admin if they exist
    await User.deleteMany({ role: 'admin' });
    console.log('🗑  Old admin deleted.');

    // Create fresh admin with correct email
    await User.create({
      name: 'IEEE SRHU Admin',
      email: 'admin@ieee-srhu.org',
      enrollmentNo: 'ADMIN001',
      phone: '9000000000',
      course: 'Administration',
      semester: 1,
      passwordHash: 'Admin@1234',
      role: 'admin'
    });

    console.log('✅ Admin re-created successfully!');
    console.log('   Email    : admin@ieee-srhu.org');
    console.log('   Password : Admin@1234');
    process.exit(0);
  } catch (err) {
    console.error('❌ Fix failed:', err.message);
    process.exit(1);
  }
};

fixAdmin();
