const express = require('express');
const { getDb } = require('../db/schema');
const { authMiddleware } = require('../middleware/auth');
const router = express.Router();
const pool = () => getDb();

router.get('/:orderId', authMiddleware, async (req, res) => {
  const { rows: orders } = await pool().query('SELECT * FROM orders WHERE id = $1 AND outlet_id = $2', [req.params.orderId, req.user.outlet_id]);
  if (!orders[0]) return res.status(404).json({ error: 'Order not found' });
  const order = orders[0];
  const { rows: outlets } = await pool().query('SELECT * FROM outlets WHERE id = $1', [order.outlet_id]);
  const { rows: items } = await pool().query(`
    SELECT oi.*, mi.name as item_name, mi.is_veg, mi.hsn_code FROM order_items oi
    JOIN menu_items mi ON oi.menu_item_id = mi.id WHERE oi.order_id = $1
  `, [order.id]);
  const { rows: payments } = await pool().query('SELECT * FROM payments WHERE order_id = $1', [order.id]);
  const cgst = Math.round(parseFloat(order.tax_amount) / 2 * 100) / 100;
  res.json({ invoice: {
    outlet_name: outlets[0]?.name, outlet_address: outlets[0]?.address, outlet_gstin: outlets[0]?.gstin, outlet_fssai: outlets[0]?.fssai_no,
    order_number: order.order_number, order_type: order.order_type, order_date: order.created_at,
    customer_name: order.customer_name, customer_phone: order.customer_phone,
    items: items.map(i => ({ name: i.item_name, hsn: i.hsn_code, qty: i.quantity, rate: i.unit_price, tax_percent: i.tax_percent, tax_amount: i.tax_amount, total: i.total, is_veg: i.is_veg })),
    subtotal: order.subtotal, cgst, sgst: cgst, total_tax: order.tax_amount, discount: order.discount_amount,
    packing_charges: order.packing_charges, grand_total: order.total, payment_method: order.payment_method,
    payments: payments.map(p => ({ method: p.method, amount: p.amount, reference: p.reference_no }))
  }});
});

module.exports = router;
