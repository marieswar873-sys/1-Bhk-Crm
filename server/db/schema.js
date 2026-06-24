const dns = require('dns');
const { resolve4 } = require('dns/promises');
dns.setDefaultResultOrder('ipv4first');

const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const { v4: uuid } = require('uuid');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error('DATABASE_URL not set!'); process.exit(1); }

let pool;

async function createPool() {
  // Resolve hostname to IPv4 to avoid IPv6 issues on Render
  try {
    const url = new URL(DATABASE_URL);
    const ips = await resolve4(url.hostname);
    if (ips.length > 0) {
      url.hostname = ips[0];
      console.log(`[DB] Resolved ${new URL(DATABASE_URL).hostname} → ${ips[0]}`);
      pool = new Pool({
        connectionString: url.toString(),
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 15000,
        idleTimeoutMillis: 30000,
        max: 5,
      });
      return;
    }
  } catch (e) {
    console.log('[DB] IPv4 resolve failed, using original URL:', e.message);
  }
  pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
    idleTimeoutMillis: 30000,
    max: 5,
  });
}

// Override Node's DNS lookup to force IPv4
const net = require('net');
const origConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function(options, ...args) {
  if (typeof options === 'object' && options.host && !net.isIP(options.host)) {
    options.family = 4;
  }
  return origConnect.call(this, options, ...args);
};

function getDb() {
  return pool;
}

async function initDb() {
  await createPool();
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS outlets (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        address TEXT,
        phone TEXT,
        gstin TEXT,
        fssai_no TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('admin','manager','staff')),
        outlet_id TEXT REFERENCES outlets(id),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        outlet_id TEXT NOT NULL REFERENCES outlets(id),
        sort_order INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS menu_items (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        category_id TEXT NOT NULL REFERENCES categories(id),
        outlet_id TEXT NOT NULL REFERENCES outlets(id),
        price NUMERIC NOT NULL,
        tax_percent NUMERIC DEFAULT 5.0,
        hsn_code TEXT DEFAULT '996331',
        is_veg INTEGER DEFAULT 1,
        is_available INTEGER DEFAULT 1,
        packing_charge NUMERIC DEFAULT 10,
        platform_zomato INTEGER DEFAULT 1,
        platform_swiggy INTEGER DEFAULT 1,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS menu_variants (
        id TEXT PRIMARY KEY,
        menu_item_id TEXT NOT NULL REFERENCES menu_items(id),
        name TEXT NOT NULL,
        price_delta NUMERIC DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS tables_config (
        id TEXT PRIMARY KEY,
        outlet_id TEXT NOT NULL REFERENCES outlets(id),
        table_number TEXT NOT NULL,
        capacity INTEGER DEFAULT 4,
        status TEXT DEFAULT 'available' CHECK(status IN ('available','occupied','reserved')),
        created_at TIMESTAMPTZ DEFAULT NOW()
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
        subtotal NUMERIC DEFAULT 0,
        tax_amount NUMERIC DEFAULT 0,
        discount_amount NUMERIC DEFAULT 0,
        packing_charges NUMERIC DEFAULT 0,
        total NUMERIC DEFAULT 0,
        payment_method TEXT CHECK(payment_method IN ('cash','upi','card','split','platform')),
        payment_status TEXT DEFAULT 'pending' CHECK(payment_status IN ('pending','paid','refunded')),
        platform_order_id TEXT,
        platform_commission NUMERIC DEFAULT 0,
        bill_printed INTEGER DEFAULT 0,
        discount_type TEXT,
        notes TEXT,
        created_by TEXT REFERENCES users(id),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        completed_at TIMESTAMPTZ
      );

      CREATE TABLE IF NOT EXISTS kot_tokens (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL REFERENCES orders(id),
        token_number INTEGER NOT NULL,
        status TEXT DEFAULT 'pending' CHECK(status IN ('pending','preparing','ready','served')),
        printed_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS order_items (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL REFERENCES orders(id),
        menu_item_id TEXT NOT NULL REFERENCES menu_items(id),
        variant_id TEXT REFERENCES menu_variants(id),
        kot_id TEXT REFERENCES kot_tokens(id),
        quantity INTEGER NOT NULL DEFAULT 1,
        unit_price NUMERIC NOT NULL,
        tax_percent NUMERIC NOT NULL,
        tax_amount NUMERIC NOT NULL,
        total NUMERIC NOT NULL,
        packing_charge NUMERIC DEFAULT 0,
        kot_printed INTEGER DEFAULT 0,
        notes TEXT
      );

      CREATE TABLE IF NOT EXISTS payments (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL REFERENCES orders(id),
        method TEXT NOT NULL CHECK(method IN ('cash','upi','card')),
        amount NUMERIC NOT NULL,
        reference_no TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS csv_imports (
        id TEXT PRIMARY KEY,
        platform TEXT NOT NULL CHECK(platform IN ('zomato','swiggy')),
        filename TEXT NOT NULL,
        records_imported INTEGER DEFAULT 0,
        imported_by TEXT REFERENCES users(id),
        imported_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS settings (
        id TEXT PRIMARY KEY,
        outlet_id TEXT NOT NULL REFERENCES outlets(id),
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        UNIQUE(outlet_id, key)
      );
    `);

    // Create indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_orders_outlet ON orders(outlet_id);
      CREATE INDEX IF NOT EXISTS idx_orders_date ON orders(created_at);
      CREATE INDEX IF NOT EXISTS idx_orders_type ON orders(order_type);
      CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
      CREATE INDEX IF NOT EXISTS idx_menu_items_outlet ON menu_items(outlet_id);
    `);

    // Seed default admin if none exists
    const { rows } = await client.query("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
    if (rows.length === 0) {
      const outletId = uuid();
      await client.query('INSERT INTO outlets (id, name, address, gstin) VALUES ($1, $2, $3, $4)',
        [outletId, '1BHK Kitchen', 'Electronic City, Bangalore', '']);

      const hashedPw = bcrypt.hashSync('admin123', 10);
      await client.query('INSERT INTO users (id, name, email, password, role, outlet_id) VALUES ($1, $2, $3, $4, $5, $6)',
        [uuid(), 'Admin', 'admin@restaurant.com', hashedPw, 'admin', outletId]);

      // Seed tables
      for (let i = 1; i <= 10; i++) {
        await client.query('INSERT INTO tables_config (id, outlet_id, table_number, capacity) VALUES ($1, $2, $3, $4)',
          [uuid(), outletId, `T${i}`, i <= 5 ? 4 : 6]);
      }

      console.log('Database seeded with default admin');
    }

    console.log('Database initialized (PostgreSQL/Supabase)');
  } finally {
    client.release();
  }
}

module.exports = { getDb, initDb };
