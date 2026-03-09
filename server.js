require('dotenv').config();
const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const cors       = require('cors');
const helmet     = require('helmet');
const morgan     = require('morgan');
const rateLimit  = require('express-rate-limit');
const path       = require('path');
const connectDB  = require('./config/db');

const app    = express();
const server = http.createServer(app);
const PORT   = process.env.PORT || 5000;

// ─────────────────────────────────────────────────────────────────────
// CORS
// Set CLIENT_URL on Render to your Vercel URL, e.g.:
//   CLIENT_URL=https://mpas.vercel.app
// Comma-separate multiple origins if needed:
//   CLIENT_URL=https://mpas.vercel.app,https://mpas-git-main.vercel.app
// Leave empty to allow ALL origins (fine for development).
// ─────────────────────────────────────────────────────────────────────
function isAllowedOrigin(origin) {
  if (!origin) return true;                          // curl / mobile native
  const clientUrl = process.env.CLIENT_URL || '';
  if (!clientUrl) return true;                       // nothing configured → open
  return clientUrl
    .split(',')
    .map(s => s.trim().replace(/\/$/, ''))           // strip trailing slash
    .some(allowed => origin.replace(/\/$/, '') === allowed);
}

const corsOptions = {
  origin(origin, cb) {
    if (isAllowedOrigin(origin)) cb(null, true);
    else {
      console.warn('CORS blocked:', origin);
      cb(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

// ─────────────────────────────────────────────────────────────────────
// Socket.IO
// Render free tier: WebSocket connections time-out after ~55s idle.
// We start with polling so it ALWAYS works, then upgrade to WS if possible.
// ─────────────────────────────────────────────────────────────────────
const io = new Server(server, {
  cors: {
    origin(origin, cb) { if (isAllowedOrigin(origin)) cb(null, true); else cb(new Error('CORS')); },
    methods: ['GET', 'POST'],
    credentials: true,
  },
  transports: ['polling', 'websocket'],   // polling first → always works
  allowEIO3: true,
  pingTimeout: 60000,
  pingInterval: 25000,
});
app.set('io', io);

connectDB();

// Email status is logged by config/email.js on startup

// ─────────────────────────────────────────────────────────────────────
// Middleware
// ─────────────────────────────────────────────────────────────────────
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));          // handle preflight for ALL routes
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

const limiter     = rateLimit({ windowMs: 15 * 60 * 1000, max: 500 });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 50 });
app.use('/api/', limiter);
app.use('/api/auth/login', authLimiter);

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/api/auth',          require('./routes/auth'));
app.use('/api/reports',       require('./routes/reports'));
app.use('/api/sightings',     require('./routes/sightings'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/users',         require('./routes/users'));
app.get('/api/health', (_req, res) => res.json({ status: 'ok', ts: Date.now() }));

// ─────────────────────────────────────────────────────────────────────
// Socket events
// ─────────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  socket.on('authenticate', (userId) => {
    if (!userId) return;
    socket.join(`user_${userId}`);
    socket.join('all_users');
    socket.data.userId = userId;
  });

  socket.on('join_admin', () => socket.join('admins'));

  // Save user's GPS location to DB so proximity alerts work
  socket.on('update_location', async ({ userId, lat, lng }) => {
    if (!userId || lat == null || lng == null) return;
    try {
      const User = require('./models/User');
      await User.findByIdAndUpdate(userId, {
        location: { type: 'Point', coordinates: [parseFloat(lng), parseFloat(lat)] },
      });
    } catch (e) { console.warn('update_location error:', e.message); }
  });
});

app.use((err, _req, res, _next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, message: err.message || 'Server error' });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n✅ MPAS running on port ${PORT}`);
  console.log(`   CLIENT_URL: ${process.env.CLIENT_URL || '(open — all origins allowed)'}\n`);
});
