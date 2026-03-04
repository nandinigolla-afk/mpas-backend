require('dotenv').config();
const connectDB = require('./config/db');

async function seed() {
  await connectDB();
  const User = require('./models/User');
  const existing = await User.findOne({ email: 'admin@mpas.com' });
  if (!existing) {
    await User.create({ name: 'Admin User', email: 'admin@mpas.com', password: 'admin123', role: 'admin' });
    console.log('Admin created: admin@mpas.com / admin123');
  } else {
    console.log('Admin already exists');
  }
  process.exit(0);
}
seed().catch(console.error);
