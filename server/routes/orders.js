const express = require('express');
const { v4: uuid } = require('uuid');
const { getDb } = require('../db/schema');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
const pool = () => getDb();

async function generateOrderNumber(outletId) {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const { rows } = await pool().query("SELECT COUNT(*) as c FROM orders WHERE outlet_id = $1 AND created_at::date = CURRENT_DATE", [outletId]);
  return `ORD-${today}-${String(parseInt(rows[0].c) + 1).padStart(4, '0')}`;
}

async function generateKotNumber(outletId) {
  const { rows } = await pool().query("SELECT COUNT(*) as c FROM kot_tokens k JOIN orders o ON k.order_id = o.id WHERE o.outlet_id = $1 AND k.printed_at::date = CURRENT_DATE", [outletId]);
  return parseInt(rows[0].c) + 1;
}

async function buildOrderItems(items, orderId, isTakeaway, packingEnabled) {
  const result = [];
  for (const item of items) {
    const { rows } = await pool().query('SELECT * FROM menu_items WHERE id = $1', [item.menu_item_id]);
    const mi = rows[0];
    if (!mi) throw new Error(`Menu item ${item.menu_item_id} not found`);
    const unitPrice = parseFloat(mi.price) + (item.price_delta || 0);
    const quantity = item.quantity || 1;
    const taxPercent = parseFloat(mi.tax_percent);
    const itemTotal = unitPrice * quantity;
    const taxAmt = Math.round(itemTotal * (taxPercent / 100) * 100) / 100;
    const packingCharge = (isTakeaway && packingEnabled) ? (parseFloat(mi.packing_charge) || 0) * quantity : 0;
    result.push({
      id: uuid(), order_id: orderId, menu_item_id: item.menu_item_id,
      variant_id: item.variant_id || null, quantity, unit_price: unitPrice,
      tax_percent: taxPercent, tax_amount: taxAmt,
      total: Math.round((itemTotal + taxAmt) * 100) / 100,
      packing_charge: Math.round(packingCharge * 100) / 100,
      notes: item.notes || null, name: mi.name
    });
  }
  return result;
}

async function recalcOrderTotals(orderId) {
  const { rows } = await pool().query('SELECT * FROM order_items WHERE order_id = $1', [orderId]);
  let subtotal = 0, taxAmount = 0, packingTotal = 0;
  for (const oi of rows) {
    subtotal += parseFloat(oi.unit_price) * oi.quantity;
    taxAmount += parseFloat(oi.tax_amount);
    packingTotal += parseFloat(oi.packing_charge) || 0;
  }
  subtotal = Math.round(subtotal * 100) / 100;
  taxAmount = Math.round(taxAmount * 100) / 100;
  packingTotal = Math.round(packingTotal * 100) / 100;
  const total = Math.round((subtotal + taxAmount + packingTotal) * 100) / 100;
  await pool().query('UPDATE orders SET subtotal=$1, tax_amount=$2, packing_charges=$3, total=$4 WHERE id=$5', [subtotal, taxAmount, packingTotal, total, orderId]);
  return { subtotal, taxAmount, packingTotal, total };
}

// Create order + first KOT
router.post('/', authMiddleware, async (req, res) => {
  const { order_type, table_id, customer_name, customer_phone, items, notes } = req.body;
  if (!order_type || !items || !items.length) return res.status(400).json({ error: 'Order type and items required' });

  try {
    const isTakeaway = order_type === 'takeaway';
    const { rows: settRows } = await pool().query('SELECT key, value FROM settings WHERE outlet_id = $1', [req.user.outlet_id]);
    const sett = {}; for (const r of settRows) sett[r.key] = r.value;
    const packingEnabled = sett.packing_enabled !== 'false';

    const orderId = uuid();
    const orderNumber = await generateOrderNumber(req.user.outlet_id);
    const orderItems = await buildOrderItems(items, orderId, isTakeaway, packingEnabled);

    let subtotal = 0, taxAmount = 0, packingTotal = 0;
    for (const oi of orderItems) { subtotal += oi.unit_price * oi.quantity; taxAmount += oi.tax_amount; packingTotal += oi.packing_charge; }
    subtotal = Math.round(subtotal * 100) / 100; taxAmount = Math.round(taxAmount * 100) / 100;
    packingTotal = Math.round(packingTotal * 100) / 100;
    const total = Math.round((subtotal + taxAmount + packingTotal) * 100) / 100;

    await pool().query(`INSERT INTO orders (id, outlet_id, order_number, order_type, table_id, customer_name, customer_phone, subtotal, tax_amount, packing_charges, total, notes, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [orderId, req.user.outlet_id, orderNumber, order_type, table_id || null, customer_name || null, customer_phone || null, subtotal, taxAmount, packingTotal, total, notes || null, req.user.id]);

    const kotId = uuid();
    const kotNumber = await generateKotNumber(req.user.outlet_id);
    await pool().query('INSERT INTO kot_tokens (id, order_id, token_number) VALUES ($1, $2, $3)', [kotId, orderId, kotNumber]);

    for (const oi of orderItems) {
      await pool().query('INSERT INTO order_items (id, order_id, menu_item_id, variant_id, quantity, unit_price, tax_percent, tax_amount, total, notes, kot_id, packing_charge) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',
        [oi.id, orderId, oi.menu_item_id, oi.variant_id, oi.quantity, oi.unit_price, oi.tax_percent, oi.tax_amount, oi.total, oi.notes, kotId, oi.packing_charge]);
    }

    if (table_id && order_type === 'dine_in') {
      await pool().query("UPDATE tables_config SET status = 'occupied' WHERE id = $1", [table_id]);
    }

    res.status(201).json({
      id: orderId, order_number: orderNumber, kot_number: kotNumber, kot_id: kotId,
      order_type, subtotal, tax_amount: taxAmount, total,
      items: orderItems.map(oi => ({ id: oi.id, name: oi.name, quantity: oi.quantity, unit_price: oi.unit_price, total: oi.total }))
    });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// Send additional KOT
router.post('/:id/kot', authMiddleware, async (req, res) => {
  const { items } = req.body;
  if (!items || !items.length) return res.status(400).json({ error: 'Items required' });

  const { rows: orderRows } = await pool().query('SELECT * FROM orders WHERE id = $1 AND outlet_id = $2', [req.params.id, req.user.outlet_id]);
  const order = orderRows[0];
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (['completed', 'cancelled'].includes(order.status)) return res.status(400).json({ error: 'Order is ' + order.status });

  try {
    const isTakeaway = order.order_type === 'takeaway';
    const { rows: settRows } = await pool().query('SELECT key, value FROM settings WHERE outlet_id = $1', [req.user.outlet_id]);
    const sett = {}; for (const r of settRows) sett[r.key] = r.value;
    const packingEnabled = sett.packing_enabled !== 'false';

    const orderItems = await buildOrderItems(items, order.id, isTakeaway, packingEnabled);
    const kotId = uuid();
    const kotNumber = await generateKotNumber(req.user.outlet_id);
    await pool().query('INSERT INTO kot_tokens (id, order_id, token_number) VALUES ($1, $2, $3)', [kotId, order.id, kotNumber]);

    for (const oi of orderItems) {
      await pool().query('INSERT INTO order_items (id, order_id, menu_item_id, variant_id, quantity, unit_price, tax_percent, tax_amount, total, notes, kot_id, packing_charge) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',
        [oi.id, order.id, oi.menu_item_id, oi.variant_id, oi.quantity, oi.unit_price, oi.tax_percent, oi.tax_amount, oi.total, oi.notes, kotId, oi.packing_charge]);
    }

    const totals = await recalcOrderTotals(order.id);
    res.json({ kot_id: kotId, kot_number: kotNumber, ...totals,
      items: orderItems.map(oi => ({ id: oi.id, name: oi.name, quantity: oi.quantity, unit_price: oi.unit_price, total: oi.total }))
    });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// Active orders
router.get('/active', authMiddleware, async (req, res) => {
  const { rows } = await pool().query(`
    SELECT o.*, COUNT(oi.id)::int as item_count FROM orders o LEFT JOIN order_items oi ON o.id = oi.order_id
    WHERE o.outlet_id = $1 AND o.payment_status = 'pending' AND o.status NOT IN ('completed', 'cancelled')
    GROUP BY o.id ORDER BY o.created_at DESC
  `, [req.user.outlet_id]);
  res.json(rows);
});

// All orders
router.get('/', authMiddleware, async (req, res) => {
  const { date, status, type } = req.query;
  let sql = "SELECT * FROM orders WHERE outlet_id = $1";
  const params = [req.user.outlet_id];
  let i = 2;

  if (date) { sql += ` AND created_at::date = $${i++}`; params.push(date); }
  else { sql += " AND created_at::date = CURRENT_DATE"; }
  if (status) { sql += ` AND status = $${i++}`; params.push(status); }
  if (type) { sql += ` AND order_type = $${i++}`; params.push(type); }
  sql += " ORDER BY created_at DESC";

  const { rows } = await pool().query(sql, params);
  res.json(rows);
});

// Single order
router.get('/:id', authMiddleware, async (req, res) => {
  const { rows: orderRows } = await pool().query('SELECT * FROM orders WHERE id = $1 AND outlet_id = $2', [req.params.id, req.user.outlet_id]);
  if (!orderRows[0]) return res.status(404).json({ error: 'Order not found' });

  const { rows: items } = await pool().query(`
    SELECT oi.*, mi.name as item_name, mi.is_veg, mv.name as variant_name
    FROM order_items oi JOIN menu_items mi ON oi.menu_item_id = mi.id
    LEFT JOIN menu_variants mv ON oi.variant_id = mv.id WHERE oi.order_id = $1
  `, [orderRows[0].id]);

  const { rows: kots } = await pool().query('SELECT * FROM kot_tokens WHERE order_id = $1 ORDER BY token_number', [orderRows[0].id]);
  const { rows: payments } = await pool().query('SELECT * FROM payments WHERE order_id = $1', [orderRows[0].id]);

  res.json({ ...orderRows[0], items, kots, payments });
});

// Bill printed
router.patch('/:id/bill-printed', authMiddleware, async (req, res) => {
  await pool().query('UPDATE orders SET bill_printed = 1 WHERE id = $1 AND outlet_id = $2', [req.params.id, req.user.outlet_id]);
  res.json({ success: true });
});

// Update item qty
router.patch('/:id/items/:itemId', authMiddleware, async (req, res) => {
  const { quantity } = req.body;
  if (!quantity || quantity < 1) return res.status(400).json({ error: 'Valid quantity required' });

  const { rows } = await pool().query('SELECT * FROM order_items WHERE id = $1 AND order_id = $2', [req.params.itemId, req.params.id]);
  const item = rows[0];
  if (!item) return res.status(404).json({ error: 'Item not found' });

  const itemTotal = parseFloat(item.unit_price) * quantity;
  const taxAmt = Math.round(itemTotal * (parseFloat(item.tax_percent) / 100) * 100) / 100;
  const total = Math.round((itemTotal + taxAmt) * 100) / 100;

  await pool().query('UPDATE order_items SET quantity=$1, tax_amount=$2, total=$3 WHERE id=$4', [quantity, taxAmt, total, req.params.itemId]);
  const totals = await recalcOrderTotals(req.params.id);
  res.json({ success: true, ...totals });
});

// Remove item
router.delete('/:id/items/:itemId', authMiddleware, async (req, res) => {
  await pool().query('DELETE FROM order_items WHERE id = $1 AND order_id = $2', [req.params.itemId, req.params.id]);
  const totals = await recalcOrderTotals(req.params.id);
  res.json({ success: true, ...totals });
});

// Update status
router.patch('/:id/status', authMiddleware, async (req, res) => {
  const { status } = req.body;
  const { rows } = await pool().query('SELECT * FROM orders WHERE id = $1 AND outlet_id = $2', [req.params.id, req.user.outlet_id]);
  if (!rows[0]) return res.status(404).json({ error: 'Order not found' });

  const completedAt = status === 'completed' ? new Date().toISOString() : null;
  await pool().query('UPDATE orders SET status=$1, completed_at=COALESCE($2, completed_at) WHERE id=$3', [status, completedAt, req.params.id]);
  if (status === 'completed' && rows[0].table_id) {
    await pool().query("UPDATE tables_config SET status = 'available' WHERE id = $1", [rows[0].table_id]);
  }
  res.json({ success: true });
});

// Quick pay
router.post('/:id/quick-pay', authMiddleware, async (req, res) => {
  const { method } = req.body;
  if (!method) return res.status(400).json({ error: 'Payment method required' });

  const { rows } = await pool().query('SELECT * FROM orders WHERE id = $1 AND outlet_id = $2', [req.params.id, req.user.outlet_id]);
  if (!rows[0]) return res.status(404).json({ error: 'Order not found' });

  await pool().query('INSERT INTO payments (id, order_id, method, amount) VALUES ($1, $2, $3, $4)', [uuid(), rows[0].id, method, rows[0].total]);
  await pool().query("UPDATE orders SET payment_status='paid', payment_method=$1, status='completed', completed_at=NOW() WHERE id=$2", [method, rows[0].id]);
  if (rows[0].table_id) await pool().query("UPDATE tables_config SET status='available' WHERE id=$1", [rows[0].table_id]);
  res.json({ success: true });
});

// Legacy pay
router.post('/:id/pay', authMiddleware, async (req, res) => {
  const { payments } = req.body;
  if (!payments || !payments.length) return res.status(400).json({ error: 'Payment details required' });

  for (const p of payments) {
    await pool().query('INSERT INTO payments (id, order_id, method, amount, reference_no) VALUES ($1,$2,$3,$4,$5)', [uuid(), req.params.id, p.method, p.amount, p.reference_no || null]);
  }
  const method = payments.length === 1 ? payments[0].method : 'split';
  await pool().query("UPDATE orders SET payment_status='paid', payment_method=$1 WHERE id=$2", [method, req.params.id]);
  res.json({ success: true });
});

module.exports = router;
