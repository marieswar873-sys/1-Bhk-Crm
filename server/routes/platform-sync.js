const express = require('express');
const { getDb } = require('../db/schema');
const { authMiddleware, requireRole } = require('../middleware/auth');
const router = express.Router();

// Ensure tables exist
function ensureTables() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS platform_sales (
      id TEXT PRIMARY KEY, outlet_id TEXT NOT NULL,
      platform TEXT NOT NULL CHECK(platform IN ('swiggy','zomato')),
      date TEXT NOT NULL, orders INTEGER DEFAULT 0,
      gross_revenue REAL DEFAULT 0, commission REAL DEFAULT 0,
      packing_charges REAL DEFAULT 0, taxes_withheld REAL DEFAULT 0,
      net_payout REAL DEFAULT 0, raw_data TEXT,
      scraped_at TEXT DEFAULT (datetime('now')),
      UNIQUE(outlet_id, platform, date)
    );
    CREATE TABLE IF NOT EXISTS platform_sessions (
      id TEXT PRIMARY KEY, outlet_id TEXT NOT NULL,
      platform TEXT NOT NULL CHECK(platform IN ('swiggy','zomato')),
      cookies TEXT, last_login TEXT,
      UNIQUE(outlet_id, platform)
    );
  `);
}

// GET /api/platform/sales — last 30 days of platform data
router.get('/sales', authMiddleware, (req, res) => {
  try {
    ensureTables();
    const rows = getDb().prepare('SELECT * FROM platform_sales WHERE outlet_id=? ORDER BY date DESC LIMIT 60').all(req.user.outlet_id);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/platform/summary — today's totals by platform
router.get('/summary', authMiddleware, (req, res) => {
  try {
    ensureTables();
    const today = new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const rows = getDb().prepare('SELECT platform, orders, gross_revenue, commission, net_payout, scraped_at FROM platform_sales WHERE outlet_id=? AND date=?').all(req.user.outlet_id, today);
    res.json({ date: today, platforms: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/platform/scrape — trigger a scrape (handled via IPC in Electron)
// In web/server-only mode this route just returns instructions
router.post('/scrape', authMiddleware, requireRole('admin', 'manager'), (req, res) => {
  const { platform } = req.body;
  if (!platform || !['swiggy', 'zomato'].includes(platform)) return res.status(400).json({ error: 'Invalid platform' });
  // Signal the Electron main process via a global flag
  global.pendingScrape = { platform, userId: req.user.id };
  res.json({ success: true, message: `${platform} scrape triggered. Check the app for OTP prompt.` });
});

// POST /api/platform/otp — user submits OTP from the UI
router.post('/otp', authMiddleware, (req, res) => {
  const { otp, platform } = req.body;
  if (!otp) return res.status(400).json({ error: 'OTP required' });
  // Resolve the pending OTP promise
  if (platform === 'swiggy') {
    const { resolveOtp } = require('../services/swiggy-scraper');
    resolveOtp(String(otp));
  } else if (platform === 'zomato') {
    const { resolveOtp } = require('../services/zomato-scraper');
    resolveOtp(String(otp));
  }
  res.json({ success: true });
});

module.exports = router;
