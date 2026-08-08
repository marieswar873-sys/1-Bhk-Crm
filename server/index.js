require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDb, getDb } = require('./db/schema');
const { startDailyReportCron, sendTestReport } = require('./services/emailReport');
const { startSyncService, fullSync, getApiKey, restoreFromCloud } = require('./services/supabaseSync');
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

// Activation — check if API key is set, validate+save a new one (no auth required)
app.get('/api/activation/status', (req, res) => {
  const row = getDb().prepare("SELECT value FROM settings WHERE key='cloud_api_key' LIMIT 1").get();
  res.json({ activated: !!(row?.value) });
});

app.post('/api/activation/activate', async (req, res) => {
  const { apiKey } = req.body;
  if (!apiKey) return res.status(400).json({ error: 'API key required' });
  const { getDb } = require('./db/schema');
  const { v4: uuid } = require('uuid');
  const SAAS_URL = process.env.SAAS_API_URL || 'https://saas-7i5z.onrender.com';
  let machineId = 'unknown';
  try { machineId = require('../license').machineId(); } catch {}
  try {
    const r = await fetch(`${SAAS_URL}/api/sync/validate`, {
      headers: { 'X-API-Key': apiKey, 'X-Machine-ID': machineId }
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return res.status(r.status).json({ error: data.error || 'Invalid key' });
    if (!data.active) return res.status(403).json({ error: 'This restaurant account is not active.' });

    const db = getDb();
    const outlet = db.prepare('SELECT id FROM outlets LIMIT 1').get();
    if (!outlet) return res.status(500).json({ error: 'No outlet found' });
    db.prepare("INSERT INTO settings (id,outlet_id,key,value) VALUES (?,?,?,?) ON CONFLICT(outlet_id,key) DO UPDATE SET value=excluded.value")
      .run(uuid(), outlet.id, 'cloud_api_key', apiKey);

    fullSync().catch(() => {});
    res.json({ success: true, name: data.name });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

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

app.post('/api/sync/restore', authMiddleware, requireRole('admin', 'manager'), async (req, res) => {
  if (!getApiKey()) return res.status(400).json({ error: 'No API key set. Add your Cloud API Key in Settings and save first.' });
  try { const c = await restoreFromCloud(); res.json({ success: true, message: `Restored ${c.items} items and ${c.categories} categories from the cloud.` }); }
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
