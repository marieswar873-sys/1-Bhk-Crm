const express = require('express');
const { v4: uuid } = require('uuid');
const { getDb } = require('../db/schema');
const { authMiddleware, requireRole } = require('../middleware/auth');

const router = express.Router();
const pool = () => getDb();

router.get('/categories', authMiddleware, async (req, res) => {
  const { rows } = await pool().query('SELECT * FROM categories WHERE outlet_id = $1 ORDER BY sort_order', [req.user.outlet_id]);
  res.json(rows);
});

router.post('/categories', authMiddleware, requireRole('admin', 'manager'), async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  const id = uuid();
  await pool().query('INSERT INTO categories (id, name, outlet_id) VALUES ($1, $2, $3)', [id, name, req.user.outlet_id]);
  res.status(201).json({ id, name });
});

router.put('/categories/:id', authMiddleware, requireRole('admin', 'manager'), async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  await pool().query('UPDATE categories SET name = $1 WHERE id = $2 AND outlet_id = $3', [name, req.params.id, req.user.outlet_id]);
  res.json({ success: true });
});

router.delete('/categories/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  const { rows } = await pool().query('SELECT COUNT(*) as c FROM menu_items WHERE category_id = $1', [req.params.id]);
  if (parseInt(rows[0].c) > 0) return res.status(400).json({ error: `Cannot delete: ${rows[0].c} items in this category` });
  await pool().query('DELETE FROM categories WHERE id = $1 AND outlet_id = $2', [req.params.id, req.user.outlet_id]);
  res.json({ success: true });
});

router.get('/items', authMiddleware, async (req, res) => {
  const { rows: items } = await pool().query(`
    SELECT mi.*, c.name as category_name FROM menu_items mi
    JOIN categories c ON mi.category_id = c.id WHERE mi.outlet_id = $1 ORDER BY c.sort_order, mi.name
  `, [req.user.outlet_id]);

  const { rows: variants } = await pool().query(`
    SELECT mv.* FROM menu_variants mv JOIN menu_items mi ON mv.menu_item_id = mi.id WHERE mi.outlet_id = $1
  `, [req.user.outlet_id]);

  const variantMap = {};
  for (const v of variants) {
    if (!variantMap[v.menu_item_id]) variantMap[v.menu_item_id] = [];
    variantMap[v.menu_item_id].push(v);
  }
  res.json(items.map(item => ({ ...item, variants: variantMap[item.id] || [] })));
});

router.post('/items', authMiddleware, requireRole('admin', 'manager'), async (req, res) => {
  const { name, category_id, price, tax_percent, hsn_code, is_veg, packing_charge } = req.body;
  if (!name || !category_id || price == null) return res.status(400).json({ error: 'Name, category, and price required' });
  const id = uuid();
  await pool().query('INSERT INTO menu_items (id, name, category_id, outlet_id, price, tax_percent, hsn_code, is_veg, packing_charge) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
    [id, name, category_id, req.user.outlet_id, price, tax_percent || 5.0, hsn_code || '996331', is_veg != null ? is_veg : 1, packing_charge || 10]);
  res.status(201).json({ id, name, price });
});

router.put('/items/:id', authMiddleware, requireRole('admin', 'manager'), async (req, res) => {
  const { name, price, tax_percent, is_veg, is_available, category_id, packing_charge } = req.body;
  const { rows } = await pool().query('SELECT * FROM menu_items WHERE id = $1 AND outlet_id = $2', [req.params.id, req.user.outlet_id]);
  const item = rows[0];
  if (!item) return res.status(404).json({ error: 'Item not found' });

  await pool().query('UPDATE menu_items SET name=$1, price=$2, tax_percent=$3, is_veg=$4, is_available=$5, category_id=$6, packing_charge=$7 WHERE id=$8',
    [name || item.name, price ?? item.price, tax_percent ?? item.tax_percent, is_veg ?? item.is_veg, is_available ?? item.is_available, category_id || item.category_id, packing_charge ?? item.packing_charge, req.params.id]);
  res.json({ success: true });
});

router.delete('/items/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  await pool().query('DELETE FROM menu_variants WHERE menu_item_id = $1', [req.params.id]);
  await pool().query('DELETE FROM menu_items WHERE id = $1 AND outlet_id = $2', [req.params.id, req.user.outlet_id]);
  res.json({ success: true });
});

router.post('/bulk-upload', authMiddleware, requireRole('admin', 'manager'), async (req, res) => {
  const { items } = req.body;
  if (!items || !items.length) return res.status(400).json({ error: 'No items provided' });

  const p = pool();
  let added = 0, skipped = 0, errors = [];

  for (const row of items) {
    try {
      if (!row.name || !row.category || row.price == null) { skipped++; continue; }

      let { rows: cats } = await p.query('SELECT id FROM categories WHERE name = $1 AND outlet_id = $2', [row.category, req.user.outlet_id]);
      if (!cats.length) {
        const catId = uuid();
        await p.query('INSERT INTO categories (id, name, outlet_id) VALUES ($1, $2, $3)', [catId, row.category, req.user.outlet_id]);
        cats = [{ id: catId }];
      }

      const { rows: existing } = await p.query('SELECT id FROM menu_items WHERE name = $1 AND outlet_id = $2', [row.name, req.user.outlet_id]);
      if (existing.length) {
        await p.query('UPDATE menu_items SET price=$1, category_id=$2, is_veg=$3, tax_percent=$4 WHERE id=$5',
          [parseFloat(row.price), cats[0].id, row.is_veg ? 1 : 0, parseFloat(row.tax_percent) || 5, existing[0].id]);
      } else {
        const itemId = uuid();
        await p.query('INSERT INTO menu_items (id, name, category_id, outlet_id, price, tax_percent, is_veg) VALUES ($1,$2,$3,$4,$5,$6,$7)',
          [itemId, row.name, cats[0].id, req.user.outlet_id, parseFloat(row.price), parseFloat(row.tax_percent) || 5, row.is_veg ? 1 : 0]);

        if (row.variants?.length) {
          for (const v of row.variants) {
            await p.query('INSERT INTO menu_variants (id, menu_item_id, name, price_delta) VALUES ($1,$2,$3,$4)',
              [uuid(), itemId, v.name, parseFloat(v.price_delta) || 0]);
          }
        }
      }
      added++;
    } catch (err) { skipped++; errors.push(`${row.name}: ${err.message}`); }
  }
  res.json({ added, skipped, errors: errors.slice(0, 10) });
});

router.get('/bulk-template', authMiddleware, (req, res) => {
  const csv = `name,category,price,is_veg,tax_percent\nVeg Dum Biryani,Veg Biryani,99,yes,5\nChicken Dum Biryani,Non-Veg Biryani,99,no,5\nDal Tadka,Veg Curries,130,yes,5`;
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=menu_upload_template.csv');
  res.send(csv);
});

module.exports = router;
