const express = require('express');
const { v4: uuid } = require('uuid');
const { getDb } = require('../db/schema');
const { authMiddleware, requireRole } = require('../middleware/auth');
const router = express.Router();
const pool = () => getDb();

router.post('/zomato', authMiddleware, requireRole('admin', 'manager'), async (req, res) => {
  const { orders } = req.body;
  if (!orders || !orders.length) return res.status(400).json({ error: 'No orders provided' });
  const importId = uuid(); let imported = 0;
  for (const row of orders) {
    const { rows } = await pool().query('SELECT id FROM orders WHERE platform_order_id = $1 AND order_type = $2', [row.order_id, 'zomato']);
    if (rows.length) continue;
    const orderId = uuid();
    const { rows: countRows } = await pool().query("SELECT COUNT(*)::int as c FROM orders WHERE outlet_id = $1", [req.user.outlet_id]);
    const orderNumber = `ZOM-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${String(parseInt(countRows[0].c)+1).padStart(4,'0')}`;
    await pool().query(`INSERT INTO orders (id, outlet_id, order_number, order_type, customer_name, subtotal, tax_amount, total, payment_method, payment_status, platform_order_id, platform_commission, status, notes)
      VALUES ($1,$2,$3,'zomato',$4,$5,$6,$7,'platform','paid',$8,$9,'completed',$10)`,
      [orderId, req.user.outlet_id, orderNumber, row.customer_name||'Zomato', parseFloat(row.subtotal)||0, parseFloat(row.tax)||0, parseFloat(row.total)||0, row.order_id, parseFloat(row.commission)||0, row.items_text||null]);
    imported++;
  }
  await pool().query('INSERT INTO csv_imports (id, platform, filename, records_imported, imported_by) VALUES ($1,$2,$3,$4,$5)', [importId, 'zomato', 'manual', imported, req.user.id]);
  res.json({ import_id: importId, records_imported: imported });
});

router.post('/swiggy', authMiddleware, requireRole('admin', 'manager'), async (req, res) => {
  const { orders } = req.body;
  if (!orders || !orders.length) return res.status(400).json({ error: 'No orders provided' });
  const importId = uuid(); let imported = 0;
  for (const row of orders) {
    const { rows } = await pool().query('SELECT id FROM orders WHERE platform_order_id = $1 AND order_type = $2', [row.order_id, 'swiggy']);
    if (rows.length) continue;
    const orderId = uuid();
    const { rows: countRows } = await pool().query("SELECT COUNT(*)::int as c FROM orders WHERE outlet_id = $1", [req.user.outlet_id]);
    const orderNumber = `SWG-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${String(parseInt(countRows[0].c)+1).padStart(4,'0')}`;
    await pool().query(`INSERT INTO orders (id, outlet_id, order_number, order_type, customer_name, subtotal, tax_amount, total, payment_method, payment_status, platform_order_id, platform_commission, status, notes)
      VALUES ($1,$2,$3,'swiggy',$4,$5,$6,$7,'platform','paid',$8,$9,'completed',$10)`,
      [orderId, req.user.outlet_id, orderNumber, row.customer_name||'Swiggy', parseFloat(row.subtotal)||0, parseFloat(row.tax)||0, parseFloat(row.total)||0, row.order_id, parseFloat(row.commission)||0, row.items_text||null]);
    imported++;
  }
  await pool().query('INSERT INTO csv_imports (id, platform, filename, records_imported, imported_by) VALUES ($1,$2,$3,$4,$5)', [importId, 'swiggy', 'manual', imported, req.user.id]);
  res.json({ import_id: importId, records_imported: imported });
});

router.get('/history', authMiddleware, async (req, res) => {
  const { rows } = await pool().query('SELECT * FROM csv_imports ORDER BY imported_at DESC LIMIT 50');
  res.json(rows);
});

module.exports = router;
