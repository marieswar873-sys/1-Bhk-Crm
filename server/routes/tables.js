const express = require('express');
const { v4: uuid } = require('uuid');
const { getDb } = require('../db/schema');
const { authMiddleware, requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/', authMiddleware, (req, res) => {
  const db = getDb();
  const tables = db.prepare(`
    SELECT tc.*, o.id as active_order_id, o.order_number, o.total as order_total
    FROM tables_config tc
    LEFT JOIN orders o ON tc.id = o.table_id AND o.status IN ('active','preparing','ready','served')
    WHERE tc.outlet_id = ?
    ORDER BY tc.table_number
  `).all(req.user.outlet_id);
  res.json(tables);
});

router.post('/', authMiddleware, requireRole('admin', 'manager'), (req, res) => {
  const { table_number, capacity } = req.body;
  if (!table_number) return res.status(400).json({ error: 'Table number required' });

  const db = getDb();
  const existing = db.prepare('SELECT id FROM tables_config WHERE table_number = ? AND outlet_id = ?').get(table_number, req.user.outlet_id);
  if (existing) return res.status(409).json({ error: 'Table number already exists' });

  const id = uuid();
  db.prepare('INSERT INTO tables_config (id, outlet_id, table_number, capacity) VALUES (?, ?, ?, ?)').run(
    id, req.user.outlet_id, table_number, capacity || 4
  );
  res.status(201).json({ id, table_number, capacity });
});

router.put('/:id', authMiddleware, requireRole('admin', 'manager'), (req, res) => {
  const { table_number, capacity } = req.body;
  const db = getDb();
  const table = db.prepare('SELECT * FROM tables_config WHERE id = ? AND outlet_id = ?').get(req.params.id, req.user.outlet_id);
  if (!table) return res.status(404).json({ error: 'Table not found' });

  db.prepare('UPDATE tables_config SET table_number = ?, capacity = ? WHERE id = ?').run(
    table_number || table.table_number, capacity ?? table.capacity, req.params.id
  );
  res.json({ success: true });
});

router.delete('/:id', authMiddleware, requireRole('admin'), (req, res) => {
  const db = getDb();
  const table = db.prepare('SELECT * FROM tables_config WHERE id = ? AND outlet_id = ?').get(req.params.id, req.user.outlet_id);
  if (!table) return res.status(404).json({ error: 'Table not found' });
  if (table.status === 'occupied') return res.status(400).json({ error: 'Cannot delete occupied table' });

  db.prepare('DELETE FROM tables_config WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

router.patch('/:id/status', authMiddleware, (req, res) => {
  const { status } = req.body;
  const db = getDb();
  db.prepare('UPDATE tables_config SET status = ? WHERE id = ? AND outlet_id = ?').run(status, req.params.id, req.user.outlet_id);
  res.json({ success: true });
});

module.exports = router;
