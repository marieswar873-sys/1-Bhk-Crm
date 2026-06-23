require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDb } = require('./db/schema');
const { startDailyReportCron, sendTestReport } = require('./services/emailReport');
const { authMiddleware, requireRole } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// API routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/menu', require('./routes/menu'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/tables', require('./routes/tables'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/import', require('./routes/csv-import'));
app.use('/api/invoice', require('./routes/invoice'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/public', require('./routes/public'));

app.post('/api/reports/send-daily', authMiddleware, requireRole('admin'), async (req, res) => {
  try { await sendTestReport(); res.json({ success: true, message: "Today's sales report sent!" }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// Serve frontend in production
const clientBuild = path.join(__dirname, '..', 'client', 'build');
app.use(express.static(clientBuild));
app.get('/{*splat}', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(clientBuild, 'index.html'));
  }
});

// Initialize DB then start server
initDb().then(() => {
  app.listen(PORT, () => {
    console.log(`1BHK CRM Server running on port ${PORT}`);
    startDailyReportCron();
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
