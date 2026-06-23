const express = require('express');
const { v4: uuid } = require('uuid');
const { getDb } = require('../db/schema');
const { authMiddleware, requireRole } = require('../middleware/auth');
const router = express.Router();
const pool = () => getDb();

router.get('/', authMiddleware, async (req, res) => {
  const { rows } = await pool().query(`
    SELECT tc.*, o.id as active_order_id, o.order_number, o.total as order_total
    FROM tables_config tc LEFT JOIN orders o ON tc.id = o.table_id AND o.status IN ('active','preparing','ready','served')
    WHERE tc.outlet_id = $1 ORDER BY tc.table_number
  `, [req.user.outlet_id]);
  res.json(rows);
});

router.post('/', authMiddleware, requireRole('admin', 'manager'), async (req, res) => {
  const { table_number, capacity } = req.body;
  if (!table_number) return res.status(400).json({ error: 'Table number required' });
  const { rows } = await pool().query('SELECT id FROM tables_config WHERE table_number=$1 AND outlet_id=$2', [table_number, req.user.outlet_id]);
  if (rows.length) return res.status(409).json({ error: 'Table number already exists' });
  const id = uuid();
  await pool().query('INSERT INTO tables_config (id, outlet_id, table_number, capacity) VALUES ($1,$2,$3,$4)', [id, req.user.outlet_id, table_number, capacity || 4]);
  res.status(201).json({ id, table_number, capacity });
});

router.put('/:id', authMiddleware, requireRole('admin', 'manager'), async (req, res) => {
  const { table_number, capacity } = req.body;
  await pool().query('UPDATE tables_config SET table_number=COALESCE($1, table_number), capacity=COALESCE($2, capacity) WHERE id=$3 AND outlet_id=$4',
    [table_number, capacity, req.params.id, req.user.outlet_id]);
  res.json({ success: true });
});

router.delete('/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  const { rows } = await pool().query('SELECT * FROM tables_config WHERE id=$1 AND outlet_id=$2', [req.params.id, req.user.outlet_id]);
  if (!rows[0]) return res.status(404).json({ error: 'Table not found' });
  if (rows[0].status === 'occupied') return res.status(400).json({ error: 'Cannot delete occupied table' });
  await pool().query('DELETE FROM tables_config WHERE id=$1', [req.params.id]);
  res.json({ success: true });
});

router.patch('/:id/status', authMiddleware, async (req, res) => {
  await pool().query('UPDATE tables_config SET status=$1 WHERE id=$2 AND outlet_id=$3', [req.body.status, req.params.id, req.user.outlet_id]);
  res.json({ success: true });
});

module.exports = router;
