const express = require('express');
const { getDb } = require('../db/schema');
const router = express.Router();

router.get('/settings', (req, res) => {
  const db = getDb(); const outlet = db.prepare('SELECT * FROM outlets LIMIT 1').get();
  if (!outlet) return res.json({});
  const rows = db.prepare('SELECT key, value FROM settings WHERE outlet_id=?').all(outlet.id);
  const s = {}; for (const r of rows) s[r.key]=r.value;
  res.json({ outlet_name:s.outlet_name||outlet.name||'1BHK Kitchen', outlet_address:s.outlet_address||outlet.address||'', outlet_phone:s.outlet_phone||outlet.phone||'', outlet_gstin:s.outlet_gstin||'', outlet_fssai:s.outlet_fssai||'', company_email:s.company_email||'', whatsapp_number:s.whatsapp_number||s.outlet_phone||'', operating_hours:s.operating_hours||'{}', service_areas:s.service_areas||'', about_text:s.about_text||'', social_instagram:s.social_instagram||'', social_facebook:s.social_facebook||'', hero_tagline:s.hero_tagline||'', hero_subtitle:s.hero_subtitle||'', gst_enabled:s.gst_enabled||'true' });
});

router.get('/menu', (req, res) => {
  const db = getDb(); const outlet = db.prepare('SELECT * FROM outlets LIMIT 1').get();
  if (!outlet) return res.json({ categories:[], items:[] });
  const categories = db.prepare('SELECT id,name,sort_order FROM categories WHERE outlet_id=? ORDER BY sort_order').all(outlet.id);
  const items = db.prepare('SELECT mi.id,mi.name,mi.price,mi.tax_percent,mi.is_veg,mi.is_available,mi.category_id,c.name as category_name FROM menu_items mi JOIN categories c ON mi.category_id=c.id WHERE mi.outlet_id=? AND mi.is_available=1 ORDER BY c.sort_order,mi.name').all(outlet.id);
  const variants = db.prepare('SELECT mv.id,mv.menu_item_id,mv.name,mv.price_delta FROM menu_variants mv JOIN menu_items mi ON mv.menu_item_id=mi.id WHERE mi.outlet_id=? AND mi.is_available=1').all(outlet.id);
  const vm = {}; for (const v of variants) { if (!vm[v.menu_item_id]) vm[v.menu_item_id]=[]; vm[v.menu_item_id].push(v); }
  res.json({ categories, items: items.map(i => ({ ...i, variants: vm[i.id]||[] })) });
});

module.exports = router;
