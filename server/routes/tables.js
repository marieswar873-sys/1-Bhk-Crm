const express = require('express');
const { v4: uuid } = require('uuid');
const { getDb } = require('../db/schema');
const { authMiddleware, requireRole } = require('../middleware/auth');
const router = express.Router();

router.get('/', authMiddleware, (req, res) => {
  res.json(getDb().prepare('SELECT tc.*, o.id as active_order_id, o.order_number, o.total as order_total FROM tables_config tc LEFT JOIN orders o ON tc.id=o.table_id AND o.status IN (\'active\',\'preparing\',\'ready\',\'served\') WHERE tc.outlet_id=? ORDER BY tc.table_number').all(req.user.outlet_id));
});
router.post('/', authMiddleware, requireRole('admin','manager'), (req, res) => {
  if (!req.body.table_number) return res.status(400).json({ error: 'Table number required' });
  if (getDb().prepare('SELECT id FROM tables_config WHERE table_number=? AND outlet_id=?').get(req.body.table_number, req.user.outlet_id)) return res.status(409).json({ error: 'Table exists' });
  const id = uuid();
  getDb().prepare('INSERT INTO tables_config (id,outlet_id,table_number,capacity) VALUES (?,?,?,?)').run(id, req.user.outlet_id, req.body.table_number, req.body.capacity||4);
  res.status(201).json({ id, table_number: req.body.table_number });
});
router.put('/:id', authMiddleware, requireRole('admin','manager'), (req, res) => {
  getDb().prepare('UPDATE tables_config SET table_number=COALESCE(?,table_number),capacity=COALESCE(?,capacity) WHERE id=? AND outlet_id=?').run(req.body.table_number, req.body.capacity, req.params.id, req.user.outlet_id);
  res.json({ success: true });
});
router.delete('/:id', authMiddleware, requireRole('admin'), (req, res) => {
  const t = getDb().prepare('SELECT * FROM tables_config WHERE id=? AND outlet_id=?').get(req.params.id, req.user.outlet_id);
  if (!t) return res.status(404).json({ error: 'Not found' });
  if (t.status==='occupied') return res.status(400).json({ error: 'Cannot delete occupied table' });
  getDb().prepare('DELETE FROM tables_config WHERE id=?').run(req.params.id);
  res.json({ success: true });
});
router.patch('/:id/status', authMiddleware, (req, res) => {
  getDb().prepare('UPDATE tables_config SET status=? WHERE id=? AND outlet_id=?').run(req.body.status, req.params.id, req.user.outlet_id);
  res.json({ success: true });
});
module.exports = router;
