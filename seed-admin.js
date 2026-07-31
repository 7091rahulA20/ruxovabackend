/**
 * RUXOVA PERFUMES — Admin Seed Script
 * Creates the admin user from .env credentials if it doesn't already exist.
 *
 * Usage:  node seed-admin.js
 */

const dotenv = require('dotenv');
const mongoose = require('mongoose');

dotenv.config();

const User = require('./models/User.model');

async function seedAdmin() {
  try {
    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');

    const email = (process.env.ADMIN_EMAIL || 'admin@ruxova.com').toLowerCase();
    const password = process.env.ADMIN_PASSWORD || 'Admin@123';

    const existing = await User.findOne({ email });
    if (existing) {
      console.log(`ℹ️  Admin user already exists: ${email} (role: ${existing.role})`);

      // Ensure existing user has admin role
      if (existing.role !== 'admin') {
        existing.role = 'admin';
        await existing.save();
        console.log('✅ Updated existing user role to admin');
      }
    } else {
      await User.create({
        name: 'Admin',
        email,
        password,
        role: 'admin',
        isActive: true,
      });
      console.log(`✅ Admin user created: ${email}`);
    }

    console.log('\n🌹 Admin credentials:');
    console.log(`   Email:    ${email}`);
    console.log(`   Password: ${password}`);
  } catch (err) {
    console.error('❌ Seed failed:', err.message);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
    process.exit(0);
  }
}

seedAdmin();
