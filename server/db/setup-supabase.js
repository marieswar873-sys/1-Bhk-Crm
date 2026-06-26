// Run this once to create tables in Supabase
// Usage: node server/db/setup-supabase.js

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://qubzxwtgyysnqvooyjnd.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.argv[2];

if (!SUPABASE_KEY) {
  console.log('Usage: SUPABASE_SERVICE_KEY=xxx node server/db/setup-supabase.js');
  console.log('Or go to Supabase Dashboard → SQL Editor and run the SQL below:');
  console.log('---');
}

const sql = `
-- Settings for the outlet (synced from local CRM)
CREATE TABLE IF NOT EXISTS outlet_settings (
  id TEXT PRIMARY KEY,
  outlet_name TEXT DEFAULT '1BHK Kitchen',
  outlet_address TEXT DEFAULT '',
  outlet_phone TEXT DEFAULT '',
  outlet_gstin TEXT DEFAULT '',
  outlet_fssai TEXT DEFAULT '',
  company_email TEXT DEFAULT '',
  whatsapp_number TEXT DEFAULT '',
  operating_hours TEXT DEFAULT '{}',
  service_areas TEXT DEFAULT '',
  about_text TEXT DEFAULT '',
  social_instagram TEXT DEFAULT '',
  social_facebook TEXT DEFAULT '',
  hero_tagline TEXT DEFAULT '',
  hero_subtitle TEXT DEFAULT '',
  gst_enabled TEXT DEFAULT 'true',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Menu categories
CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0
);

-- Menu items
CREATE TABLE IF NOT EXISTS menu_items (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category_id TEXT REFERENCES categories(id),
  price NUMERIC NOT NULL,
  tax_percent NUMERIC DEFAULT 5,
  is_veg INTEGER DEFAULT 1,
  is_available INTEGER DEFAULT 1,
  packing_charge NUMERIC DEFAULT 10
);

-- Menu variants (sizes)
CREATE TABLE IF NOT EXISTS menu_variants (
  id TEXT PRIMARY KEY,
  menu_item_id TEXT REFERENCES menu_items(id),
  name TEXT NOT NULL,
  price_delta NUMERIC DEFAULT 0
);

-- Orders (synced from local)
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  order_number TEXT,
  order_type TEXT,
  customer_name TEXT,
  customer_phone TEXT,
  status TEXT,
  subtotal NUMERIC DEFAULT 0,
  tax_amount NUMERIC DEFAULT 0,
  packing_charges NUMERIC DEFAULT 0,
  total NUMERIC DEFAULT 0,
  payment_method TEXT,
  payment_status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Order items (synced from local)
CREATE TABLE IF NOT EXISTS order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT REFERENCES orders(id),
  item_name TEXT,
  quantity INTEGER DEFAULT 1,
  unit_price NUMERIC,
  tax_amount NUMERIC,
  total NUMERIC,
  packing_charge NUMERIC DEFAULT 0,
  is_veg INTEGER DEFAULT 1
);

-- Daily summaries (synced from local)
CREATE TABLE IF NOT EXISTS daily_summaries (
  date TEXT PRIMARY KEY,
  total_orders INTEGER DEFAULT 0,
  total_revenue NUMERIC DEFAULT 0,
  total_tax NUMERIC DEFAULT 0,
  dine_in_revenue NUMERIC DEFAULT 0,
  takeaway_revenue NUMERIC DEFAULT 0,
  dine_in_count INTEGER DEFAULT 0,
  takeaway_count INTEGER DEFAULT 0,
  cash_count INTEGER DEFAULT 0,
  cash_amount NUMERIC DEFAULT 0,
  upi_count INTEGER DEFAULT 0,
  upi_amount NUMERIC DEFAULT 0,
  card_count INTEGER DEFAULT 0,
  card_amount NUMERIC DEFAULT 0,
  cancelled_count INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security but allow public read
ALTER TABLE outlet_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_summaries ENABLE ROW LEVEL SECURITY;

-- Public read access for website
CREATE POLICY IF NOT EXISTS "public_read_settings" ON outlet_settings FOR SELECT USING (true);
CREATE POLICY IF NOT EXISTS "public_read_categories" ON categories FOR SELECT USING (true);
CREATE POLICY IF NOT EXISTS "public_read_menu" ON menu_items FOR SELECT USING (true);
CREATE POLICY IF NOT EXISTS "public_read_variants" ON menu_variants FOR SELECT USING (true);
CREATE POLICY IF NOT EXISTS "public_read_orders" ON orders FOR SELECT USING (true);
CREATE POLICY IF NOT EXISTS "public_read_order_items" ON order_items FOR SELECT USING (true);
CREATE POLICY IF NOT EXISTS "public_read_summaries" ON daily_summaries FOR SELECT USING (true);

-- Service role can write (for sync from CRM)
CREATE POLICY IF NOT EXISTS "service_write_settings" ON outlet_settings FOR ALL USING (true);
CREATE POLICY IF NOT EXISTS "service_write_categories" ON categories FOR ALL USING (true);
CREATE POLICY IF NOT EXISTS "service_write_menu" ON menu_items FOR ALL USING (true);
CREATE POLICY IF NOT EXISTS "service_write_variants" ON menu_variants FOR ALL USING (true);
CREATE POLICY IF NOT EXISTS "service_write_orders" ON orders FOR ALL USING (true);
CREATE POLICY IF NOT EXISTS "service_write_order_items" ON order_items FOR ALL USING (true);
CREATE POLICY IF NOT EXISTS "service_write_summaries" ON daily_summaries FOR ALL USING (true);
`;

console.log(sql);
console.log('\n--- Copy the SQL above and paste it in Supabase Dashboard → SQL Editor → Run ---');
