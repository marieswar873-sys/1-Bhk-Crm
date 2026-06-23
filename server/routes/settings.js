const express = require('express');
const { v4: uuid } = require('uuid');
const { getDb } = require('../db/schema');
const { authMiddleware, requireRole } = require('../middleware/auth');

const router = express.Router();

const DEFAULTS = {
  gst_enabled: 'true',
  gst_percent: '5',
  packing_charges: '10',
  packing_enabled: 'true',
  outlet_name: '1BHK Kitchen',
  outlet_address: '',
  outlet_phone: '',
  outlet_gstin: '',
  outlet_fssai: '',
  company_email: '1bhkkitchen@gmail.com',
  partner_emails: '[]',
  daily_report_enabled: 'true',
  daily_report_time: '23:00',
  whatsapp_number: '',
  operating_hours: '{"mon-sat": "11:00 AM - 10:00 PM", "sun": "12:00 PM - 9:00 PM"}',
  service_areas: '',
  about_text: '1BHK Kitchen — Best Hyderabadi Kitchen. We serve authentic Hyderabadi Dum Biryani, flavorful curries, and more. Takeaway & Delivery.',
  social_instagram: '',
  social_facebook: '',
  social_youtube: '',
  hero_tagline: 'Authentic Hyderabadi Dum Biryani',
  hero_subtitle: 'Crafted with love, served with pride. Experience the royal taste of Hyderabad.',
};

router.get('/', authMiddleware, (req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT key, value FROM settings WHERE outlet_id = ?').all(req.user.outlet_id);
  const settings = { ...DEFAULTS };
  for (const row of rows) settings[row.key] = row.value;
  res.json(settings);
});

router.put('/', authMiddleware, requireRole('admin', 'manager'), (req, res) => {
  const db = getDb();
  const upsert = db.prepare(`INSERT INTO settings (id, outlet_id, key, value) VALUES (?, ?, ?, ?)
    ON CONFLICT(outlet_id, key) DO UPDATE SET value = excluded.value`);

  const tx = db.transaction(() => {
    for (const [key, value] of Object.entries(req.body)) {
      if (DEFAULTS.hasOwnProperty(key)) {
        upsert.run(uuid(), req.user.outlet_id, key, String(value));
      }
    }
  });
  tx();
  res.json({ success: true });
});

module.exports = router;
