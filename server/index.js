require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDb } = require('./db/schema');
const { startDailyReportCron, sendTestReport } = require('./services/emailReport');
const { startSyncService, fullSync, getApiKey } = require('./services/supabaseSync');
const { authMiddleware, requireRole } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3001;

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Rate limiting — prevent brute force
const loginAttempts = {};
app.use('/api/auth/login', (req, res, next) => {
  const ip = req.ip;
  if (!loginAttempts[ip]) loginAttempts[ip] = { count: 0, lastAttempt: 0 };
  const now = Date.now();
  if (now - loginAttempts[ip].lastAttempt > 900000) loginAttempts[ip].count = 0; // Reset after 15 min
  loginAttempts[ip].lastAttempt = now;
  loginAttempts[ip].count++;
  if (loginAttempts[ip].count > 10) return res.status(429).json({ error: 'Too many login attempts. Try again in 15 minutes.' });
  next();
});

initDb();

app.use('/api/auth', require('./routes/auth'));
app.use('/api/menu', require('./routes/menu'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/tables', require('./routes/tables'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/import', require('./routes/csv-import'));
app.use('/api/invoice', require('./routes/invoice'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/public', require('./routes/public'));

app.post('/api/reports/send-daily', authMiddleware, requireRole('admin'), async (req, res) => {
  try { await sendTestReport(); res.json({ success: true, message: "Report sent!" }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/sync/now', authMiddleware, requireRole('admin', 'manager'), async (req, res) => {
  if (!getApiKey()) return res.status(400).json({ error: 'No API key set. Add your Cloud API Key in Settings and save first.' });
  try { await fullSync(); res.json({ success: true, message: 'Sync complete — menu & orders pushed to the cloud.' }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

const clientBuild = path.join(__dirname, '..', 'client', 'build');
app.use(express.static(clientBuild));
app.get('/{*splat}', (req, res) => {
  if (!req.path.startsWith('/api')) res.sendFile(path.join(clientBuild, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`1BHK CRM running on port ${PORT}`);
  startDailyReportCron();
  startSyncService();
});
