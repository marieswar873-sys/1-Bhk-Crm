const express = require('express');
const { getDb } = require('../db/schema');
const { authMiddleware } = require('../middleware/auth');
const router = express.Router();

router.get('/summary', authMiddleware, (req, res) => {
  const { from, to } = req.query; const dateFrom=from||new Date().toISOString().slice(0,10); const dateTo=to||dateFrom;
  res.json(getDb().prepare(`SELECT COUNT(*) as total_orders, COALESCE(SUM(CASE WHEN payment_status='paid' THEN total ELSE 0 END),0) as total_revenue, COALESCE(SUM(CASE WHEN payment_status='paid' THEN tax_amount ELSE 0 END),0) as total_tax, COALESCE(SUM(CASE WHEN order_type='dine_in' AND payment_status='paid' THEN total ELSE 0 END),0) as dine_in_revenue, COALESCE(SUM(CASE WHEN order_type='takeaway' AND payment_status='paid' THEN total ELSE 0 END),0) as takeaway_revenue, COALESCE(SUM(CASE WHEN order_type='zomato' AND payment_status='paid' THEN total ELSE 0 END),0) as zomato_revenue, COALESCE(SUM(CASE WHEN order_type='swiggy' AND payment_status='paid' THEN total ELSE 0 END),0) as swiggy_revenue, COUNT(CASE WHEN order_type='dine_in' THEN 1 END) as dine_in_count, COUNT(CASE WHEN order_type='takeaway' THEN 1 END) as takeaway_count, COUNT(CASE WHEN order_type='zomato' THEN 1 END) as zomato_count, COUNT(CASE WHEN order_type='swiggy' THEN 1 END) as swiggy_count, COUNT(CASE WHEN status='cancelled' THEN 1 END) as cancelled_count FROM orders WHERE outlet_id=? AND date(created_at) BETWEEN ? AND ?`).get(req.user.outlet_id, dateFrom, dateTo));
});
router.get('/top-items', authMiddleware, (req, res) => {
  const { from, to, limit } = req.query; const dateFrom=from||new Date().toISOString().slice(0,10); const dateTo=to||dateFrom;
  res.json(getDb().prepare('SELECT mi.name, mi.is_veg, SUM(oi.quantity) as total_qty, SUM(oi.total) as total_revenue FROM order_items oi JOIN orders o ON oi.order_id=o.id JOIN menu_items mi ON oi.menu_item_id=mi.id WHERE o.outlet_id=? AND date(o.created_at) BETWEEN ? AND ? AND o.status!=\'cancelled\' GROUP BY mi.id ORDER BY total_qty DESC LIMIT ?').all(req.user.outlet_id, dateFrom, dateTo, parseInt(limit)||10));
});
router.get('/hourly', authMiddleware, (req, res) => {
  const date = req.query.date||new Date().toISOString().slice(0,10);
  res.json(getDb().prepare("SELECT strftime('%H',created_at) as hour, COUNT(*) as orders, SUM(total) as revenue FROM orders WHERE outlet_id=? AND date(created_at)=? AND status!='cancelled' GROUP BY strftime('%H',created_at) ORDER BY hour").all(req.user.outlet_id, date));
});
router.get('/daily-trend', authMiddleware, (req, res) => {
  const days = parseInt(req.query.days)||7;
  res.json(getDb().prepare(`SELECT date(created_at) as date, COUNT(*) as orders, SUM(total) as revenue, SUM(CASE WHEN order_type='dine_in' THEN total ELSE 0 END) as dine_in, SUM(CASE WHEN order_type='takeaway' THEN total ELSE 0 END) as takeaway, SUM(CASE WHEN order_type='zomato' THEN total ELSE 0 END) as zomato, SUM(CASE WHEN order_type='swiggy' THEN total ELSE 0 END) as swiggy FROM orders WHERE outlet_id=? AND created_at>=date('now',?) AND status!='cancelled' GROUP BY date(created_at) ORDER BY date`).all(req.user.outlet_id, `-${days} days`));
});
router.get('/payment-split', authMiddleware, (req, res) => {
  const date = req.query.date||new Date().toISOString().slice(0,10);
  res.json(getDb().prepare("SELECT payment_method, COUNT(*) as count, SUM(total) as amount FROM orders WHERE outlet_id=? AND date(created_at)=? AND payment_status='paid' GROUP BY payment_method").all(req.user.outlet_id, date));
});
router.get('/comparison', authMiddleware, (req, res) => {
  const db = getDb();
  const get = (d) => db.prepare(`SELECT COUNT(*) as total_orders, COALESCE(SUM(CASE WHEN payment_status='paid' THEN total ELSE 0 END),0) as revenue, COALESCE(SUM(CASE WHEN payment_status='paid' THEN tax_amount ELSE 0 END),0) as tax, COALESCE(AVG(CASE WHEN payment_status='paid' THEN total END),0) as avg_order FROM orders WHERE outlet_id=? AND date(created_at)=${d} AND status!='cancelled'`).get(req.user.outlet_id);
  res.json({ today: get("date('now')"), yesterday: get("date('now','-1 day')") });
});
module.exports = router;
