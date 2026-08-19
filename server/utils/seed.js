require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

const seed = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB for seeding...');

    const existing = await User.findOne({ email: 'admin@ieee-srhu.org' });
    if (existing) {
      console.log('ℹ️  Admin already exists. Skipping seed.');
      process.exit(0);
    }

    const admin = await User.create({
      name: 'IEEE SRH Admin',
      email: 'admin@ieee-srhu.org',

      phone: '9000000000',
      course: 'Administration',
      semester: 1,
      passwordHash: 'Admin@1234',
      role: 'admin'
    });

    console.log('✅ Admin seeded successfully!');
    console.log('   Email    : admin@ieee-srhu.org');
    console.log('   Password : Admin@1234');
    console.log('   Role     : admin');
    process.exit(0);
  } catch (err) {
    console.error('❌ Seeding failed:', err.message);
    process.exit(1);
  }
};

seed();
