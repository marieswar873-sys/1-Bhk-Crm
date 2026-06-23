import { useState, useEffect } from 'react';
import api from '../utils/api';
import toast from 'react-hot-toast';

function parseCSV(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim());
  return lines.slice(1).map(line => {
    const vals = line.split(',').map(v => v.trim());
    const obj = {};
    headers.forEach((h, i) => obj[h] = vals[i] || '');
    return obj;
  });
}

function csvToItems(rows) {
  return rows.map(r => {
    const item = {
      name: r.name, category: r.category, price: parseFloat(r.price) || 0,
      is_veg: (r.is_veg || '').toLowerCase() === 'yes' || r.is_veg === '1' || r.is_veg === 'true',
      tax_percent: parseFloat(r.tax_percent) || 5,
      variants: [],
    };
    for (let i = 1; i <= 3; i++) {
      const vName = r[`variant${i}_name`];
      const vPrice = parseFloat(r[`variant${i}_price`]);
      if (vName && !isNaN(vPrice)) {
        item.variants.push({ name: vName, price_delta: vPrice - item.price });
      }
    }
    return item;
  }).filter(i => i.name && i.category);
}

export default function MenuManagement() {
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [form, setForm] = useState({ name: '', category_id: '', price: '', tax_percent: '5', is_veg: 1, packing_charge: '10' });
  const [editingItem, setEditingItem] = useState(null);
  const [newCat, setNewCat] = useState('');
  const [bulkPreview, setBulkPreview] = useState([]);
  const [bulkResult, setBulkResult] = useState(null);
  const [filter, setFilter] = useState('all');

  const load = () => {
    api.get('/menu/items').then(r => setItems(r.data));
    api.get('/menu/categories').then(r => setCategories(r.data));
  };
  useEffect(load, []);

  const startEdit = (item) => {
    setEditingItem(item);
    setForm({ name: item.name, category_id: item.category_id, price: String(item.price), tax_percent: String(item.tax_percent), is_veg: item.is_veg, packing_charge: String(item.packing_charge ?? 10) });
    setShowForm(true);
  };

  const saveItem = async (e) => {
    e.preventDefault();
    try {
      const payload = { ...form, price: parseFloat(form.price), tax_percent: parseFloat(form.tax_percent), is_veg: parseInt(form.is_veg), packing_charge: parseFloat(form.packing_charge) || 0 };
      if (editingItem) {
        await api.put(`/menu/items/${editingItem.id}`, payload);
        toast.success('Item updated');
      } else {
        await api.post('/menu/items', payload);
        toast.success('Item added');
      }
      setShowForm(false);
      setEditingItem(null);
      setForm({ name: '', category_id: '', price: '', tax_percent: '5', is_veg: 1, packing_charge: '10' });
      load();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed'); }
  };

  const addCategory = async () => {
    if (!newCat.trim()) return toast.error('Enter category name');
    try {
      await api.post('/menu/categories', { name: newCat.trim() });
      toast.success('Category added');
      setNewCat('');
      load();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed'); }
  };

  const toggleAvail = async (item) => {
    await api.put(`/menu/items/${item.id}`, { is_available: item.is_available ? 0 : 1 });
    load();
  };

  const deleteItem = async (id) => {
    if (!window.confirm('Delete this item?')) return;
    await api.delete(`/menu/items/${id}`);
    toast.success('Deleted');
    load();
  };

  const handleBulkFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const rows = parseCSV(ev.target.result);
      const parsed = csvToItems(rows);
      setBulkPreview(parsed);
      setBulkResult(null);
    };
    reader.readAsText(file);
  };

  const doBulkUpload = async () => {
    if (!bulkPreview.length) return;
    try {
      const { data } = await api.post('/menu/bulk-upload', { items: bulkPreview });
      setBulkResult(data);
      toast.success(`Added/Updated ${data.added} items`);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Upload failed');
    }
  };

  const downloadTemplate = () => {
    const csv = `name,category,price,is_veg,tax_percent,variant1_name,variant1_price,variant2_name,variant2_price,variant3_name,variant3_price
Veg Dum Biryani,Veg Biryani,99,yes,5,650 ml,99,750 ml,149,1000 ml,199
Chicken Dum Biryani,Non-Veg Biryani,99,no,5,650 ml,99,750 ml,149,1000 ml,199
Dal Tadka,Veg Curries,130,yes,5,,,,,,
Butter Chicken,Non-Veg Curries,320,no,5,,,,,,`;
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'menu_upload_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredItems = filter === 'all' ? items : items.filter(i => i.category_id === filter);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, color: '#1a1a2e', flex: 1 }}>Menu Management</h2>
        <span style={{ fontSize: 13, color: '#888' }}>{items.length} items</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <input value={newCat} onChange={e => setNewCat(e.target.value)} placeholder="New category..."
            onKeyDown={e => e.key === 'Enter' && addCategory()}
            style={{ padding: '7px 12px', border: '1px solid #ddd', borderRadius: 6, fontSize: 13, width: 140 }} />
          <button onClick={addCategory} style={{ padding: '7px 14px', background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
            + Category
          </button>
        </div>
        <button onClick={() => setShowBulk(!showBulk)} style={{ padding: '7px 14px', background: '#ff9800', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
          Bulk Upload
        </button>
        <button onClick={() => { setShowForm(!showForm); setEditingItem(null); setForm({ name: '', category_id: '', price: '', tax_percent: '5', is_veg: 1, packing_charge: '10' }); }} style={{ padding: '7px 14px', background: '#4caf50', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
          + Add Item
        </button>
      </div>

      {/* Bulk Upload Panel */}
      {showBulk && (
        <div style={{ background: '#fff', borderRadius: 10, padding: 20, marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontSize: 15 }}>Bulk Upload Menu Items</h3>
            <button onClick={downloadTemplate} style={{
              padding: '6px 12px', background: '#e3f2fd', color: '#1976d2', border: '1px solid #90caf9',
              borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600
            }}>Download Sample CSV</button>
          </div>
          <p style={{ fontSize: 12, color: '#888', margin: '0 0 12px' }}>
            Upload a CSV with columns: name, category, price, is_veg, tax_percent, variant1_name, variant1_price, variant2_name, variant2_price, variant3_name, variant3_price
          </p>
          <input type="file" accept=".csv" onChange={handleBulkFile} style={{ fontSize: 13, marginBottom: 12 }} />

          {bulkPreview.length > 0 && (
            <>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Preview: {bulkPreview.length} items</div>
              <div style={{ maxHeight: 200, overflow: 'auto', marginBottom: 12 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead><tr style={{ background: '#f8f9fa' }}>
                    {['Name', 'Category', 'Price', 'Veg', 'Variants'].map(h => <th key={h} style={{ padding: '6px 10px', textAlign: 'left' }}>{h}</th>)}
                  </tr></thead>
                  <tbody>{bulkPreview.slice(0, 15).map((item, i) => (
                    <tr key={i} style={{ borderTop: '1px solid #f0f0f0' }}>
                      <td style={{ padding: '4px 10px' }}>{item.name}</td>
                      <td style={{ padding: '4px 10px' }}>{item.category}</td>
                      <td style={{ padding: '4px 10px' }}>₹{item.price}</td>
                      <td style={{ padding: '4px 10px' }}>{item.is_veg ? '🟢' : '🔴'}</td>
                      <td style={{ padding: '4px 10px' }}>{item.variants.length > 0 ? item.variants.map(v => v.name).join(', ') : '-'}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
              <button onClick={doBulkUpload} style={{
                padding: '10px 24px', background: '#4caf50', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600
              }}>Upload {bulkPreview.length} Items</button>
            </>
          )}

          {bulkResult && (
            <div style={{ marginTop: 12, padding: 12, background: '#e8f5e9', borderRadius: 6, fontSize: 13, color: '#2e7d32' }}>
              Added/Updated: {bulkResult.added} | Skipped: {bulkResult.skipped}
              {bulkResult.errors?.length > 0 && <div style={{ color: '#f44', marginTop: 4 }}>{bulkResult.errors.join(', ')}</div>}
            </div>
          )}
        </div>
      )}

      {/* Add Item Form */}
      {showForm && (
        <form onSubmit={saveItem} style={{ background: '#fff', borderRadius: 10, padding: 20, marginBottom: 16, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'end' }}>
          <div>
            <label style={{ fontSize: 12, color: '#666', display: 'block' }}>Name</label>
            <input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              style={{ padding: '8px 12px', border: '1px solid #ddd', borderRadius: 6, fontSize: 13 }} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: '#666', display: 'block' }}>Category</label>
            <select required value={form.category_id} onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))}
              style={{ padding: '8px 12px', border: '1px solid #ddd', borderRadius: 6, fontSize: 13 }}>
              <option value="">Select</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, color: '#666', display: 'block' }}>Price (₹)</label>
            <input required type="number" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
              style={{ padding: '8px 12px', border: '1px solid #ddd', borderRadius: 6, fontSize: 13, width: 80 }} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: '#666', display: 'block' }}>GST %</label>
            <input type="number" value={form.tax_percent} onChange={e => setForm(f => ({ ...f, tax_percent: e.target.value }))}
              style={{ padding: '8px 12px', border: '1px solid #ddd', borderRadius: 6, fontSize: 13, width: 60 }} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: '#666', display: 'block' }}>Pack ₹</label>
            <input type="number" value={form.packing_charge} onChange={e => setForm(f => ({ ...f, packing_charge: e.target.value }))}
              style={{ padding: '8px 12px', border: '1px solid #ddd', borderRadius: 6, fontSize: 13, width: 60 }} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: '#666', display: 'block' }}>Type</label>
            <select value={form.is_veg} onChange={e => setForm(f => ({ ...f, is_veg: parseInt(e.target.value) }))}
              style={{ padding: '8px 12px', border: '1px solid #ddd', borderRadius: 6, fontSize: 13 }}>
              <option value={1}>Veg</option>
              <option value={0}>Non-Veg</option>
            </select>
          </div>
          <button type="submit" style={{ padding: '8px 20px', background: '#4caf50', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
            {editingItem ? 'Update Item' : 'Add Item'}
          </button>
          {editingItem && <button type="button" onClick={() => { setShowForm(false); setEditingItem(null); }} style={{ padding: '8px 16px', background: '#e8e8e8', color: '#555', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>Cancel</button>}
        </form>
      )}

      {/* Category filter */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        <button onClick={() => setFilter('all')} style={{
          padding: '6px 14px', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600,
          background: filter === 'all' ? '#1a1a2e' : '#e8e8e8', color: filter === 'all' ? '#fff' : '#555'
        }}>All ({items.length})</button>
        {categories.map(c => {
          const count = items.filter(i => i.category_id === c.id).length;
          return (
            <button key={c.id} onClick={() => setFilter(c.id)} style={{
              padding: '6px 14px', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600,
              background: filter === c.id ? '#1a1a2e' : '#e8e8e8', color: filter === c.id ? '#fff' : '#555'
            }}>{c.name} ({count})</button>
          );
        })}
      </div>

      {/* Items Table */}
      <div style={{ background: '#fff', borderRadius: 10, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f8f9fa' }}>
              {['', 'Name', 'Category', 'Price', 'GST', 'Variants', 'Available', 'Actions'].map(h => (
                <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 12, color: '#888', fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredItems.map(item => (
              <tr key={item.id} style={{ borderTop: '1px solid #f0f0f0' }}>
                <td style={{ padding: '8px 14px' }}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, display: 'inline-block', background: item.is_veg ? '#4caf50' : '#f44336' }} />
                </td>
                <td style={{ padding: '8px 14px', fontSize: 13, fontWeight: 600 }}>{item.name}</td>
                <td style={{ padding: '8px 14px', fontSize: 12, color: '#666' }}>{item.category_name}</td>
                <td style={{ padding: '8px 14px', fontSize: 13, fontWeight: 600 }}>₹{item.price}</td>
                <td style={{ padding: '8px 14px', fontSize: 12, color: '#666' }}>{item.tax_percent}%</td>
                <td style={{ padding: '8px 14px', fontSize: 12, color: '#888' }}>
                  {item.variants?.length > 0 ? item.variants.map(v => `${v.name}`).join(', ') : '-'}
                </td>
                <td style={{ padding: '8px 14px' }}>
                  <button onClick={() => toggleAvail(item)} style={{
                    padding: '3px 10px', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600,
                    background: item.is_available ? '#e8f5e9' : '#ffebee', color: item.is_available ? '#4caf50' : '#f44336'
                  }}>{item.is_available ? 'Yes' : 'No'}</button>
                </td>
                <td style={{ padding: '8px 14px', display: 'flex', gap: 8 }}>
                  <button onClick={() => startEdit(item)} style={{
                    background: 'none', border: 'none', color: '#1976d2', cursor: 'pointer', fontSize: 12, fontWeight: 600
                  }}>Edit</button>
                  <button onClick={() => deleteItem(item.id)} style={{
                    background: 'none', border: 'none', color: '#f44', cursor: 'pointer', fontSize: 12
                  }}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
