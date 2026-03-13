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

// Trust Render/Vercel proxy — fixes rate-limit X-Forwarded-For warning
app.set('trust proxy', 1);

// ── CORS ─────────────────────────────────────────────────────────────
// Allows ALL vercel.app subdomains + any origin listed in CLIENT_URL
// This handles preview deployments like frontend-9g7q-xxx.vercel.app
function isAllowedOrigin(origin) {
  if (!origin) return true; // curl / mobile app / no-origin requests

  // Always allow any vercel.app subdomain (covers preview + production)
  if (origin.endsWith('.vercel.app')) return true;

  // Always allow any onrender.com subdomain
  if (origin.endsWith('.onrender.com')) return true;

  // Allow localhost for local dev
  if (origin.startsWith('http://localhost')) return true;

  // Allow anything explicitly listed in CLIENT_URL (comma-separated)
  const clientUrl = process.env.CLIENT_URL || '';
  if (clientUrl) {
    const allowed = clientUrl.split(',').map(s => s.trim().replace(/\/$/, ''));
    if (allowed.some(a => origin.replace(/\/$/, '') === a)) return true;
  }

  return false;
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

// ── Socket.IO ─────────────────────────────────────────────────────────
const io = new Server(server, {
  cors: {
    origin(origin, cb) {
      if (isAllowedOrigin(origin)) cb(null, true);
      else cb(new Error('CORS'));
    },
    methods: ['GET', 'POST'],
    credentials: true,
  },
  transports: ['polling', 'websocket'],
  allowEIO3: true,
  pingTimeout: 60000,
  pingInterval: 25000,
});
app.set('io', io);

connectDB();

// ── Middleware ────────────────────────────────────────────────────────
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting — trust proxy must be set above for this to work on Render
const limiter     = rateLimit({ windowMs: 15 * 60 * 1000, max: 500, standardHeaders: true, legacyHeaders: false });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 50,  standardHeaders: true, legacyHeaders: false });
app.use('/api/', limiter);
app.use('/api/auth/login', authLimiter);

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/api/auth',          require('./routes/auth'));
app.use('/api/reports',       require('./routes/reports'));
app.use('/api/sightings',     require('./routes/sightings'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/users',         require('./routes/users'));
app.use('/api/push',          require('./routes/push'));
app.use('/api/debug',         require('./routes/debug')); // TEMP — remove after fix
app.get('/api/health', (_req, res) => res.json({ status: 'ok', ts: Date.now() }));

// ── Socket events ─────────────────────────────────────────────────────
io.on('connection', (socket) => {
  socket.on('authenticate', (userId) => {
    if (!userId) return;
    socket.join(`user_${userId}`);
    socket.join('all_users');
    socket.data.userId = userId;
  });
  socket.on('join_admin', () => socket.join('admins'));
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
  console.log(`✅ MPAS running on port ${PORT}`);
  console.log(`   CLIENT_URL: ${process.env.CLIENT_URL || '(not set — allowing all vercel.app origins)'}`);
  console.log(`   EMAIL: ${process.env.EMAIL_USER ? '✅ ' + process.env.EMAIL_USER : '❌ NOT SET — add EMAIL_USER + EMAIL_PASS in Render Environment tab'}`);
});
