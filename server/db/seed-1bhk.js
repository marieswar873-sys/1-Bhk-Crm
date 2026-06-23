const { initDb, getDb } = require('./schema');
const { v4: uuid } = require('uuid');

initDb();
const db = getDb();

// Get outlet
const outlet = db.prepare('SELECT id FROM outlets LIMIT 1').get();
const outletId = outlet.id;

// Update outlet info
db.prepare('UPDATE outlets SET name = ?, address = ? WHERE id = ?').run(
  '1BHK Kitchen', 'Takeaway & Delivery Only', outletId
);

// Clear existing menu
db.prepare('DELETE FROM order_items').run();
db.prepare('DELETE FROM menu_variants').run();
db.prepare('DELETE FROM menu_items').run();
db.prepare('DELETE FROM categories').run();

// Create categories
const cats = {};
for (const name of ['Veg Biryani', 'Non-Veg Biryani', 'Veg Curries', 'Non-Veg Curries (Egg & Chicken)', 'Non-Veg Curries (Boneless & Specials)']) {
  const id = uuid();
  cats[name] = id;
  db.prepare('INSERT INTO categories (id, name, outlet_id, sort_order) VALUES (?, ?, ?, ?)').run(
    id, name, outletId, Object.keys(cats).length
  );
}

const insertItem = db.prepare('INSERT INTO menu_items (id, name, category_id, outlet_id, price, tax_percent, is_veg) VALUES (?, ?, ?, ?, ?, ?, ?)');
const insertVariant = db.prepare('INSERT INTO menu_variants (id, menu_item_id, name, price_delta) VALUES (?, ?, ?, ?)');

function addItem(name, catKey, basePrice, isVeg, variants) {
  const itemId = uuid();
  insertItem.run(itemId, name, cats[catKey], outletId, basePrice, 5.0, isVeg ? 1 : 0);
  if (variants) {
    for (const [vName, price] of Object.entries(variants)) {
      insertVariant.run(uuid(), itemId, vName, price - basePrice);
    }
  }
  return itemId;
}

const seed = db.transaction(() => {
  // === VEG BIRYANI (base = 650ml price) ===
  addItem('Veg Dum Biryani', 'Veg Biryani', 99, true, { '650 ml': 99, '750 ml': 149, '1000 ml': 199 });
  addItem('Paneer Biryani', 'Veg Biryani', 129, true, { '650 ml': 129, '750 ml': 179, '1000 ml': 229 });
  addItem('Mushroom Biryani', 'Veg Biryani', 129, true, { '650 ml': 129, '750 ml': 179, '1000 ml': 229 });
  addItem('Kaju Paneer Biryani', 'Veg Biryani', 169, true, { '650 ml': 169, '750 ml': 219, '1000 ml': 269 });
  addItem('Gutti Vankaya Biryani', 'Veg Biryani', 149, true, { '650 ml': 149, '750 ml': 199, '1000 ml': 249 });
  addItem('Paneer Tikka Biryani', 'Veg Biryani', 179, true, { '650 ml': 179, '750 ml': 229, '1000 ml': 279 });
  addItem('Kaju Biryani', 'Veg Biryani', 149, true, { '650 ml': 149, '750 ml': 199, '1000 ml': 249 });
  addItem('Veg Pulao Biryani', 'Veg Biryani', 129, true, { '650 ml': 129, '750 ml': 179, '1000 ml': 229 });
  addItem('Veg Hyderabadi Biryani', 'Veg Biryani', 149, true, { '650 ml': 149, '750 ml': 199, '1000 ml': 249 });

  // === NON-VEG BIRYANI (base = 650ml price) ===
  addItem('Chicken Dum Biryani', 'Non-Veg Biryani', 99, false, { '650 ml': 99, '750 ml': 149, '1000 ml': 199 });
  addItem('Chicken Fry Biryani', 'Non-Veg Biryani', 99, false, { '650 ml': 99, '750 ml': 149, '1000 ml': 199 });
  addItem('Chicken Ghee Roast Biryani', 'Non-Veg Biryani', 199, false, { '650 ml': 199, '750 ml': 249, '1000 ml': 299 });
  addItem('Chicken 65 Biryani', 'Non-Veg Biryani', 199, false, { '650 ml': 199, '750 ml': 249, '1000 ml': 299 });
  addItem('Chicken Tikka Biryani', 'Non-Veg Biryani', 199, false, { '650 ml': 199, '750 ml': 249, '1000 ml': 299 });
  addItem('Chicken Keema Biryani', 'Non-Veg Biryani', 189, false, { '650 ml': 189, '750 ml': 249, '1000 ml': 299 });
  addItem('Gongura Chicken Biryani', 'Non-Veg Biryani', 189, false, { '650 ml': 189, '750 ml': 239, '1000 ml': 299 });
  addItem('Boneless Gongura Chicken Biryani', 'Non-Veg Biryani', 189, false, { '650 ml': 189, '750 ml': 239, '1000 ml': 299 });
  addItem('Rambo Chicken Biryani', 'Non-Veg Biryani', 159, false, { '650 ml': 159, '750 ml': 209, '1000 ml': 279 });
  addItem('Special Chicken Biryani', 'Non-Veg Biryani', 199, false, { '650 ml': 199, '750 ml': 249, '1000 ml': 299 });

  // === VEG CURRIES ===
  addItem('Dal Tadka', 'Veg Curries', 130, true);
  addItem('Tomato Curry', 'Veg Curries', 140, true);
  addItem('Palak Paneer', 'Veg Curries', 130, true);
  addItem('Vegetable Curry', 'Veg Curries', 160, true);
  addItem('Mushroom Curry', 'Veg Curries', 130, true);
  addItem('Kaju Curry', 'Veg Curries', 150, true);
  addItem('Veg Kolhapuri', 'Veg Curries', 150, true);
  addItem('Veg Jaipuri', 'Veg Curries', 140, true);
  addItem('Kadai Veg', 'Veg Curries', 140, true);
  addItem('Paneer Butter Masala', 'Veg Curries', 160, true);
  addItem('Kaju Mushroom', 'Veg Curries', 199, true);
  addItem('Kaju Paneer', 'Veg Curries', 160, true);
  addItem('Kadai Paneer', 'Veg Curries', 180, true);
  addItem('Methi Chaman', 'Veg Curries', 140, true);
  addItem('Shahi Paneer', 'Veg Curries', 200, true);

  // === NON-VEG CURRIES (Egg & Chicken) ===
  addItem('Egg Curry', 'Non-Veg Curries (Egg & Chicken)', 99, false);
  addItem('Egg Mahi Masala', 'Non-Veg Curries (Egg & Chicken)', 119, false);
  addItem('Egg Palak', 'Non-Veg Curries (Egg & Chicken)', 119, false);
  addItem('Egg Kaju', 'Non-Veg Curries (Egg & Chicken)', 149, false);
  addItem('Egg Mushroom', 'Non-Veg Curries (Egg & Chicken)', 199, false);
  addItem('Andhra Kodi Kura', 'Non-Veg Curries (Egg & Chicken)', 199, false);
  addItem('Boneless Andhra Kodi Kura', 'Non-Veg Curries (Egg & Chicken)', 249, false);
  addItem('Kadai Chicken', 'Non-Veg Curries (Egg & Chicken)', 249, false);
  addItem('Boneless Kadai Chicken', 'Non-Veg Curries (Egg & Chicken)', 249, false);
  addItem('Chicken Mughlai', 'Non-Veg Curries (Egg & Chicken)', 199, false);
  addItem('Chicken Maharaja', 'Non-Veg Curries (Egg & Chicken)', 249, false);

  // === NON-VEG CURRIES (Boneless & Specials) ===
  addItem('Boneless Chicken Mughlai', 'Non-Veg Curries (Boneless & Specials)', 249, false);
  addItem('Chicken Tikka Masala', 'Non-Veg Curries (Boneless & Specials)', 199, false);
  addItem('Kaju Chicken', 'Non-Veg Curries (Boneless & Specials)', 249, false);
  addItem('Chicken Butter Masala', 'Non-Veg Curries (Boneless & Specials)', 249, false);
  addItem('Boneless Ghee Chicken', 'Non-Veg Curries (Boneless & Specials)', 269, false);
  addItem('Methi Chicken', 'Non-Veg Curries (Boneless & Specials)', 249, false);
  addItem('Malai Chicken', 'Non-Veg Curries (Boneless & Specials)', 249, false);
  addItem('Dhaba Style Kashmiri Chicken', 'Non-Veg Curries (Boneless & Specials)', 199, false);
  addItem('Lemon Coriander Chicken', 'Non-Veg Curries (Boneless & Specials)', 249, false);
  addItem('Dhaba Style Punjabi Chicken', 'Non-Veg Curries (Boneless & Specials)', 249, false);
});

seed();

const itemCount = db.prepare('SELECT COUNT(*) as c FROM menu_items').get().c;
const varCount = db.prepare('SELECT COUNT(*) as c FROM menu_variants').get().c;
console.log(`Seeded ${itemCount} menu items with ${varCount} variants for 1BHK Kitchen`);
