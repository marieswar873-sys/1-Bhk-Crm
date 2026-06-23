const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, '..', '..', 'data', 'restaurant.db');

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
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin','manager','staff')),
      outlet_id TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS outlets (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      address TEXT,
      phone TEXT,
      gstin TEXT,
      fssai_no TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      outlet_id TEXT NOT NULL REFERENCES outlets(id),
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS menu_items (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category_id TEXT NOT NULL REFERENCES categories(id),
      outlet_id TEXT NOT NULL REFERENCES outlets(id),
      price REAL NOT NULL,
      tax_percent REAL DEFAULT 5.0,
      hsn_code TEXT DEFAULT '996331',
      is_veg INTEGER DEFAULT 1,
      is_available INTEGER DEFAULT 1,
      platform_zomato INTEGER DEFAULT 1,
      platform_swiggy INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS menu_variants (
      id TEXT PRIMARY KEY,
      menu_item_id TEXT NOT NULL REFERENCES menu_items(id),
      name TEXT NOT NULL,
      price_delta REAL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tables_config (
      id TEXT PRIMARY KEY,
      outlet_id TEXT NOT NULL REFERENCES outlets(id),
      table_number TEXT NOT NULL,
      capacity INTEGER DEFAULT 4,
      status TEXT DEFAULT 'available' CHECK(status IN ('available','occupied','reserved')),
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      outlet_id TEXT NOT NULL REFERENCES outlets(id),
      order_number TEXT NOT NULL,
      order_type TEXT NOT NULL CHECK(order_type IN ('dine_in','takeaway','zomato','swiggy')),
      table_id TEXT REFERENCES tables_config(id),
      customer_name TEXT,
      customer_phone TEXT,
      status TEXT DEFAULT 'active' CHECK(status IN ('active','preparing','ready','served','completed','cancelled')),
      subtotal REAL DEFAULT 0,
      tax_amount REAL DEFAULT 0,
      discount_amount REAL DEFAULT 0,
      total REAL DEFAULT 0,
      payment_method TEXT CHECK(payment_method IN ('cash','upi','card','split','platform')),
      payment_status TEXT DEFAULT 'pending' CHECK(payment_status IN ('pending','paid','refunded')),
      platform_order_id TEXT,
      platform_commission REAL DEFAULT 0,
      notes TEXT,
      created_by TEXT REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now')),
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES orders(id),
      menu_item_id TEXT NOT NULL REFERENCES menu_items(id),
      variant_id TEXT REFERENCES menu_variants(id),
      quantity INTEGER NOT NULL DEFAULT 1,
      unit_price REAL NOT NULL,
      tax_percent REAL NOT NULL,
      tax_amount REAL NOT NULL,
      total REAL NOT NULL,
      kot_printed INTEGER DEFAULT 0,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS kot_tokens (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES orders(id),
      token_number INTEGER NOT NULL,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending','preparing','ready','served')),
      printed_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES orders(id),
      method TEXT NOT NULL CHECK(method IN ('cash','upi','card')),
      amount REAL NOT NULL,
      reference_no TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS csv_imports (
      id TEXT PRIMARY KEY,
      platform TEXT NOT NULL CHECK(platform IN ('zomato','swiggy')),
      filename TEXT NOT NULL,
      records_imported INTEGER DEFAULT 0,
      imported_by TEXT REFERENCES users(id),
      imported_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      id TEXT PRIMARY KEY,
      outlet_id TEXT NOT NULL REFERENCES outlets(id),
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      UNIQUE(outlet_id, key)
    );

    CREATE INDEX IF NOT EXISTS idx_orders_outlet ON orders(outlet_id);
    CREATE INDEX IF NOT EXISTS idx_orders_date ON orders(created_at);
    CREATE INDEX IF NOT EXISTS idx_orders_type ON orders(order_type);
    CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
    CREATE INDEX IF NOT EXISTS idx_menu_items_outlet ON menu_items(outlet_id);
  `);

  // Migrations
  try { db.exec('ALTER TABLE orders ADD COLUMN packing_charges REAL DEFAULT 0'); } catch {}
  try { db.exec('ALTER TABLE orders ADD COLUMN discount_type TEXT DEFAULT NULL'); } catch {}
  try { db.exec('ALTER TABLE order_items ADD COLUMN kot_id TEXT REFERENCES kot_tokens(id)'); } catch {}
  try { db.exec('ALTER TABLE orders ADD COLUMN bill_printed INTEGER DEFAULT 0'); } catch {}
  try { db.exec('ALTER TABLE menu_items ADD COLUMN packing_charge REAL DEFAULT 10'); } catch {}
  try { db.exec('ALTER TABLE order_items ADD COLUMN packing_charge REAL DEFAULT 0'); } catch {}

  // Seed default admin if none exists
  const adminExists = db.prepare('SELECT id FROM users WHERE role = ?').get('admin');
  if (!adminExists) {
    const { v4: uuid } = require('uuid');
    const outletId = uuid();
    db.prepare(`INSERT INTO outlets (id, name, address, gstin) VALUES (?, ?, ?, ?)`).run(
      outletId, 'Main Outlet', '123 Main Street', '29AABCU9603R1ZM'
    );
    const hashedPw = bcrypt.hashSync('admin123', 10);
    db.prepare(`INSERT INTO users (id, name, email, password, role, outlet_id) VALUES (?, ?, ?, ?, ?, ?)`).run(
      uuid(), 'Admin', 'admin@restaurant.com', hashedPw, 'admin', outletId
    );

    // Seed some tables
    for (let i = 1; i <= 10; i++) {
      db.prepare(`INSERT INTO tables_config (id, outlet_id, table_number, capacity) VALUES (?, ?, ?, ?)`).run(
        uuid(), outletId, `T${i}`, i <= 5 ? 4 : 6
      );
    }

    // Seed categories and menu items
    const catIds = {};
    for (const cat of ['Starters', 'Main Course', 'Biryani', 'Breads', 'Beverages', 'Desserts']) {
      const catId = uuid();
      catIds[cat] = catId;
      db.prepare(`INSERT INTO categories (id, name, outlet_id) VALUES (?, ?, ?)`).run(catId, cat, outletId);
    }

    const items = [
      { name: 'Paneer Tikka', cat: 'Starters', price: 220, veg: 1 },
      { name: 'Chicken 65', cat: 'Starters', price: 260, veg: 0 },
      { name: 'Gobi Manchurian', cat: 'Starters', price: 180, veg: 1 },
      { name: 'Butter Chicken', cat: 'Main Course', price: 320, veg: 0 },
      { name: 'Paneer Butter Masala', cat: 'Main Course', price: 280, veg: 1 },
      { name: 'Dal Makhani', cat: 'Main Course', price: 220, veg: 1 },
      { name: 'Chicken Biryani', cat: 'Biryani', price: 300, veg: 0 },
      { name: 'Veg Biryani', cat: 'Biryani', price: 240, veg: 1 },
      { name: 'Mutton Biryani', cat: 'Biryani', price: 380, veg: 0 },
      { name: 'Butter Naan', cat: 'Breads', price: 60, veg: 1 },
      { name: 'Garlic Naan', cat: 'Breads', price: 70, veg: 1 },
      { name: 'Tandoori Roti', cat: 'Breads', price: 40, veg: 1 },
      { name: 'Masala Chai', cat: 'Beverages', price: 40, veg: 1 },
      { name: 'Cold Coffee', cat: 'Beverages', price: 120, veg: 1 },
      { name: 'Lassi', cat: 'Beverages', price: 80, veg: 1 },
      { name: 'Gulab Jamun', cat: 'Desserts', price: 100, veg: 1 },
      { name: 'Rasmalai', cat: 'Desserts', price: 120, veg: 1 },
    ];

    const insertItem = db.prepare(`INSERT INTO menu_items (id, name, category_id, outlet_id, price, is_veg) VALUES (?, ?, ?, ?, ?, ?)`);
    for (const item of items) {
      insertItem.run(uuid(), item.name, catIds[item.cat], outletId, item.price, item.veg);
    }

    console.log('Database seeded with default data');
  }

  return db;
}

module.exports = { getDb, initDb };
