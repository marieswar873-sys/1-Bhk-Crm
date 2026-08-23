const express = require('express');
const { v4: uuid } = require('uuid');
const { getDb } = require('../db/schema');
const { authMiddleware } = require('../middleware/auth');
const router = express.Router();
router.use(authMiddleware);

// Ensure inventory tables exist (safe to call repeatedly)
function ensureTables() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS inventory_items (
      id TEXT PRIMARY KEY, outlet_id TEXT NOT NULL,
      name TEXT NOT NULL, unit TEXT NOT NULL DEFAULT 'kg',
      current_stock REAL DEFAULT 0, min_stock REAL DEFAULT 0,
      cost_per_unit REAL DEFAULT 0, category TEXT DEFAULT 'General',
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS inventory_transactions (
      id TEXT PRIMARY KEY, item_id TEXT NOT NULL,
      outlet_id TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('stock_in','stock_out','adjustment')),
      quantity REAL NOT NULL, notes TEXT, created_by TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);
}

router.get('/', (req, res) => {
  try {
    ensureTables();
    const items = getDb().prepare('SELECT * FROM inventory_items WHERE outlet_id = ? ORDER BY name').all(req.user.outlet_id);
    res.json(items);
  } catch (err) {
    console.error('[Inventory] GET error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/', (req, res) => {
  try {
    ensureTables();
    const { name, unit, current_stock, min_stock, cost_per_unit, category } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });
    const id = uuid();
    getDb().prepare('INSERT INTO inventory_items (id, outlet_id, name, unit, current_stock, min_stock, cost_per_unit, category) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, req.user.outlet_id, name, unit || 'kg', parseFloat(current_stock) || 0, parseFloat(min_stock) || 0, parseFloat(cost_per_unit) || 0, category || 'General');
    res.status(201).json({ id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', (req, res) => {
  try {
    const { name, unit, min_stock, cost_per_unit, category } = req.body;
    getDb().prepare('UPDATE inventory_items SET name=?, unit=?, min_stock=?, cost_per_unit=?, category=? WHERE id=? AND outlet_id=?')
      .run(name, unit, parseFloat(min_stock) || 0, parseFloat(cost_per_unit) || 0, category || 'General', req.params.id, req.user.outlet_id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', (req, res) => {
  try {
    const db = getDb();
    db.prepare('DELETE FROM inventory_transactions WHERE item_id = ?').run(req.params.id);
    db.prepare('DELETE FROM inventory_items WHERE id = ? AND outlet_id = ?').run(req.params.id, req.user.outlet_id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/transaction', (req, res) => {
  try {
    ensureTables();
    const { type, quantity, notes } = req.body;
    if (!type || !quantity) return res.status(400).json({ error: 'Type and quantity required' });
    const db = getDb();
    const item = db.prepare('SELECT * FROM inventory_items WHERE id = ? AND outlet_id = ?').get(req.params.id, req.user.outlet_id);
    if (!item) return res.status(404).json({ error: 'Item not found' });
    const qty = parseFloat(quantity);
    const delta = type === 'stock_in' ? qty : type === 'stock_out' ? -qty : qty;
    const newStock = Math.max(0, item.current_stock + delta);
    db.prepare('UPDATE inventory_items SET current_stock = ? WHERE id = ?').run(newStock, item.id);
    db.prepare('INSERT INTO inventory_transactions (id, item_id, outlet_id, type, quantity, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(uuid(), item.id, req.user.outlet_id, type, qty, notes || null, req.user.id);
    res.json({ success: true, new_stock: newStock });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/transactions', (req, res) => {
  try {
    const txns = getDb().prepare('SELECT t.*, u.name as by_name FROM inventory_transactions t LEFT JOIN users u ON t.created_by = u.id WHERE t.item_id = ? AND t.outlet_id = ? ORDER BY t.created_at DESC LIMIT 50')
      .all(req.params.id, req.user.outlet_id);
    res.json(txns);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
