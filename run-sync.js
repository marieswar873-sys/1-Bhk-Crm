// Temporary script to run sync via Electron
const { app } = require('electron');
const path = require('path');

app.whenReady().then(async () => {
  process.env.DB_PATH = path.join(app.getPath('userData'), 'restaurant.db');
  // Sync now authenticates with the tenant API key (env TENANT_API_KEY or the
  // 'cloud_api_key' row in SQLite settings) — no Supabase service key needed.
  try { require('dotenv').config({ path: path.join(__dirname, '.env') }); } catch {}

  const { initDb } = require('./server/db/schema');
  initDb();

  const { fullSync } = require('./server/services/supabaseSync');
  try {
    await fullSync();
    console.log('SYNC COMPLETE!');
  } catch (e) {
    console.error('SYNC FAILED:', e.message);
  }
  app.quit();
});
