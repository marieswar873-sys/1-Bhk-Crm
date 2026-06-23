const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuid } = require('uuid');
const { getDb } = require('../db/schema');
const { generateToken, authMiddleware, requireRole } = require('../middleware/auth');

const router = express.Router();

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  const pool = getDb();
  const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
  const user = rows[0];
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = generateToken(user);
  res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role, outlet_id: user.outlet_id }
  });
});

router.post('/register', authMiddleware, requireRole('admin'), async (req, res) => {
  const { name, email, password, role, outlet_id } = req.body;
  if (!name || !email || !password || !role) return res.status(400).json({ error: 'All fields required' });

  const pool = getDb();
  const { rows } = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
  if (rows.length) return res.status(409).json({ error: 'Email already exists' });

  const id = uuid();
  const hashedPw = bcrypt.hashSync(password, 10);
  await pool.query('INSERT INTO users (id, name, email, password, role, outlet_id) VALUES ($1, $2, $3, $4, $5, $6)',
    [id, name, email, hashedPw, role, outlet_id || req.user.outlet_id]);

  res.status(201).json({ id, name, email, role });
});

router.get('/me', authMiddleware, async (req, res) => {
  const pool = getDb();
  const { rows } = await pool.query('SELECT id, name, email, role, outlet_id FROM users WHERE id = $1', [req.user.id]);
  if (!rows[0]) return res.status(404).json({ error: 'User not found' });
  res.json(rows[0]);
});

module.exports = router;
