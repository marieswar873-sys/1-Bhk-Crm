const express = require('express');
const { v4: uuid } = require('uuid');
const { getDb } = require('../db/schema');
const { authMiddleware, requireRole } = require('../middleware/auth');

const router = express.Router();

// Import Zomato CSV orders
router.post('/zomato', authMiddleware, requireRole('admin', 'manager'), (req, res) => {
  const { orders } = req.body;
  if (!orders || !orders.length) return res.status(400).json({ error: 'No orders provided' });

  const db = getDb();
  const importId = uuid();
  let imported = 0;

  const importTx = db.transaction(() => {
    for (const row of orders) {
      const existing = db.prepare('SELECT id FROM orders WHERE platform_order_id = ? AND order_type = ?').get(row.order_id, 'zomato');
      if (existing) continue;

      const orderId = uuid();
      const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const count = db.prepare("SELECT COUNT(*) as c FROM orders WHERE outlet_id = ?").get(req.user.outlet_id).c;
      const orderNumber = `ZOM-${today}-${String(count + 1).padStart(4, '0')}`;

      const subtotal = parseFloat(row.subtotal) || 0;
      const tax = parseFloat(row.tax) || 0;
      const total = parseFloat(row.total) || subtotal + tax;
      const commission = parseFloat(row.commission) || 0;

      db.prepare(`INSERT INTO orders (id, outlet_id, order_number, order_type, customer_name, customer_phone,
        subtotal, tax_amount, total, payment_method, payment_status, platform_order_id, platform_commission, status, notes)
        VALUES (?, ?, ?, 'zomato', ?, ?, ?, ?, ?, 'platform', 'paid', ?, ?, 'completed', ?)`).run(
        orderId, req.user.outlet_id, orderNumber, row.customer_name || 'Zomato Customer',
        row.customer_phone || null, subtotal, tax, total, row.order_id, commission,
        row.items_text || null
      );
      imported++;
    }

    db.prepare('INSERT INTO csv_imports (id, platform, filename, records_imported, imported_by) VALUES (?, ?, ?, ?, ?)').run(
      importId, 'zomato', 'manual_import', imported, req.user.id
    );
  });

  try {
    importTx();
    res.json({ import_id: importId, records_imported: imported });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Import Swiggy CSV orders
router.post('/swiggy', authMiddleware, requireRole('admin', 'manager'), (req, res) => {
  const { orders } = req.body;
  if (!orders || !orders.length) return res.status(400).json({ error: 'No orders provided' });

  const db = getDb();
  const importId = uuid();
  let imported = 0;

  const importTx = db.transaction(() => {
    for (const row of orders) {
      const existing = db.prepare('SELECT id FROM orders WHERE platform_order_id = ? AND order_type = ?').get(row.order_id, 'swiggy');
      if (existing) continue;

      const orderId = uuid();
      const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const count = db.prepare("SELECT COUNT(*) as c FROM orders WHERE outlet_id = ?").get(req.user.outlet_id).c;
      const orderNumber = `SWG-${today}-${String(count + 1).padStart(4, '0')}`;

      const subtotal = parseFloat(row.subtotal) || 0;
      const tax = parseFloat(row.tax) || 0;
      const total = parseFloat(row.total) || subtotal + tax;
      const commission = parseFloat(row.commission) || 0;

      db.prepare(`INSERT INTO orders (id, outlet_id, order_number, order_type, customer_name, customer_phone,
        subtotal, tax_amount, total, payment_method, payment_status, platform_order_id, platform_commission, status, notes)
        VALUES (?, ?, ?, 'swiggy', ?, ?, ?, ?, ?, 'platform', 'paid', ?, ?, 'completed', ?)`).run(
        orderId, req.user.outlet_id, orderNumber, row.customer_name || 'Swiggy Customer',
        row.customer_phone || null, subtotal, tax, total, row.order_id, commission,
        row.items_text || null
      );
      imported++;
    }

    db.prepare('INSERT INTO csv_imports (id, platform, filename, records_imported, imported_by) VALUES (?, ?, ?, ?, ?)').run(
      importId, 'swiggy', 'manual_import', imported, req.user.id
    );
  });

  try {
    importTx();
    res.json({ import_id: importId, records_imported: imported });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/history', authMiddleware, (req, res) => {
  const db = getDb();
  const imports = db.prepare('SELECT * FROM csv_imports ORDER BY imported_at DESC LIMIT 50').all();
  res.json(imports);
});

module.exports = router;
