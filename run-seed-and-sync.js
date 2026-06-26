const { app } = require('electron');
const path = require('path');

app.whenReady().then(async () => {
  process.env.DB_PATH = path.join(app.getPath('userData'), 'restaurant.db');
  process.env.SUPABASE_URL = 'https://qubzxwtgyysnqvooyjnd.supabase.co';

  const { initDb } = require('./server/db/schema');
  initDb();

  // Seed 1BHK menu
  require('./server/db/seed-1bhk');

  // Sync to cloud
  const { fullSync } = require('./server/services/supabaseSync');
  try {
    await fullSync();
    console.log('SEED + SYNC COMPLETE!');
  } catch (e) {
    console.error('FAILED:', e.message);
  }
  app.quit();
});
