require('dotenv').config();
const express     = require('express');
const cors        = require('cors');
const helmet      = require('helmet');
const morgan      = require('morgan');
const rateLimit   = require('express-rate-limit');

const authRoutes      = require('./routes/auth');
const leadRoutes      = require('./routes/leads');
const productRoutes   = require('./routes/products');
const messageRoutes   = require('./routes/messages');
const campaignRoutes  = require('./routes/campaigns');
const templateRoutes  = require('./routes/templates');
const reminderRoutes  = require('./routes/reminders');
const webhookRoutes   = require('./routes/webhook');
const analyticsRoutes = require('./routes/analytics');
const catalogueRoutes = require('./routes/catalogue');
const agentRoutes     = require('./routes/agents');

const { startJobs } = require('./jobs');
const { errorHandler } = require('./middleware/errorHandler');

const app = express();

// ── Security & logging ───────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({ origin: '*', methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'] }));
app.use(morgan('dev'));

// ── Rate limiting ────────────────────────────────────────────────────────────
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  message: { error: 'Too many requests. Slow down.' }
});
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many auth attempts.' }
});

app.use(globalLimiter);
app.use('/api/v1/auth', authLimiter);

// ── Body parsing ─────────────────────────────────────────────────────────────
// Webhook needs raw body for signature verification
app.use('/api/v1/webhook', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({
  status: 'ok',
  version: '1.0.0',
  timestamp: new Date().toISOString()
}));

// ── Routes ────────────────────────────────────────────────────────────────────
const base = '/api/v1';
app.use(`${base}/auth`,      authRoutes);
app.use(`${base}/leads`,     leadRoutes);
app.use(`${base}/products`,  productRoutes);
app.use(`${base}/messages`,  messageRoutes);
app.use(`${base}/campaigns`, campaignRoutes);
app.use(`${base}/templates`, templateRoutes);
app.use(`${base}/reminders`, reminderRoutes);
app.use(`${base}/webhook`,   webhookRoutes);
app.use(`${base}/analytics`, analyticsRoutes);
app.use(`${base}/catalogue`, catalogueRoutes);
app.use(`${base}/agents`,    agentRoutes);

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ error: 'Route not found' }));

// ── Error handler ─────────────────────────────────────────────────────────────
app.use(errorHandler);

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🚀  WhatsApp Sales Backend running on port ${PORT}`);
  console.log(`📡  Webhook endpoint: http://localhost:${PORT}/api/v1/webhook`);
  console.log(`❤️   Health:          http://localhost:${PORT}/health\n`);
  startJobs();
});

module.exports = app;
