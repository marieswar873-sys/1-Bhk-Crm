const express = require('express');
const { getDb } = require('../db/schema');
const { authMiddleware } = require('../middleware/auth');
const router = express.Router();
const pool = () => getDb();

router.get('/summary', authMiddleware, async (req, res) => {
  const { from, to } = req.query;
  const dateFrom = from || new Date().toISOString().slice(0, 10);
  const dateTo = to || dateFrom;

  const { rows } = await pool().query(`
    SELECT COUNT(*)::int as total_orders,
      COALESCE(SUM(CASE WHEN payment_status='paid' THEN total ELSE 0 END), 0)::numeric as total_revenue,
      COALESCE(SUM(CASE WHEN payment_status='paid' THEN tax_amount ELSE 0 END), 0)::numeric as total_tax,
      COALESCE(SUM(CASE WHEN order_type='dine_in' AND payment_status='paid' THEN total ELSE 0 END), 0)::numeric as dine_in_revenue,
      COALESCE(SUM(CASE WHEN order_type='takeaway' AND payment_status='paid' THEN total ELSE 0 END), 0)::numeric as takeaway_revenue,
      COALESCE(SUM(CASE WHEN order_type='zomato' AND payment_status='paid' THEN total ELSE 0 END), 0)::numeric as zomato_revenue,
      COALESCE(SUM(CASE WHEN order_type='swiggy' AND payment_status='paid' THEN total ELSE 0 END), 0)::numeric as swiggy_revenue,
      COUNT(CASE WHEN order_type='dine_in' THEN 1 END)::int as dine_in_count,
      COUNT(CASE WHEN order_type='takeaway' THEN 1 END)::int as takeaway_count,
      COUNT(CASE WHEN order_type='zomato' THEN 1 END)::int as zomato_count,
      COUNT(CASE WHEN order_type='swiggy' THEN 1 END)::int as swiggy_count,
      COUNT(CASE WHEN status='cancelled' THEN 1 END)::int as cancelled_count
    FROM orders WHERE outlet_id = $1 AND created_at::date BETWEEN $2 AND $3
  `, [req.user.outlet_id, dateFrom, dateTo]);
  res.json(rows[0]);
});

router.get('/top-items', authMiddleware, async (req, res) => {
  const { from, to, limit } = req.query;
  const dateFrom = from || new Date().toISOString().slice(0, 10);
  const dateTo = to || dateFrom;

  const { rows } = await pool().query(`
    SELECT mi.name, mi.is_veg, SUM(oi.quantity)::int as total_qty, SUM(oi.total)::numeric as total_revenue
    FROM order_items oi JOIN orders o ON oi.order_id = o.id JOIN menu_items mi ON oi.menu_item_id = mi.id
    WHERE o.outlet_id = $1 AND o.created_at::date BETWEEN $2 AND $3 AND o.status != 'cancelled'
    GROUP BY mi.id, mi.name, mi.is_veg ORDER BY total_qty DESC LIMIT $4
  `, [req.user.outlet_id, dateFrom, dateTo, parseInt(limit) || 10]);
  res.json(rows);
});

router.get('/hourly', authMiddleware, async (req, res) => {
  const date = req.query.date || new Date().toISOString().slice(0, 10);
  const { rows } = await pool().query(`
    SELECT to_char(created_at, 'HH24') as hour, COUNT(*)::int as orders, SUM(total)::numeric as revenue
    FROM orders WHERE outlet_id = $1 AND created_at::date = $2 AND status != 'cancelled'
    GROUP BY to_char(created_at, 'HH24') ORDER BY hour
  `, [req.user.outlet_id, date]);
  res.json(rows);
});

router.get('/daily-trend', authMiddleware, async (req, res) => {
  const days = parseInt(req.query.days) || 7;
  const { rows } = await pool().query(`
    SELECT created_at::date as date, COUNT(*)::int as orders, SUM(total)::numeric as revenue,
      SUM(CASE WHEN order_type='dine_in' THEN total ELSE 0 END)::numeric as dine_in,
      SUM(CASE WHEN order_type='takeaway' THEN total ELSE 0 END)::numeric as takeaway,
      SUM(CASE WHEN order_type='zomato' THEN total ELSE 0 END)::numeric as zomato,
      SUM(CASE WHEN order_type='swiggy' THEN total ELSE 0 END)::numeric as swiggy
    FROM orders WHERE outlet_id = $1 AND created_at >= CURRENT_DATE - INTERVAL '${days} days' AND status != 'cancelled'
    GROUP BY created_at::date ORDER BY date
  `, [req.user.outlet_id]);
  res.json(rows);
});

router.get('/payment-split', authMiddleware, async (req, res) => {
  const date = req.query.date || new Date().toISOString().slice(0, 10);
  const { rows } = await pool().query(`
    SELECT payment_method, COUNT(*)::int as count, SUM(total)::numeric as amount
    FROM orders WHERE outlet_id = $1 AND created_at::date = $2 AND payment_status = 'paid'
    GROUP BY payment_method
  `, [req.user.outlet_id, date]);
  res.json(rows);
});

router.get('/comparison', authMiddleware, async (req, res) => {
  const getStats = async (dateExpr) => {
    const { rows } = await pool().query(`
      SELECT COUNT(*)::int as total_orders,
        COALESCE(SUM(CASE WHEN payment_status='paid' THEN total ELSE 0 END), 0)::numeric as revenue,
        COALESCE(SUM(CASE WHEN payment_status='paid' THEN tax_amount ELSE 0 END), 0)::numeric as tax,
        COALESCE(AVG(CASE WHEN payment_status='paid' THEN total END), 0)::numeric as avg_order
      FROM orders WHERE outlet_id = $1 AND created_at::date = ${dateExpr} AND status != 'cancelled'
    `, [req.user.outlet_id]);
    return rows[0];
  };
  const today = await getStats('CURRENT_DATE');
  const yesterday = await getStats("CURRENT_DATE - 1");
  res.json({ today, yesterday });
});

module.exports = router;
