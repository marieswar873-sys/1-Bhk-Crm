const express = require('express');
const { getDb } = require('../db/schema');

const router = express.Router();

// Public settings (no auth) — for website
router.get('/settings', (req, res) => {
  const db = getDb();
  const outlet = db.prepare('SELECT * FROM outlets LIMIT 1').get();
  if (!outlet) return res.json({});

  const rows = db.prepare('SELECT key, value FROM settings WHERE outlet_id = ?').all(outlet.id);
  const settings = {};
  for (const r of rows) settings[r.key] = r.value;

  res.json({
    outlet_name: settings.outlet_name || outlet.name || '1BHK Kitchen',
    outlet_address: settings.outlet_address || outlet.address || '',
    outlet_phone: settings.outlet_phone || outlet.phone || '',
    outlet_gstin: settings.outlet_gstin || outlet.gstin || '',
    outlet_fssai: settings.outlet_fssai || outlet.fssai_no || '',
    company_email: settings.company_email || '',
    whatsapp_number: settings.whatsapp_number || settings.outlet_phone || '',
    operating_hours: settings.operating_hours || '{}',
    service_areas: settings.service_areas || '',
    about_text: settings.about_text || '',
    social_instagram: settings.social_instagram || '',
    social_facebook: settings.social_facebook || '',
    social_youtube: settings.social_youtube || '',
    hero_tagline: settings.hero_tagline || 'Authentic Hyderabadi Dum Biryani',
    hero_subtitle: settings.hero_subtitle || '',
    gst_enabled: settings.gst_enabled || 'true',
  });
});

// Public menu (no auth) — for website
router.get('/menu', (req, res) => {
  const db = getDb();
  const outlet = db.prepare('SELECT * FROM outlets LIMIT 1').get();
  if (!outlet) return res.json({ categories: [], items: [] });

  const categories = db.prepare('SELECT id, name, sort_order FROM categories WHERE outlet_id = ? ORDER BY sort_order').all(outlet.id);

  const items = db.prepare(`
    SELECT mi.id, mi.name, mi.price, mi.tax_percent, mi.is_veg, mi.is_available, mi.category_id, c.name as category_name
    FROM menu_items mi JOIN categories c ON mi.category_id = c.id
    WHERE mi.outlet_id = ? AND mi.is_available = 1
    ORDER BY c.sort_order, mi.name
  `).all(outlet.id);

  const variants = db.prepare(`
    SELECT mv.id, mv.menu_item_id, mv.name, mv.price_delta
    FROM menu_variants mv JOIN menu_items mi ON mv.menu_item_id = mi.id
    WHERE mi.outlet_id = ? AND mi.is_available = 1
  `).all(outlet.id);

  const variantMap = {};
  for (const v of variants) {
    if (!variantMap[v.menu_item_id]) variantMap[v.menu_item_id] = [];
    variantMap[v.menu_item_id].push(v);
  }

  res.json({
    categories,
    items: items.map(item => ({
      ...item,
      variants: variantMap[item.id] || []
    }))
  });
});

module.exports = router;
