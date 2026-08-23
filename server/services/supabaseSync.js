// Cloud sync — pushes local SQLite data to the SaaS API using the tenant's API key.
// SECURITY: the desktop app never holds a Supabase service key. It only knows its own
// tenant API key, and the server scopes every write to that tenant. A leaked key can
// only ever touch one restaurant's data.
const { getDb } = require('../db/schema');
const { v4: uuid } = require('uuid');

const DEFAULT_API_URL = 'https://saas-7i5z.onrender.com';

function getSetting(key) {
  try {
    const row = getDb().prepare('SELECT value FROM settings WHERE key = ? LIMIT 1').get(key);
    return row?.value || null;
  } catch {
    return null;
  }
}

// API key resolution: env var (baked at build) → SQLite settings ('cloud_api_key', set by owner in-app)
function getApiKey() {
  return process.env.TENANT_API_KEY || getSetting('cloud_api_key') || null;
}

function getApiUrl() {
  return process.env.SAAS_API_URL || getSetting('cloud_api_url') || DEFAULT_API_URL;
}

function getMachineId() {
  try { return require('../../license').machineId(); } catch { return 'unknown'; }
}

async function postJson(path, body, apiKey) {
  const res = await fetch(`${getApiUrl()}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey, 'X-Machine-ID': getMachineId() },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `${path} failed (${res.status})`);
  return data;
}

async function getJson(path, apiKey) {
  const res = await fetch(`${getApiUrl()}${path}`, { headers: { 'X-API-Key': apiKey, 'X-Machine-ID': getMachineId() } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `${path} failed (${res.status})`);
  return data;
}

// Cloud order_type is constrained to dine_in/takeaway; fold platform orders into takeaway.
function normalizeOrderType(t) {
  return t === 'dine_in' ? 'dine_in' : 'takeaway';
}

// Pull menu + outlet info from the cloud into the local DB (fresh install / restore).
async function restoreFromCloud(apiKey) {
  apiKey = apiKey || getApiKey();
  if (!apiKey) throw new Error('No API key set');
  const db = getDb();
  const outlet = db.prepare('SELECT id FROM outlets LIMIT 1').get();
  if (!outlet) throw new Error('No outlet found in local database');

  const [menu, info] = await Promise.all([
    getJson('/api/sync/menu', apiKey),
    getJson('/api/sync/info', apiKey).catch(() => ({})),
  ]);

  const insCat = db.prepare('INSERT OR REPLACE INTO categories (id, name, outlet_id, sort_order) VALUES (?, ?, ?, ?)');
  const insItem = db.prepare('INSERT OR REPLACE INTO menu_items (id, name, category_id, outlet_id, price, tax_percent, is_veg, is_available, packing_charge) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const insVar = db.prepare('INSERT OR REPLACE INTO menu_variants (id, menu_item_id, name, price_delta) VALUES (?, ?, ?, ?)');
  const setSetting = db.prepare('INSERT INTO settings (id, outlet_id, key, value) VALUES (?, ?, ?, ?) ON CONFLICT(outlet_id, key) DO UPDATE SET value=excluded.value');

  const settingsMap = {
    outlet_name: info.name, outlet_address: info.address, outlet_phone: info.phone,
    outlet_gstin: info.gstin, outlet_fssai: info.fssai, whatsapp_number: info.whatsapp_number,
    company_email: info.email, hero_tagline: info.tagline,
  };

  db.transaction(() => {
    for (const c of (menu.categories || [])) insCat.run(c.id, c.name, outlet.id, c.sort_order || 0);
    for (const i of (menu.items || [])) insItem.run(i.id, i.name, i.category_id, outlet.id, i.price, i.tax_percent ?? 5, i.is_veg ? 1 : 0, i.is_available === false ? 0 : 1, i.packing_charge ?? 0);
    for (const v of (menu.variants || [])) insVar.run(v.id, v.menu_item_id, v.name, v.price_delta ?? 0);
    for (const [k, val] of Object.entries(settingsMap)) if (val) setSetting.run(uuid(), outlet.id, k, String(val));
  })();

  const counts = { categories: (menu.categories || []).length, items: (menu.items || []).length, variants: (menu.variants || []).length };
  console.log(`[Restore] Pulled ${counts.items} items / ${counts.categories} categories from cloud`);
  return counts;
}

async function syncMenu(apiKey) {
  const db = getDb();
  const outlet = db.prepare('SELECT * FROM outlets LIMIT 1').get();
  if (!outlet) return;

  const categories = db.prepare('SELECT id, name, sort_order FROM categories WHERE outlet_id = ?').all(outlet.id);
  const items = db.prepare('SELECT id, name, category_id, price, tax_percent, is_veg, is_available, packing_charge FROM menu_items WHERE outlet_id = ?').all(outlet.id);
  const variants = db.prepare('SELECT mv.id, mv.menu_item_id, mv.name, mv.price_delta FROM menu_variants mv JOIN menu_items mi ON mv.menu_item_id = mi.id WHERE mi.outlet_id = ?').all(outlet.id);

  const out = await postJson('/api/sync/menu', { categories, items, variants }, apiKey);
  console.log(`[Sync] Menu pushed — ${out.synced?.categories || 0} cats, ${out.synced?.items || 0} items, ${out.synced?.variants || 0} variants`);
}

async function syncOrders(apiKey) {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM orders WHERE synced = 0 AND status IN ('completed','cancelled') ORDER BY created_at LIMIT 100").all();
  if (!rows.length) return;

  const orders = rows.map(o => {
    const items = db.prepare(`
      SELECT oi.quantity, oi.unit_price, oi.tax_amount, oi.total, oi.packing_charge,
             mi.name AS item_name, mi.is_veg, mv.name AS variant_name
      FROM order_items oi
      JOIN menu_items mi ON oi.menu_item_id = mi.id
      LEFT JOIN menu_variants mv ON oi.variant_id = mv.id
      WHERE oi.order_id = ?`).all(o.id);
    return {
      local_id: o.id,
      order_number: o.order_number,
      order_type: normalizeOrderType(o.order_type),
      customer_name: o.customer_name,
      customer_phone: o.customer_phone,
      status: o.status,
      subtotal: o.subtotal,
      tax_amount: o.tax_amount,
      packing_charges: o.packing_charges,
      discount_amount: o.discount_amount || 0,
      discount_type: o.discount_type || 'flat',
      total: o.total,
      payment_method: o.payment_method,
      payment_status: o.payment_status,
      bill_printed: o.bill_printed,
      created_at: o.created_at,
      completed_at: o.completed_at,
      items,
    };
  });

  const out = await postJson('/api/sync/orders', { orders }, apiKey);
  // Server dedupes by local_id, so it's safe to mark everything we sent as synced.
  const mark = db.prepare('UPDATE orders SET synced = 1 WHERE id = ?');
  const tx = db.transaction(ids => { for (const id of ids) mark.run(id); });
  tx(rows.map(o => o.id));
  console.log(`[Sync] Orders pushed — ${out.synced || 0} new (${orders.length} sent)`);
}

function toISTDateStr(d = new Date()) {
  return new Date(d.getTime() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

async function syncDailySummary(apiKey) {
  const db = getDb();
  const today = toISTDateStr();
  const s = db.prepare(`
    SELECT COUNT(*) AS total_orders,
      COALESCE(SUM(CASE WHEN payment_status='paid' THEN total ELSE 0 END), 0) AS total_revenue,
      COALESCE(SUM(CASE WHEN payment_status='paid' THEN tax_amount ELSE 0 END), 0) AS total_tax,
      COALESCE(SUM(CASE WHEN order_type='dine_in' AND payment_status='paid' THEN total ELSE 0 END), 0) AS dine_in_revenue,
      COALESCE(SUM(CASE WHEN order_type!='dine_in' AND payment_status='paid' THEN total ELSE 0 END), 0) AS takeaway_revenue,
      COUNT(CASE WHEN order_type='dine_in' THEN 1 END) AS dine_in_count,
      COUNT(CASE WHEN order_type!='dine_in' THEN 1 END) AS takeaway_count,
      COUNT(CASE WHEN status='cancelled' THEN 1 END) AS cancelled_count
    FROM orders WHERE date(created_at) = ?`).get(today);
  await postJson('/api/sync/summary', { date: today, ...s }, apiKey);
  console.log(`[Sync] Daily summary pushed for ${today}`);
}

async function syncInventory(apiKey) {
  const db = getDb();
  const outlet = db.prepare('SELECT id FROM outlets LIMIT 1').get();
  if (!outlet) return;
  const items = db.prepare('SELECT * FROM inventory_items WHERE outlet_id = ?').all(outlet.id);
  const transactions = db.prepare('SELECT * FROM inventory_transactions WHERE outlet_id = ?').all(outlet.id);
  if (!items.length && !transactions.length) return;
  const out = await postJson('/api/sync/inventory', { items, transactions }, apiKey);
  console.log(`[Sync] Inventory pushed — ${out.synced?.items || 0} items, ${out.synced?.transactions || 0} txns`);
}

async function syncPlatformSales(apiKey) {
  const db = getDb();
  const outlet = db.prepare('SELECT id FROM outlets LIMIT 1').get();
  if (!outlet) return;
  const sales = db.prepare('SELECT * FROM platform_sales WHERE outlet_id = ?').all(outlet.id);
  if (!sales.length) return;
  const out = await postJson('/api/sync/platform-sales', { sales }, apiKey);
  console.log(`[Sync] Platform sales pushed — ${out.synced || 0} records`);
}

async function fullSync() {
  const apiKey = getApiKey();
  if (!apiKey) { console.log('[Sync] No tenant API key set — sync skipped. Add it in Settings.'); return; }
  try {
    // First-run: if this install has no menu yet, pull it down from the cloud.
    const menuCount = getDb().prepare('SELECT COUNT(*) AS n FROM menu_items').get().n;
    if (menuCount === 0) {
      try { await restoreFromCloud(apiKey); } catch (e) { console.warn('[Restore] auto-pull skipped:', e.message); }
    }
    await syncMenu(apiKey);
    await syncOrders(apiKey);
    try { await syncDailySummary(apiKey); } catch (e) { console.warn('[Sync] Summary skipped:', e.message); }
    try { await syncInventory(apiKey); } catch (e) { console.warn('[Sync] Inventory skipped:', e.message); }
    try { await syncPlatformSales(apiKey); } catch (e) { console.warn('[Sync] Platform sales skipped:', e.message); }
    console.log(`[Sync] Complete at ${new Date().toLocaleTimeString()}`);
  } catch (err) {
    console.error('[Sync] Error:', err.message);
  }
}

function startSyncService() {
  // Always schedule — the owner may paste their API key after first launch.
  setTimeout(() => fullSync(), 10000);
  setInterval(() => fullSync(), 5 * 60 * 1000);
  console.log(`[Sync] Cloud sync scheduled (every 5 min) → ${getApiUrl()}`);
}

module.exports = { startSyncService, fullSync, syncMenu, syncOrders, syncInventory, syncPlatformSales, getApiKey, restoreFromCloud };
