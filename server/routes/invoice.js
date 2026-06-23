const express = require('express');
const { getDb } = require('../db/schema');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// Generate GST invoice HTML for an order
router.get('/:orderId', authMiddleware, (req, res) => {
  const db = getDb();
  const order = db.prepare('SELECT * FROM orders WHERE id = ? AND outlet_id = ?').get(req.params.orderId, req.user.outlet_id);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  const outlet = db.prepare('SELECT * FROM outlets WHERE id = ?').get(order.outlet_id);
  const items = db.prepare(`
    SELECT oi.*, mi.name as item_name, mi.is_veg, mi.hsn_code
    FROM order_items oi JOIN menu_items mi ON oi.menu_item_id = mi.id
    WHERE oi.order_id = ?
  `).all(order.id);
  const payments = db.prepare('SELECT * FROM payments WHERE order_id = ?').all(order.id);

  const cgst = Math.round(order.tax_amount / 2 * 100) / 100;
  const sgst = cgst;

  res.json({
    invoice: {
      outlet_name: outlet.name,
      outlet_address: outlet.address,
      outlet_gstin: outlet.gstin,
      outlet_fssai: outlet.fssai_no,
      order_number: order.order_number,
      order_type: order.order_type,
      order_date: order.created_at,
      customer_name: order.customer_name,
      customer_phone: order.customer_phone,
      items: items.map(i => ({
        name: i.item_name,
        hsn: i.hsn_code,
        qty: i.quantity,
        rate: i.unit_price,
        tax_percent: i.tax_percent,
        tax_amount: i.tax_amount,
        total: i.total,
        is_veg: i.is_veg
      })),
      subtotal: order.subtotal,
      cgst,
      sgst,
      total_tax: order.tax_amount,
      discount: order.discount_amount,
      grand_total: order.total,
      payment_method: order.payment_method,
      payments: payments.map(p => ({ method: p.method, amount: p.amount, reference: p.reference_no }))
    }
  });
});

module.exports = router;
