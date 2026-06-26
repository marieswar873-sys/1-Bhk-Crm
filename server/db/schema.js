const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');
const { v4: uuid } = require('uuid');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', '..', 'data', 'restaurant.db');

let db;

function getDb() {
  if (!db) {
    const fs = require('fs');
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db;
}

function initDb() {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS outlets (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, address TEXT, phone TEXT,
      gstin TEXT, fssai_no TEXT, created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('admin','manager','staff')),
      outlet_id TEXT REFERENCES outlets(id), created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, outlet_id TEXT NOT NULL REFERENCES outlets(id),
      sort_order INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS menu_items (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, category_id TEXT NOT NULL REFERENCES categories(id),
      outlet_id TEXT NOT NULL REFERENCES outlets(id), price REAL NOT NULL,
      tax_percent REAL DEFAULT 5.0, hsn_code TEXT DEFAULT '996331',
      is_veg INTEGER DEFAULT 1, is_available INTEGER DEFAULT 1, packing_charge REAL DEFAULT 10,
      platform_zomato INTEGER DEFAULT 1, platform_swiggy INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS menu_variants (
      id TEXT PRIMARY KEY, menu_item_id TEXT NOT NULL REFERENCES menu_items(id),
      name TEXT NOT NULL, price_delta REAL DEFAULT 0, created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS tables_config (
      id TEXT PRIMARY KEY, outlet_id TEXT NOT NULL REFERENCES outlets(id),
      table_number TEXT NOT NULL, capacity INTEGER DEFAULT 4,
      status TEXT DEFAULT 'available' CHECK(status IN ('available','occupied','reserved')),
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY, outlet_id TEXT NOT NULL REFERENCES outlets(id),
      order_number TEXT NOT NULL, order_type TEXT NOT NULL CHECK(order_type IN ('dine_in','takeaway','zomato','swiggy')),
      table_id TEXT REFERENCES tables_config(id), customer_name TEXT, customer_phone TEXT,
      status TEXT DEFAULT 'active' CHECK(status IN ('active','preparing','ready','served','completed','cancelled')),
      subtotal REAL DEFAULT 0, tax_amount REAL DEFAULT 0, discount_amount REAL DEFAULT 0,
      packing_charges REAL DEFAULT 0, total REAL DEFAULT 0,
      payment_method TEXT CHECK(payment_method IN ('cash','upi','card','split','platform')),
      payment_status TEXT DEFAULT 'pending' CHECK(payment_status IN ('pending','paid','refunded')),
      platform_order_id TEXT, platform_commission REAL DEFAULT 0,
      bill_printed INTEGER DEFAULT 0, discount_type TEXT, notes TEXT,
      created_by TEXT REFERENCES users(id), created_at TEXT DEFAULT (datetime('now')), completed_at TEXT,
      synced INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS kot_tokens (
      id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id),
      token_number INTEGER NOT NULL, status TEXT DEFAULT 'pending' CHECK(status IN ('pending','preparing','ready','served')),
      printed_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS order_items (
      id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id),
      menu_item_id TEXT NOT NULL REFERENCES menu_items(id),
      variant_id TEXT REFERENCES menu_variants(id), kot_id TEXT REFERENCES kot_tokens(id),
      quantity INTEGER NOT NULL DEFAULT 1, unit_price REAL NOT NULL,
      tax_percent REAL NOT NULL, tax_amount REAL NOT NULL, total REAL NOT NULL,
      packing_charge REAL DEFAULT 0, kot_printed INTEGER DEFAULT 0, notes TEXT
    );
    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id),
      method TEXT NOT NULL CHECK(method IN ('cash','upi','card')),
      amount REAL NOT NULL, reference_no TEXT, created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS csv_imports (
      id TEXT PRIMARY KEY, platform TEXT NOT NULL CHECK(platform IN ('zomato','swiggy')),
      filename TEXT NOT NULL, records_imported INTEGER DEFAULT 0,
      imported_by TEXT REFERENCES users(id), imported_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS settings (
      id TEXT PRIMARY KEY, outlet_id TEXT NOT NULL REFERENCES outlets(id),
      key TEXT NOT NULL, value TEXT NOT NULL, UNIQUE(outlet_id, key)
    );
    CREATE TABLE IF NOT EXISTS sync_log (
      id TEXT PRIMARY KEY, table_name TEXT NOT NULL, last_synced TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_orders_outlet ON orders(outlet_id);
    CREATE INDEX IF NOT EXISTS idx_orders_date ON orders(created_at);
    CREATE INDEX IF NOT EXISTS idx_orders_synced ON orders(synced);
    CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
    CREATE INDEX IF NOT EXISTS idx_menu_items_outlet ON menu_items(outlet_id);
  `);

  // Seed default admin if none exists
  const adminExists = db.prepare('SELECT id FROM users WHERE role = ?').get('admin');
  if (!adminExists) {
    const outletId = uuid();
    db.prepare('INSERT INTO outlets (id, name, address) VALUES (?, ?, ?)').run(outletId, '1BHK Kitchen', 'Electronic City, Bangalore');
    const hashedPw = bcrypt.hashSync('admin123', 10);
    db.prepare('INSERT INTO users (id, name, email, password, role, outlet_id) VALUES (?, ?, ?, ?, ?, ?)').run(
      uuid(), 'Admin', 'admin@restaurant.com', hashedPw, 'admin', outletId);
    for (let i = 1; i <= 10; i++) {
      db.prepare('INSERT INTO tables_config (id, outlet_id, table_number, capacity) VALUES (?, ?, ?, ?)').run(
        uuid(), outletId, `T${i}`, i <= 5 ? 4 : 6);
    }
    console.log('Database seeded with default admin');
  }

  return db;
}

module.exports = { getDb, initDb };
