const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuid } = require('uuid');
const { getDb } = require('../db/schema');
const { generateToken, authMiddleware, requireRole } = require('../middleware/auth');

const router = express.Router();

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = generateToken(user);
  res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role, outlet_id: user.outlet_id }
  });
});

router.post('/register', authMiddleware, requireRole('admin'), (req, res) => {
  const { name, email, password, role, outlet_id } = req.body;
  if (!name || !email || !password || !role) {
    return res.status(400).json({ error: 'All fields required' });
  }

  const db = getDb();
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return res.status(409).json({ error: 'Email already exists' });

  const id = uuid();
  const hashedPw = bcrypt.hashSync(password, 10);
  db.prepare('INSERT INTO users (id, name, email, password, role, outlet_id) VALUES (?, ?, ?, ?, ?, ?)').run(
    id, name, email, hashedPw, role, outlet_id || req.user.outlet_id
  );

  res.status(201).json({ id, name, email, role });
});

router.get('/me', authMiddleware, (req, res) => {
  const db = getDb();
  const user = db.prepare('SELECT id, name, email, role, outlet_id FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});

module.exports = router;
