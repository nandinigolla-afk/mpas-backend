
require('dotenv').config();
const express = require('express');
const cors=require("cors");
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');
const connectDB = require('./config/db');

const app = express();
app.use(cors({
    origin:"https://frontend-9g7q.vercel.app",
    credentials:true;
    }));
app.use(express.json());
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: process.env.CLIENT_URL || 'http://localhost:3000', methods: ['GET','POST'], credentials: true }
});
app.set('io', io);

connectDB();

// ── Email config check ──────────────────────────────────────────────
const hasEmail = !!(process.env.EMAIL_USER || process.env.SMTP_HOST);
if (!hasEmail) {
  console.log('');
  console.log('⚠️  ─────────────────────────────────────────────────────');
  console.log('   EMAIL NOT CONFIGURED — alerts will print to console only.');
  console.log('   To enable real emails:');
  console.log('   1. Copy backend/.env.example  →  backend/.env');
  console.log('   2. Fill in EMAIL_USER and EMAIL_PASS (Gmail App Password)');
  console.log('   3. Restart the server');
  console.log('⚠️  ─────────────────────────────────────────────────────');
  console.log('');
}


app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:3000', credentials: true }));
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 500 });
app.use('/api/', limiter);
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 50 });
app.use('/api/auth/login', authLimiter);

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/sightings', require('./routes/sightings'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/users', require('./routes/users'));
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

io.on('connection', (socket) => {
  socket.on('authenticate', (userId) => {
    socket.join(`user_${userId}`);
    socket.join('all_users');
  });
  socket.on('join_admin', () => socket.join('admins'));
  socket.on('update_location', async ({ userId, lat, lng }) => {
    try {
      const User = require('./models/User');
      await User.findByIdAndUpdate(userId, { location: { type: 'Point', coordinates: [lng, lat] } });
    } catch(e) {}
  });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, message: err.message || 'Server error' });
});

const PORT = process.env.PORT || 5000;

// Handle port in use gracefully
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n❌ Port ${PORT} is already in use!\n`);
    console.error('Run this to fix it:');
    console.error(`  kill -9 $(lsof -ti:${PORT})   # Linux/Mac`);
    console.error(`  netstat -ano | findstr :${PORT}  # Windows\n`);
    process.exit(1);
  }
});

server.listen(PORT, () => console.log(`✅ MPAS Server running on port ${PORT}`));
