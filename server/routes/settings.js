const express = require('express');
const { v4: uuid } = require('uuid');
const { getDb } = require('../db/schema');
const { authMiddleware, requireRole } = require('../middleware/auth');
const router = express.Router();
const DEFAULTS = { gst_enabled:'true', gst_percent:'5', packing_charges:'10', packing_enabled:'true', outlet_name:'1BHK Kitchen', outlet_address:'', outlet_phone:'', outlet_gstin:'', outlet_fssai:'', company_email:'1bhkkitchen@gmail.com', partner_emails:'[]', daily_report_enabled:'true', daily_report_time:'06:00', whatsapp_number:'', operating_hours:'{"mon-sat":"11:00 AM - 10:00 PM","sun":"12:00 PM - 9:00 PM"}', service_areas:'', about_text:'1BHK Kitchen — Best Hyderabadi Kitchen.', social_instagram:'', social_facebook:'', social_youtube:'', hero_tagline:'Authentic Hyderabadi Dum Biryani', hero_subtitle:'Crafted with love, served with pride.', cloud_api_key:'', cloud_api_url:'https://saas-7i5z.onrender.com', logo_url:'', bill_printer:'', kot_printer:'', paper_width:'80', bill_mode:'escpos', kot_mode:'escpos', swiggy_email:'8073978595', swiggy_password:'', zomato_email:'sadhanafoodss@gmail.com' };

router.get('/', authMiddleware, (req, res) => {
  const rows = getDb().prepare('SELECT key, value FROM settings WHERE outlet_id=?').all(req.user.outlet_id);
  const s = { ...DEFAULTS }; for (const r of rows) s[r.key]=r.value;
  res.json(s);
});
router.put('/', authMiddleware, requireRole('admin','manager'), (req, res) => {
  try {
    const db = getDb();
    const outlet_id = req.user.outlet_id;
    if (!outlet_id) return res.status(400).json({ error: 'No outlet_id on user — please log out and log in again.' });

    // Verify the outlet exists
    const outlet = db.prepare('SELECT id FROM outlets WHERE id = ?').get(outlet_id);
    if (!outlet) return res.status(400).json({ error: `Outlet not found (${outlet_id}) — DB may have been reset. Please log out and log in again.` });

    const upsert = db.prepare('INSERT INTO settings (id,outlet_id,key,value) VALUES (?,?,?,?) ON CONFLICT(outlet_id,key) DO UPDATE SET value=excluded.value');
    let saved = 0;
    db.transaction(() => {
      for (const [k, v] of Object.entries(req.body)) {
        if (DEFAULTS.hasOwnProperty(k)) {
          upsert.run(uuid(), outlet_id, k, String(v ?? ''));
          saved++;
        }
      }
    })();
    console.log(`[Settings] Saved ${saved} keys for outlet ${outlet_id}`);
    res.json({ success: true, saved });
  } catch (err) {
    console.error('[Settings PUT error]', err.message);
    res.status(500).json({ error: err.message });
  }
});
module.exports = router;
