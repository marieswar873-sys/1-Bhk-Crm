const express = require('express');
const { v4: uuid } = require('uuid');
const { getDb } = require('../db/schema');
const { authMiddleware } = require('../middleware/auth');
const router = express.Router();

function generateOrderNumber(db, outletId) {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const c = db.prepare("SELECT COUNT(*) as c FROM orders WHERE outlet_id = ? AND created_at >= date('now')").get(outletId).c;
  return `ORD-${today}-${String(c + 1).padStart(4, '0')}`;
}
function generateKotNumber(db, outletId) {
  const c = db.prepare("SELECT COUNT(*) as c FROM kot_tokens k JOIN orders o ON k.order_id = o.id WHERE o.outlet_id = ? AND k.printed_at >= date('now')").get(outletId).c;
  return c + 1;
}
function buildOrderItems(db, items, orderId, isTakeaway, packingEnabled) {
  return items.map(item => {
    const mi = db.prepare('SELECT * FROM menu_items WHERE id = ?').get(item.menu_item_id);
    if (!mi) throw new Error(`Menu item ${item.menu_item_id} not found`);
    const unitPrice = mi.price + (item.price_delta || 0);
    const qty = item.quantity || 1;
    const taxAmt = Math.round(unitPrice * qty * (mi.tax_percent / 100) * 100) / 100;
    const packChg = (isTakeaway && packingEnabled) ? (mi.packing_charge || 0) * qty : 0;
    return { id: uuid(), order_id: orderId, menu_item_id: item.menu_item_id, variant_id: item.variant_id||null, quantity: qty, unit_price: unitPrice, tax_percent: mi.tax_percent, tax_amount: taxAmt, total: Math.round((unitPrice*qty+taxAmt)*100)/100, packing_charge: Math.round(packChg*100)/100, notes: item.notes||null, name: mi.name };
  });
}
function recalcTotals(db, orderId) {
  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(orderId);
  let sub=0,tax=0,pack=0;
  for (const i of items) { sub+=i.unit_price*i.quantity; tax+=i.tax_amount; pack+=(i.packing_charge||0); }
  sub=Math.round(sub*100)/100; tax=Math.round(tax*100)/100; pack=Math.round(pack*100)/100;
  const total=Math.round((sub+tax+pack)*100)/100;
  db.prepare('UPDATE orders SET subtotal=?,tax_amount=?,packing_charges=?,total=? WHERE id=?').run(sub,tax,pack,total,orderId);
  return { subtotal:sub, taxAmount:tax, packingTotal:pack, total };
}

router.post('/', authMiddleware, (req, res) => {
  const { order_type, table_id, customer_name, customer_phone, items, notes } = req.body;
  if (!order_type || !items?.length) return res.status(400).json({ error: 'Order type and items required' });
  const db = getDb();
  try {
    const sett = {}; db.prepare('SELECT key, value FROM settings WHERE outlet_id = ?').all(req.user.outlet_id).forEach(r => sett[r.key]=r.value);
    const orderId = uuid(), orderNumber = generateOrderNumber(db, req.user.outlet_id);
    const ois = buildOrderItems(db, items, orderId, order_type==='takeaway', sett.packing_enabled!=='false');
    let sub=0,tax=0,pack=0;
    for (const o of ois) { sub+=o.unit_price*o.quantity; tax+=o.tax_amount; pack+=o.packing_charge; }
    sub=Math.round(sub*100)/100; tax=Math.round(tax*100)/100; pack=Math.round(pack*100)/100;
    const total=Math.round((sub+tax+pack)*100)/100;

    const result = db.transaction(() => {
      db.prepare('INSERT INTO orders (id,outlet_id,order_number,order_type,table_id,customer_name,customer_phone,subtotal,tax_amount,packing_charges,total,notes,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').run(orderId, req.user.outlet_id, orderNumber, order_type, table_id||null, customer_name||null, customer_phone||null, sub, tax, pack, total, notes||null, req.user.id);
      const kotId = uuid(), kotNum = generateKotNumber(db, req.user.outlet_id);
      db.prepare('INSERT INTO kot_tokens (id,order_id,token_number) VALUES (?,?,?)').run(kotId, orderId, kotNum);
      const ins = db.prepare('INSERT INTO order_items (id,order_id,menu_item_id,variant_id,quantity,unit_price,tax_percent,tax_amount,total,notes,kot_id,packing_charge) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)');
      for (const o of ois) ins.run(o.id,orderId,o.menu_item_id,o.variant_id,o.quantity,o.unit_price,o.tax_percent,o.tax_amount,o.total,o.notes,kotId,o.packing_charge);
      if (table_id && order_type==='dine_in') db.prepare("UPDATE tables_config SET status='occupied' WHERE id=?").run(table_id);
      return { kotId, kotNum };
    })();
    res.status(201).json({ id:orderId, order_number:orderNumber, kot_number:result.kotNum, kot_id:result.kotId, order_type, subtotal:sub, tax_amount:tax, total, items:ois.map(o=>({id:o.id,name:o.name,quantity:o.quantity,unit_price:o.unit_price,total:o.total})) });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.post('/:id/kot', authMiddleware, (req, res) => {
  const { items } = req.body;
  if (!items?.length) return res.status(400).json({ error: 'Items required' });
  const db = getDb();
  const order = db.prepare('SELECT * FROM orders WHERE id=? AND outlet_id=?').get(req.params.id, req.user.outlet_id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (['completed','cancelled'].includes(order.status)) return res.status(400).json({ error: 'Order is '+order.status });
  try {
    const sett = {}; db.prepare('SELECT key, value FROM settings WHERE outlet_id = ?').all(req.user.outlet_id).forEach(r => sett[r.key]=r.value);
    const ois = buildOrderItems(db, items, order.id, order.order_type==='takeaway', sett.packing_enabled!=='false');
    const result = db.transaction(() => {
      const kotId=uuid(), kotNum=generateKotNumber(db, req.user.outlet_id);
      db.prepare('INSERT INTO kot_tokens (id,order_id,token_number) VALUES (?,?,?)').run(kotId, order.id, kotNum);
      const ins = db.prepare('INSERT INTO order_items (id,order_id,menu_item_id,variant_id,quantity,unit_price,tax_percent,tax_amount,total,notes,kot_id,packing_charge) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)');
      for (const o of ois) ins.run(o.id,order.id,o.menu_item_id,o.variant_id,o.quantity,o.unit_price,o.tax_percent,o.tax_amount,o.total,o.notes,kotId,o.packing_charge);
      const totals = recalcTotals(db, order.id);
      return { kotId, kotNum, ...totals };
    })();
    res.json({ kot_id:result.kotId, kot_number:result.kotNum, subtotal:result.subtotal, tax_amount:result.taxAmount, total:result.total, items:ois.map(o=>({id:o.id,name:o.name,quantity:o.quantity,unit_price:o.unit_price,total:o.total})) });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.get('/active', authMiddleware, (req, res) => {
  res.json(getDb().prepare("SELECT o.*, COUNT(oi.id) as item_count FROM orders o LEFT JOIN order_items oi ON o.id=oi.order_id WHERE o.outlet_id=? AND o.payment_status='pending' AND o.status NOT IN ('completed','cancelled') GROUP BY o.id ORDER BY o.created_at DESC").all(req.user.outlet_id));
});

router.get('/', authMiddleware, (req, res) => {
  const { date, status, type } = req.query;
  let sql = "SELECT * FROM orders WHERE outlet_id = ?"; const params = [req.user.outlet_id];
  if (date) { sql += " AND date(created_at)=?"; params.push(date); } else sql += " AND created_at >= date('now')";
  if (status) { sql += " AND status=?"; params.push(status); }
  if (type) { sql += " AND order_type=?"; params.push(type); }
  res.json(getDb().prepare(sql + " ORDER BY created_at DESC").all(...params));
});

router.get('/:id', authMiddleware, (req, res) => {
  const db = getDb();
  const order = db.prepare('SELECT * FROM orders WHERE id=? AND outlet_id=?').get(req.params.id, req.user.outlet_id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  const items = db.prepare('SELECT oi.*, mi.name as item_name, mi.is_veg, mv.name as variant_name FROM order_items oi JOIN menu_items mi ON oi.menu_item_id=mi.id LEFT JOIN menu_variants mv ON oi.variant_id=mv.id WHERE oi.order_id=?').all(order.id);
  const kots = db.prepare('SELECT * FROM kot_tokens WHERE order_id=? ORDER BY token_number').all(order.id);
  const payments = db.prepare('SELECT * FROM payments WHERE order_id=?').all(order.id);
  res.json({ ...order, items, kots, payments });
});

router.patch('/:id/bill-printed', authMiddleware, (req, res) => {
  getDb().prepare('UPDATE orders SET bill_printed=1 WHERE id=? AND outlet_id=?').run(req.params.id, req.user.outlet_id);
  res.json({ success: true });
});

router.patch('/:id/items/:itemId', authMiddleware, (req, res) => {
  const { quantity } = req.body;
  if (!quantity || quantity<1) return res.status(400).json({ error: 'Valid quantity required' });
  const db = getDb();
  const item = db.prepare('SELECT * FROM order_items WHERE id=? AND order_id=?').get(req.params.itemId, req.params.id);
  if (!item) return res.status(404).json({ error: 'Item not found' });
  const taxAmt = Math.round(item.unit_price*quantity*(item.tax_percent/100)*100)/100;
  const total = Math.round((item.unit_price*quantity+taxAmt)*100)/100;
  db.prepare('UPDATE order_items SET quantity=?,tax_amount=?,total=? WHERE id=?').run(quantity, taxAmt, total, req.params.itemId);
  res.json({ success: true, ...recalcTotals(db, req.params.id) });
});

router.delete('/:id/items/:itemId', authMiddleware, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM order_items WHERE id=? AND order_id=?').run(req.params.itemId, req.params.id);
  res.json({ success: true, ...recalcTotals(db, req.params.id) });
});

router.patch('/:id/status', authMiddleware, (req, res) => {
  const db = getDb();
  const order = db.prepare('SELECT * FROM orders WHERE id=? AND outlet_id=?').get(req.params.id, req.user.outlet_id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  const completedAt = req.body.status==='completed' ? new Date().toISOString() : null;
  db.prepare('UPDATE orders SET status=?,completed_at=COALESCE(?,completed_at) WHERE id=?').run(req.body.status, completedAt, req.params.id);
  if (req.body.status==='completed' && order.table_id) db.prepare("UPDATE tables_config SET status='available' WHERE id=?").run(order.table_id);
  res.json({ success: true });
});

router.post('/:id/quick-pay', authMiddleware, (req, res) => {
  const { method } = req.body;
  if (!method) return res.status(400).json({ error: 'Payment method required' });
  const db = getDb();
  const order = db.prepare('SELECT * FROM orders WHERE id=? AND outlet_id=?').get(req.params.id, req.user.outlet_id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  db.transaction(() => {
    db.prepare('INSERT INTO payments (id,order_id,method,amount) VALUES (?,?,?,?)').run(uuid(), order.id, method, order.total);
    db.prepare("UPDATE orders SET payment_status='paid',payment_method=?,status='completed',completed_at=datetime('now') WHERE id=?").run(method, order.id);
    if (order.table_id) db.prepare("UPDATE tables_config SET status='available' WHERE id=?").run(order.table_id);
  })();
  res.json({ success: true });
});

router.post('/:id/pay', authMiddleware, (req, res) => {
  const { payments } = req.body;
  if (!payments?.length) return res.status(400).json({ error: 'Payment details required' });
  const db = getDb();
  db.transaction(() => {
    for (const p of payments) db.prepare('INSERT INTO payments (id,order_id,method,amount,reference_no) VALUES (?,?,?,?,?)').run(uuid(), req.params.id, p.method, p.amount, p.reference_no||null);
    db.prepare("UPDATE orders SET payment_status='paid',payment_method=? WHERE id=?").run(payments.length===1?payments[0].method:'split', req.params.id);
  })();
  res.json({ success: true });
});

module.exports = router;
