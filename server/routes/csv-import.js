const express = require('express');
const { v4: uuid } = require('uuid');
const { getDb } = require('../db/schema');
const { authMiddleware, requireRole } = require('../middleware/auth');
const router = express.Router();

router.post('/zomato', authMiddleware, requireRole('admin','manager'), (req, res) => {
  const { orders } = req.body; if (!orders?.length) return res.status(400).json({ error: 'No orders' });
  const db = getDb(); const importId = uuid(); let imported = 0;
  db.transaction(() => {
    for (const row of orders) {
      if (db.prepare('SELECT id FROM orders WHERE platform_order_id=? AND order_type=?').get(row.order_id,'zomato')) continue;
      const orderId=uuid(), today=new Date().toISOString().slice(0,10).replace(/-/g,'');
      const c = db.prepare('SELECT COUNT(*) as c FROM orders WHERE outlet_id=?').get(req.user.outlet_id).c;
      db.prepare("INSERT INTO orders (id,outlet_id,order_number,order_type,customer_name,subtotal,tax_amount,total,payment_method,payment_status,platform_order_id,platform_commission,status,notes) VALUES (?,'"+req.user.outlet_id+"',?,\'zomato\',?,?,?,?,\'platform\',\'paid\',?,?,\'completed\',?)").run(orderId,`ZOM-${today}-${String(c+1).padStart(4,'0')}`,row.customer_name||'Zomato',parseFloat(row.subtotal)||0,parseFloat(row.tax)||0,parseFloat(row.total)||0,row.order_id,parseFloat(row.commission)||0,row.items_text||null);
      imported++;
    }
    db.prepare('INSERT INTO csv_imports (id,platform,filename,records_imported,imported_by) VALUES (?,?,?,?,?)').run(importId,'zomato','manual',imported,req.user.id);
  })();
  res.json({ import_id: importId, records_imported: imported });
});

router.post('/swiggy', authMiddleware, requireRole('admin','manager'), (req, res) => {
  const { orders } = req.body; if (!orders?.length) return res.status(400).json({ error: 'No orders' });
  const db = getDb(); const importId = uuid(); let imported = 0;
  db.transaction(() => {
    for (const row of orders) {
      if (db.prepare('SELECT id FROM orders WHERE platform_order_id=? AND order_type=?').get(row.order_id,'swiggy')) continue;
      const orderId=uuid(), today=new Date().toISOString().slice(0,10).replace(/-/g,'');
      const c = db.prepare('SELECT COUNT(*) as c FROM orders WHERE outlet_id=?').get(req.user.outlet_id).c;
      db.prepare("INSERT INTO orders (id,outlet_id,order_number,order_type,customer_name,subtotal,tax_amount,total,payment_method,payment_status,platform_order_id,platform_commission,status,notes) VALUES (?,'"+req.user.outlet_id+"',?,\'swiggy\',?,?,?,?,\'platform\',\'paid\',?,?,\'completed\',?)").run(orderId,`SWG-${today}-${String(c+1).padStart(4,'0')}`,row.customer_name||'Swiggy',parseFloat(row.subtotal)||0,parseFloat(row.tax)||0,parseFloat(row.total)||0,row.order_id,parseFloat(row.commission)||0,row.items_text||null);
      imported++;
    }
    db.prepare('INSERT INTO csv_imports (id,platform,filename,records_imported,imported_by) VALUES (?,?,?,?,?)').run(importId,'swiggy','manual',imported,req.user.id);
  })();
  res.json({ import_id: importId, records_imported: imported });
});

router.get('/history', authMiddleware, (req, res) => {
  res.json(getDb().prepare('SELECT * FROM csv_imports ORDER BY imported_at DESC LIMIT 50').all());
});

module.exports = router;
