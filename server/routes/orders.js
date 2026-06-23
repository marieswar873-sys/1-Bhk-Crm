const express = require('express');
const { v4: uuid } = require('uuid');
const { getDb } = require('../db/schema');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

function generateOrderNumber(db, outletId) {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const count = db.prepare(
    "SELECT COUNT(*) as c FROM orders WHERE outlet_id = ? AND created_at >= date('now')"
  ).get(outletId).c;
  return `ORD-${today}-${String(count + 1).padStart(4, '0')}`;
}

function generateKotNumber(db, outletId) {
  const count = db.prepare(
    "SELECT COUNT(*) as c FROM kot_tokens k JOIN orders o ON k.order_id = o.id WHERE o.outlet_id = ? AND k.printed_at >= date('now')"
  ).get(outletId).c;
  return count + 1;
}

function buildOrderItems(db, items, orderId, isTakeaway, packingEnabled) {
  const result = [];
  for (const item of items) {
    const mi = db.prepare('SELECT * FROM menu_items WHERE id = ?').get(item.menu_item_id);
    if (!mi) throw new Error(`Menu item ${item.menu_item_id} not found`);
    const unitPrice = mi.price + (item.price_delta || 0);
    const quantity = item.quantity || 1;
    const taxPercent = mi.tax_percent;
    const itemTotal = unitPrice * quantity;
    const taxAmt = Math.round(itemTotal * (taxPercent / 100) * 100) / 100;
    const packingCharge = (isTakeaway && packingEnabled) ? (mi.packing_charge || 0) * quantity : 0;
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

function recalcOrderTotals(db, orderId) {
  const allItems = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(orderId);
  let subtotal = 0, taxAmount = 0, packingTotal = 0;
  for (const oi of allItems) {
    subtotal += oi.unit_price * oi.quantity;
    taxAmount += oi.tax_amount;
    packingTotal += oi.packing_charge || 0;
  }
  subtotal = Math.round(subtotal * 100) / 100;
  taxAmount = Math.round(taxAmount * 100) / 100;
  packingTotal = Math.round(packingTotal * 100) / 100;
  const total = Math.round((subtotal + taxAmount + packingTotal) * 100) / 100;
  db.prepare('UPDATE orders SET subtotal = ?, tax_amount = ?, packing_charges = ?, total = ? WHERE id = ?').run(subtotal, taxAmount, packingTotal, total, orderId);
  return { subtotal, taxAmount, packingTotal, total };
}

// Create order + first KOT
router.post('/', authMiddleware, (req, res) => {
  const { order_type, table_id, customer_name, customer_phone, items, notes } = req.body;
  if (!order_type || !items || !items.length) {
    return res.status(400).json({ error: 'Order type and items required' });
  }

  const db = getDb();
  const orderId = uuid();
  const orderNumber = generateOrderNumber(db, req.user.outlet_id);

  try {
    // Check packing settings
    const isTakeaway = order_type === 'takeaway';
    const settingsRows = db.prepare('SELECT key, value FROM settings WHERE outlet_id = ?').all(req.user.outlet_id);
    const sett = {};
    for (const r of settingsRows) sett[r.key] = r.value;
    const packingEnabled = sett.packing_enabled !== 'false';

    const orderItems = buildOrderItems(db, items, orderId, isTakeaway, packingEnabled);
    let subtotal = 0, taxAmount = 0, packingTotal = 0;
    for (const oi of orderItems) {
      subtotal += oi.unit_price * oi.quantity;
      taxAmount += oi.tax_amount;
      packingTotal += oi.packing_charge || 0;
    }
    subtotal = Math.round(subtotal * 100) / 100;
    taxAmount = Math.round(taxAmount * 100) / 100;
    packingTotal = Math.round(packingTotal * 100) / 100;
    const total = Math.round((subtotal + taxAmount + packingTotal) * 100) / 100;

    const result = db.transaction(() => {
      db.prepare(`INSERT INTO orders (id, outlet_id, order_number, order_type, table_id, customer_name, customer_phone, subtotal, tax_amount, packing_charges, total, notes, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        orderId, req.user.outlet_id, orderNumber, order_type, table_id || null,
        customer_name || null, customer_phone || null, subtotal, taxAmount, packingTotal, total,
        notes || null, req.user.id
      );

      // Create KOT
      const kotId = uuid();
      const kotNumber = generateKotNumber(db, req.user.outlet_id);
      db.prepare('INSERT INTO kot_tokens (id, order_id, token_number) VALUES (?, ?, ?)').run(kotId, orderId, kotNumber);

      // Insert items linked to KOT
      const insertItem = db.prepare(`INSERT INTO order_items (id, order_id, menu_item_id, variant_id, quantity, unit_price, tax_percent, tax_amount, total, notes, kot_id, packing_charge)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      for (const oi of orderItems) {
        insertItem.run(oi.id, oi.order_id, oi.menu_item_id, oi.variant_id, oi.quantity, oi.unit_price, oi.tax_percent, oi.tax_amount, oi.total, oi.notes, kotId, oi.packing_charge || 0);
      }

      if (table_id && order_type === 'dine_in') {
        db.prepare("UPDATE tables_config SET status = 'occupied' WHERE id = ?").run(table_id);
      }

      return { kotId, kotNumber };
    })();

    res.status(201).json({
      id: orderId, order_number: orderNumber, kot_number: result.kotNumber, kot_id: result.kotId,
      order_type, subtotal, tax_amount: taxAmount, total,
      items: orderItems.map(oi => ({ id: oi.id, name: oi.name, quantity: oi.quantity, unit_price: oi.unit_price, total: oi.total }))
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Send additional KOT for existing order
router.post('/:id/kot', authMiddleware, (req, res) => {
  const { items } = req.body;
  if (!items || !items.length) return res.status(400).json({ error: 'Items required' });

  const db = getDb();
  const order = db.prepare('SELECT * FROM orders WHERE id = ? AND outlet_id = ?').get(req.params.id, req.user.outlet_id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (['completed', 'cancelled'].includes(order.status)) return res.status(400).json({ error: 'Order is already ' + order.status });

  try {
    const isTakeaway = order.order_type === 'takeaway';
    const settingsRows = db.prepare('SELECT key, value FROM settings WHERE outlet_id = ?').all(req.user.outlet_id);
    const sett = {};
    for (const r of settingsRows) sett[r.key] = r.value;
    const packingEnabled = sett.packing_enabled !== 'false';

    const orderItems = buildOrderItems(db, items, order.id, isTakeaway, packingEnabled);

    const result = db.transaction(() => {
      const kotId = uuid();
      const kotNumber = generateKotNumber(db, req.user.outlet_id);
      db.prepare('INSERT INTO kot_tokens (id, order_id, token_number) VALUES (?, ?, ?)').run(kotId, order.id, kotNumber);

      const insertItem = db.prepare(`INSERT INTO order_items (id, order_id, menu_item_id, variant_id, quantity, unit_price, tax_percent, tax_amount, total, notes, kot_id, packing_charge)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      for (const oi of orderItems) {
        insertItem.run(oi.id, oi.order_id, oi.menu_item_id, oi.variant_id, oi.quantity, oi.unit_price, oi.tax_percent, oi.tax_amount, oi.total, oi.notes, kotId, oi.packing_charge || 0);
      }

      const totals = recalcOrderTotals(db, order.id);
      return { kotId, kotNumber, ...totals };
    })();

    res.json({
      kot_id: result.kotId, kot_number: result.kotNumber,
      subtotal: result.subtotal, tax_amount: result.taxAmount, total: result.total,
      items: orderItems.map(oi => ({ id: oi.id, name: oi.name, quantity: oi.quantity, unit_price: oi.unit_price, total: oi.total }))
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Get active (unpaid) orders
router.get('/active', authMiddleware, (req, res) => {
  const db = getDb();
  const orders = db.prepare(`
    SELECT o.*, COUNT(oi.id) as item_count
    FROM orders o LEFT JOIN order_items oi ON o.id = oi.order_id
    WHERE o.outlet_id = ? AND o.payment_status = 'pending' AND o.status NOT IN ('completed', 'cancelled')
    GROUP BY o.id ORDER BY o.created_at DESC
  `).all(req.user.outlet_id);
  res.json(orders);
});

// Get all orders (today by default)
router.get('/', authMiddleware, (req, res) => {
  const db = getDb();
  const { date, status, type } = req.query;
  let query = "SELECT * FROM orders WHERE outlet_id = ?";
  const params = [req.user.outlet_id];

  if (date) { query += " AND date(created_at) = ?"; params.push(date); }
  else { query += " AND created_at >= date('now')"; }
  if (status) { query += " AND status = ?"; params.push(status); }
  if (type) { query += " AND order_type = ?"; params.push(type); }
  query += " ORDER BY created_at DESC";

  res.json(db.prepare(query).all(...params));
});

// Get single order with items
router.get('/:id', authMiddleware, (req, res) => {
  const db = getDb();
  const order = db.prepare('SELECT * FROM orders WHERE id = ? AND outlet_id = ?').get(req.params.id, req.user.outlet_id);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  const items = db.prepare(`
    SELECT oi.*, mi.name as item_name, mi.is_veg, mv.name as variant_name
    FROM order_items oi
    JOIN menu_items mi ON oi.menu_item_id = mi.id
    LEFT JOIN menu_variants mv ON oi.variant_id = mv.id
    WHERE oi.order_id = ?
  `).all(order.id);

  const kots = db.prepare('SELECT * FROM kot_tokens WHERE order_id = ? ORDER BY token_number').all(order.id);
  const payments = db.prepare('SELECT * FROM payments WHERE order_id = ?').all(order.id);

  res.json({ ...order, items, kots, payments });
});

// Mark bill as printed
router.patch('/:id/bill-printed', authMiddleware, (req, res) => {
  const db = getDb();
  db.prepare('UPDATE orders SET bill_printed = 1 WHERE id = ? AND outlet_id = ?').run(req.params.id, req.user.outlet_id);
  res.json({ success: true });
});

// Update item quantity in active order
router.patch('/:id/items/:itemId', authMiddleware, (req, res) => {
  const { quantity } = req.body;
  if (!quantity || quantity < 1) return res.status(400).json({ error: 'Valid quantity required' });

  const db = getDb();
  const order = db.prepare('SELECT * FROM orders WHERE id = ? AND outlet_id = ?').get(req.params.id, req.user.outlet_id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (['completed', 'cancelled'].includes(order.status)) return res.status(400).json({ error: 'Cannot edit completed order' });

  const item = db.prepare('SELECT * FROM order_items WHERE id = ? AND order_id = ?').get(req.params.itemId, req.params.id);
  if (!item) return res.status(404).json({ error: 'Item not found' });

  const itemTotal = item.unit_price * quantity;
  const taxAmt = Math.round(itemTotal * (item.tax_percent / 100) * 100) / 100;
  const total = Math.round((itemTotal + taxAmt) * 100) / 100;

  db.prepare('UPDATE order_items SET quantity = ?, tax_amount = ?, total = ? WHERE id = ?').run(quantity, taxAmt, total, req.params.itemId);
  const totals = recalcOrderTotals(db, req.params.id);

  res.json({ success: true, ...totals });
});

// Remove item from active order
router.delete('/:id/items/:itemId', authMiddleware, (req, res) => {
  const db = getDb();
  const order = db.prepare('SELECT * FROM orders WHERE id = ? AND outlet_id = ?').get(req.params.id, req.user.outlet_id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (['completed', 'cancelled'].includes(order.status)) return res.status(400).json({ error: 'Cannot edit completed order' });

  db.prepare('DELETE FROM order_items WHERE id = ? AND order_id = ?').run(req.params.itemId, req.params.id);
  const totals = recalcOrderTotals(db, req.params.id);

  res.json({ success: true, ...totals });
});

// Update order status
router.patch('/:id/status', authMiddleware, (req, res) => {
  const { status } = req.body;
  const db = getDb();
  const order = db.prepare('SELECT * FROM orders WHERE id = ? AND outlet_id = ?').get(req.params.id, req.user.outlet_id);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  const completedAt = status === 'completed' ? new Date().toISOString() : null;
  db.prepare('UPDATE orders SET status = ?, completed_at = COALESCE(?, completed_at) WHERE id = ?').run(status, completedAt, req.params.id);

  if (status === 'completed' && order.table_id) {
    db.prepare("UPDATE tables_config SET status = 'available' WHERE id = ?").run(order.table_id);
  }

  res.json({ success: true });
});

// Quick pay — mark paid + completed in one call
router.post('/:id/quick-pay', authMiddleware, (req, res) => {
  const { method } = req.body;
  if (!method) return res.status(400).json({ error: 'Payment method required' });

  const db = getDb();
  const order = db.prepare('SELECT * FROM orders WHERE id = ? AND outlet_id = ?').get(req.params.id, req.user.outlet_id);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  db.transaction(() => {
    db.prepare('INSERT INTO payments (id, order_id, method, amount) VALUES (?, ?, ?, ?)').run(
      uuid(), order.id, method, order.total
    );
    db.prepare("UPDATE orders SET payment_status = 'paid', payment_method = ?, status = 'completed', completed_at = datetime('now') WHERE id = ?").run(method, order.id);
    if (order.table_id) {
      db.prepare("UPDATE tables_config SET status = 'available' WHERE id = ?").run(order.table_id);
    }
  })();

  res.json({ success: true });
});

// Legacy pay endpoint
router.post('/:id/pay', authMiddleware, (req, res) => {
  const { payments } = req.body;
  if (!payments || !payments.length) return res.status(400).json({ error: 'Payment details required' });

  const db = getDb();
  const order = db.prepare('SELECT * FROM orders WHERE id = ? AND outlet_id = ?').get(req.params.id, req.user.outlet_id);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  db.transaction(() => {
    const insert = db.prepare('INSERT INTO payments (id, order_id, method, amount, reference_no) VALUES (?, ?, ?, ?, ?)');
    for (const p of payments) {
      insert.run(uuid(), req.params.id, p.method, p.amount, p.reference_no || null);
    }
    const method = payments.length === 1 ? payments[0].method : 'split';
    db.prepare("UPDATE orders SET payment_status = 'paid', payment_method = ? WHERE id = ?").run(method, req.params.id);
  })();

  res.json({ success: true });
});

module.exports = router;
