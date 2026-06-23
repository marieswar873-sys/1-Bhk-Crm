const express = require('express');
const { v4: uuid } = require('uuid');
const { getDb } = require('../db/schema');
const { authMiddleware, requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/categories', authMiddleware, (req, res) => {
  const db = getDb();
  const categories = db.prepare('SELECT * FROM categories WHERE outlet_id = ? ORDER BY sort_order').all(req.user.outlet_id);
  res.json(categories);
});

router.post('/categories', authMiddleware, requireRole('admin', 'manager'), (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });

  const db = getDb();
  const id = uuid();
  db.prepare('INSERT INTO categories (id, name, outlet_id) VALUES (?, ?, ?)').run(id, name, req.user.outlet_id);
  res.status(201).json({ id, name });
});

router.get('/items', authMiddleware, (req, res) => {
  const db = getDb();
  const items = db.prepare(`
    SELECT mi.*, c.name as category_name
    FROM menu_items mi
    JOIN categories c ON mi.category_id = c.id
    WHERE mi.outlet_id = ?
    ORDER BY c.sort_order, mi.name
  `).all(req.user.outlet_id);

  const variants = db.prepare(`
    SELECT mv.* FROM menu_variants mv
    JOIN menu_items mi ON mv.menu_item_id = mi.id
    WHERE mi.outlet_id = ?
  `).all(req.user.outlet_id);

  const variantMap = {};
  for (const v of variants) {
    if (!variantMap[v.menu_item_id]) variantMap[v.menu_item_id] = [];
    variantMap[v.menu_item_id].push(v);
  }

  res.json(items.map(item => ({ ...item, variants: variantMap[item.id] || [] })));
});

router.post('/items', authMiddleware, requireRole('admin', 'manager'), (req, res) => {
  const { name, category_id, price, tax_percent, hsn_code, is_veg } = req.body;
  if (!name || !category_id || price == null) {
    return res.status(400).json({ error: 'Name, category, and price required' });
  }

  const db = getDb();
  const id = uuid();
  db.prepare(`INSERT INTO menu_items (id, name, category_id, outlet_id, price, tax_percent, hsn_code, is_veg) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
    id, name, category_id, req.user.outlet_id, price, tax_percent || 5.0, hsn_code || '996331', is_veg != null ? is_veg : 1
  );
  res.status(201).json({ id, name, price });
});

router.put('/items/:id', authMiddleware, requireRole('admin', 'manager'), (req, res) => {
  const { name, price, tax_percent, is_veg, is_available, category_id, packing_charge } = req.body;
  const db = getDb();

  const item = db.prepare('SELECT * FROM menu_items WHERE id = ? AND outlet_id = ?').get(req.params.id, req.user.outlet_id);
  if (!item) return res.status(404).json({ error: 'Item not found' });

  db.prepare(`UPDATE menu_items SET name=?, price=?, tax_percent=?, is_veg=?, is_available=?, category_id=?, packing_charge=? WHERE id=?`).run(
    name || item.name, price ?? item.price, tax_percent ?? item.tax_percent,
    is_veg ?? item.is_veg, is_available ?? item.is_available, category_id || item.category_id,
    packing_charge ?? item.packing_charge, req.params.id
  );
  res.json({ success: true });
});

router.delete('/items/:id', authMiddleware, requireRole('admin'), (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM menu_variants WHERE menu_item_id = ?').run(req.params.id);
  db.prepare('DELETE FROM menu_items WHERE id = ? AND outlet_id = ?').run(req.params.id, req.user.outlet_id);
  res.json({ success: true });
});

// Bulk upload menu items
router.post('/bulk-upload', authMiddleware, requireRole('admin', 'manager'), (req, res) => {
  const { items } = req.body;
  if (!items || !items.length) return res.status(400).json({ error: 'No items provided' });

  const db = getDb();
  let added = 0, skipped = 0, errors = [];

  const tx = db.transaction(() => {
    for (const row of items) {
      try {
        if (!row.name || !row.category || row.price == null) {
          skipped++;
          errors.push(`Missing fields: ${row.name || 'unnamed'}`);
          continue;
        }

        // Find or create category
        let cat = db.prepare('SELECT id FROM categories WHERE name = ? AND outlet_id = ?').get(row.category, req.user.outlet_id);
        if (!cat) {
          const catId = uuid();
          db.prepare('INSERT INTO categories (id, name, outlet_id) VALUES (?, ?, ?)').run(catId, row.category, req.user.outlet_id);
          cat = { id: catId };
        }

        // Check duplicate
        const existing = db.prepare('SELECT id FROM menu_items WHERE name = ? AND outlet_id = ?').get(row.name, req.user.outlet_id);
        if (existing) {
          // Update existing
          db.prepare('UPDATE menu_items SET price = ?, category_id = ?, is_veg = ?, tax_percent = ? WHERE id = ?').run(
            parseFloat(row.price), cat.id, row.is_veg != null ? (row.is_veg ? 1 : 0) : 1,
            parseFloat(row.tax_percent) || 5, existing.id
          );
          // Update variants if provided
          if (row.variants && row.variants.length) {
            db.prepare('DELETE FROM menu_variants WHERE menu_item_id = ?').run(existing.id);
            for (const v of row.variants) {
              db.prepare('INSERT INTO menu_variants (id, menu_item_id, name, price_delta) VALUES (?, ?, ?, ?)').run(
                uuid(), existing.id, v.name, parseFloat(v.price_delta) || 0
              );
            }
          }
          added++;
          continue;
        }

        const itemId = uuid();
        db.prepare('INSERT INTO menu_items (id, name, category_id, outlet_id, price, tax_percent, is_veg) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
          itemId, row.name, cat.id, req.user.outlet_id, parseFloat(row.price), parseFloat(row.tax_percent) || 5, row.is_veg != null ? (row.is_veg ? 1 : 0) : 1
        );

        if (row.variants && row.variants.length) {
          for (const v of row.variants) {
            db.prepare('INSERT INTO menu_variants (id, menu_item_id, name, price_delta) VALUES (?, ?, ?, ?)').run(
              uuid(), itemId, v.name, parseFloat(v.price_delta) || 0
            );
          }
        }
        added++;
      } catch (err) {
        skipped++;
        errors.push(`${row.name}: ${err.message}`);
      }
    }
  });

  try {
    tx();
    res.json({ added, skipped, errors: errors.slice(0, 10) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Sample template download
router.get('/bulk-template', authMiddleware, (req, res) => {
  const csv = `name,category,price,is_veg,tax_percent,variant1_name,variant1_price,variant2_name,variant2_price,variant3_name,variant3_price
Veg Dum Biryani,Veg Biryani,99,yes,5,650 ml,99,750 ml,149,1000 ml,199
Chicken Dum Biryani,Non-Veg Biryani,99,no,5,650 ml,99,750 ml,149,1000 ml,199
Dal Tadka,Veg Curries,130,yes,5,,,,,,
Butter Chicken,Non-Veg Curries,320,no,5,,,,,,`;
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=menu_upload_template.csv');
  res.send(csv);
});

// Update category
router.put('/categories/:id', authMiddleware, requireRole('admin', 'manager'), (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  const db = getDb();
  db.prepare('UPDATE categories SET name = ? WHERE id = ? AND outlet_id = ?').run(name, req.params.id, req.user.outlet_id);
  res.json({ success: true });
});

// Delete category
router.delete('/categories/:id', authMiddleware, requireRole('admin'), (req, res) => {
  const db = getDb();
  const items = db.prepare('SELECT COUNT(*) as c FROM menu_items WHERE category_id = ?').get(req.params.id);
  if (items.c > 0) return res.status(400).json({ error: `Cannot delete: ${items.c} items in this category` });
  db.prepare('DELETE FROM categories WHERE id = ? AND outlet_id = ?').run(req.params.id, req.user.outlet_id);
  res.json({ success: true });
});

module.exports = router;
