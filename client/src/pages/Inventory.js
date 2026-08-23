import { useState, useEffect } from 'react';
import api from '../utils/api';
import toast from 'react-hot-toast';

const UNITS = ['kg', 'g', 'L', 'ml', 'pcs', 'dozen', 'box', 'packet', 'bottle'];
const CATEGORIES = ['General', 'Vegetables', 'Fruits', 'Dairy', 'Meat', 'Spices', 'Grains', 'Beverages', 'Packaging', 'Cleaning'];

export default function Inventory() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [txnItem, setTxnItem] = useState(null); // item for stock in/out
  const [historyItem, setHistoryItem] = useState(null);
  const [history, setHistory] = useState([]);
  const [filterCat, setFilterCat] = useState('All');
  const [searchQ, setSearchQ] = useState('');

  const [form, setForm] = useState({ name: '', unit: 'kg', current_stock: '', min_stock: '', cost_per_unit: '', category: 'General' });
  const [txnForm, setTxnForm] = useState({ type: 'stock_in', quantity: '', notes: '' });

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/inventory');
      setItems(data);
    } catch (e) {
      toast.error('Failed to load inventory: ' + (e.response?.data?.error || e.message));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const addItem = async () => {
    if (!form.name.trim()) return toast.error('Name required');
    try {
      await api.post('/inventory', form);
      toast.success('Item added');
      setShowAdd(false);
      setForm({ name: '', unit: 'kg', current_stock: '', min_stock: '', cost_per_unit: '', category: 'General' });
      load();
    } catch (e) { toast.error(e.response?.data?.error || 'Failed'); }
  };

  const deleteItem = async (id) => {
    if (!window.confirm('Delete this item and all its transactions?')) return;
    try { await api.delete(`/inventory/${id}`); toast.success('Deleted'); load(); } catch { toast.error('Failed'); }
  };

  const doTransaction = async () => {
    if (!txnForm.quantity || parseFloat(txnForm.quantity) <= 0) return toast.error('Enter valid quantity');
    try {
      await api.post(`/inventory/${txnItem.id}/transaction`, txnForm);
      toast.success(txnForm.type === 'stock_in' ? 'Stock added' : 'Stock removed');
      setTxnItem(null);
      setTxnForm({ type: 'stock_in', quantity: '', notes: '' });
      load();
    } catch (e) { toast.error(e.response?.data?.error || 'Failed'); }
  };

  const openHistory = async (item) => {
    setHistoryItem(item);
    const { data } = await api.get(`/inventory/${item.id}/transactions`);
    setHistory(data);
  };

  const filteredItems = items.filter(i => {
    if (filterCat !== 'All' && i.category !== filterCat) return false;
    if (searchQ && !i.name.toLowerCase().includes(searchQ.toLowerCase())) return false;
    return true;
  });

  const lowStockItems = items.filter(i => i.current_stock <= i.min_stock && i.min_stock > 0);

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, color: '#1a1a2e' }}>Inventory</h2>
          <p style={{ margin: '4px 0 0', color: '#888', fontSize: 13 }}>Track raw materials and stock levels</p>
        </div>
        <button onClick={() => setShowAdd(true)} style={{ padding: '10px 20px', background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 14 }}>
          + Add Item
        </button>
      </div>

      {/* Low Stock Alert */}
      {lowStockItems.length > 0 && (
        <div style={{ background: '#fff3e0', border: '1px solid #ff9800', borderRadius: 10, padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 20 }}>⚠️</span>
          <div>
            <div style={{ fontWeight: 700, color: '#e65100', fontSize: 13 }}>Low Stock Alert</div>
            <div style={{ fontSize: 12, color: '#bf360c' }}>{lowStockItems.map(i => `${i.name} (${i.current_stock} ${i.unit})`).join(' · ')}</div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <input placeholder="Search items..." value={searchQ} onChange={e => setSearchQ(e.target.value)}
          style={{ padding: '8px 12px', border: '1px solid #ddd', borderRadius: 8, fontSize: 13, minWidth: 180 }} />
        {['All', ...CATEGORIES].map(c => (
          <button key={c} onClick={() => setFilterCat(c)} style={{
            padding: '6px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
            background: filterCat === c ? '#1a1a2e' : '#e8e8e8', color: filterCat === c ? '#fff' : '#555'
          }}>{c}</button>
        ))}
      </div>

      {/* Table */}
      {loading ? <div style={{ textAlign: 'center', color: '#aaa', padding: 40 }}>Loading...</div> : (
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e8e8e8', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8f9fa', borderBottom: '2px solid #e8e8e8' }}>
                {['Item Name', 'Category', 'Stock', 'Min Stock', 'Cost/Unit', 'Status', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: '#555', textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredItems.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40, color: '#ccc' }}>No items found. Add your first inventory item.</td></tr>
              )}
              {filteredItems.map(item => {
                const isLow = item.min_stock > 0 && item.current_stock <= item.min_stock;
                const isOut = item.current_stock === 0;
                return (
                  <tr key={item.id} style={{ borderBottom: '1px solid #f0f0f0', background: isOut ? '#fff5f5' : isLow ? '#fffde7' : '#fff' }}>
                    <td style={{ padding: '12px 16px', fontWeight: 600, color: '#1a1a2e', fontSize: 14 }}>{item.name}</td>
                    <td style={{ padding: '12px 16px', fontSize: 12, color: '#888' }}>{item.category}</td>
                    <td style={{ padding: '12px 16px', fontSize: 14, fontWeight: 700, color: isOut ? '#f44336' : isLow ? '#ff9800' : '#4caf50' }}>
                      {item.current_stock} {item.unit}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: '#888' }}>{item.min_stock} {item.unit}</td>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: '#555' }}>₹{item.cost_per_unit}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{
                        padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                        background: isOut ? '#ffebee' : isLow ? '#fff8e1' : '#e8f5e9',
                        color: isOut ? '#c62828' : isLow ? '#e65100' : '#2e7d32'
                      }}>{isOut ? 'OUT' : isLow ? 'LOW' : 'OK'}</span>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => { setTxnItem(item); setTxnForm({ type: 'stock_in', quantity: '', notes: '' }); }}
                          style={{ padding: '5px 10px', background: '#e8f5e9', color: '#2e7d32', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>+ In</button>
                        <button onClick={() => { setTxnItem(item); setTxnForm({ type: 'stock_out', quantity: '', notes: '' }); }}
                          style={{ padding: '5px 10px', background: '#ffebee', color: '#c62828', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>− Out</button>
                        <button onClick={() => openHistory(item)}
                          style={{ padding: '5px 10px', background: '#e3f2fd', color: '#1565c0', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>History</button>
                        <button onClick={() => deleteItem(item.id)}
                          style={{ padding: '5px 10px', background: 'none', color: '#f44', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>✕</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Item Modal */}
      {showAdd && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 28, width: 440, maxWidth: '95vw' }}>
            <h3 style={{ margin: '0 0 20px', color: '#1a1a2e' }}>Add Inventory Item</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <input placeholder="Item name *" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                style={{ padding: '10px 12px', border: '1px solid #ddd', borderRadius: 8, fontSize: 13 }} />
              <div style={{ display: 'flex', gap: 10 }}>
                <select value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}
                  style={{ flex: 1, padding: '10px 12px', border: '1px solid #ddd', borderRadius: 8, fontSize: 13 }}>
                  {UNITS.map(u => <option key={u}>{u}</option>)}
                </select>
                <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                  style={{ flex: 1, padding: '10px 12px', border: '1px solid #ddd', borderRadius: 8, fontSize: 13 }}>
                  {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <input type="number" placeholder="Current stock" value={form.current_stock} onChange={e => setForm(f => ({ ...f, current_stock: e.target.value }))}
                  style={{ flex: 1, padding: '10px 12px', border: '1px solid #ddd', borderRadius: 8, fontSize: 13 }} />
                <input type="number" placeholder="Min stock (alert)" value={form.min_stock} onChange={e => setForm(f => ({ ...f, min_stock: e.target.value }))}
                  style={{ flex: 1, padding: '10px 12px', border: '1px solid #ddd', borderRadius: 8, fontSize: 13 }} />
              </div>
              <input type="number" placeholder="Cost per unit (₹)" value={form.cost_per_unit} onChange={e => setForm(f => ({ ...f, cost_per_unit: e.target.value }))}
                style={{ padding: '10px 12px', border: '1px solid #ddd', borderRadius: 8, fontSize: 13 }} />
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button onClick={addItem} style={{ flex: 1, padding: 12, background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}>Add Item</button>
              <button onClick={() => setShowAdd(false)} style={{ flex: 1, padding: 12, background: '#f0f0f0', color: '#555', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Stock In/Out Modal */}
      {txnItem && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 28, width: 380, maxWidth: '95vw' }}>
            <h3 style={{ margin: '0 0 4px', color: '#1a1a2e' }}>{txnItem.name}</h3>
            <div style={{ color: '#888', fontSize: 13, marginBottom: 20 }}>Current: {txnItem.current_stock} {txnItem.unit}</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              {[['stock_in', '+ Stock In', '#4caf50'], ['stock_out', '− Stock Out', '#f44336']].map(([type, label, color]) => (
                <button key={type} onClick={() => setTxnForm(f => ({ ...f, type }))}
                  style={{ flex: 1, padding: '10px', border: `2px solid ${txnForm.type === type ? color : '#e8e8e8'}`, borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 13, background: txnForm.type === type ? color : '#fff', color: txnForm.type === type ? '#fff' : '#555' }}>
                  {label}
                </button>
              ))}
            </div>
            <input type="number" placeholder={`Quantity (${txnItem.unit})`} value={txnForm.quantity} onChange={e => setTxnForm(f => ({ ...f, quantity: e.target.value }))}
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: 8, fontSize: 14, marginBottom: 10, boxSizing: 'border-box' }} />
            <input placeholder="Notes (optional)" value={txnForm.notes} onChange={e => setTxnForm(f => ({ ...f, notes: e.target.value }))}
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: 8, fontSize: 13, marginBottom: 16, boxSizing: 'border-box' }} />
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={doTransaction} style={{ flex: 1, padding: 12, background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}>Save</button>
              <button onClick={() => setTxnItem(null)} style={{ flex: 1, padding: 12, background: '#f0f0f0', color: '#555', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* History Modal */}
      {historyItem && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 28, width: 500, maxWidth: '95vw', maxHeight: '80vh', overflow: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, color: '#1a1a2e' }}>{historyItem.name} — History</h3>
              <button onClick={() => setHistoryItem(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#888' }}>✕</button>
            </div>
            {history.length === 0 ? <p style={{ color: '#aaa', textAlign: 'center' }}>No transactions yet</p> : history.map(t => (
              <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f0f0f0' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: t.type === 'stock_in' ? '#2e7d32' : '#c62828' }}>
                    {t.type === 'stock_in' ? '↑ Stock In' : '↓ Stock Out'} {t.quantity} {historyItem.unit}
                  </div>
                  {t.notes && <div style={{ fontSize: 11, color: '#888' }}>{t.notes}</div>}
                  <div style={{ fontSize: 11, color: '#aaa' }}>{t.by_name || 'Unknown'} · {new Date(t.created_at).toLocaleString('en-IN')}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
