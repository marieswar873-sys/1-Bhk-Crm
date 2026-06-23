import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import toast from 'react-hot-toast';

const statusColors = { available: '#4caf50', occupied: '#ff9800', reserved: '#2196f3' };

export default function Tables() {
  const [tables, setTables] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingTable, setEditingTable] = useState(null);
  const [form, setForm] = useState({ table_number: '', capacity: '4' });
  const navigate = useNavigate();

  const load = () => api.get('/tables').then(r => setTables(r.data));
  useEffect(() => { load(); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingTable) {
        await api.put(`/tables/${editingTable.id}`, { table_number: form.table_number, capacity: parseInt(form.capacity) });
        toast.success('Table updated');
      } else {
        await api.post('/tables', { table_number: form.table_number, capacity: parseInt(form.capacity) });
        toast.success('Table added');
      }
      setShowForm(false);
      setEditingTable(null);
      setForm({ table_number: '', capacity: '4' });
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed');
    }
  };

  const startEdit = (t) => {
    setEditingTable(t);
    setForm({ table_number: t.table_number, capacity: String(t.capacity) });
    setShowForm(true);
  };

  const deleteTable = async (t) => {
    if (!window.confirm(`Delete table ${t.table_number}?`)) return;
    try {
      await api.delete(`/tables/${t.id}`);
      toast.success('Table deleted');
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed');
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <h2 style={{ margin: 0, color: '#1a1a2e', flex: 1 }}>Table Management</h2>
        <button onClick={() => { setShowForm(!showForm); setEditingTable(null); setForm({ table_number: '', capacity: '4' }); }} style={{
          padding: '8px 16px', background: '#4caf50', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600
        }}>+ Add Table</button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} style={{
          background: '#fff', borderRadius: 10, padding: 20, marginBottom: 20,
          display: 'flex', gap: 12, alignItems: 'end', boxShadow: '0 2px 8px rgba(0,0,0,0.06)'
        }}>
          <div>
            <label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 4 }}>Table Number</label>
            <input required value={form.table_number} onChange={e => setForm(f => ({ ...f, table_number: e.target.value }))}
              placeholder="e.g. T11" style={{ padding: '8px 12px', border: '1px solid #ddd', borderRadius: 6, fontSize: 13 }} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 4 }}>Seats</label>
            <input required type="number" min="1" value={form.capacity} onChange={e => setForm(f => ({ ...f, capacity: e.target.value }))}
              style={{ padding: '8px 12px', border: '1px solid #ddd', borderRadius: 6, fontSize: 13, width: 70 }} />
          </div>
          <button type="submit" style={{ padding: '8px 20px', background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
            {editingTable ? 'Update' : 'Add'}
          </button>
          <button type="button" onClick={() => { setShowForm(false); setEditingTable(null); }} style={{
            padding: '8px 16px', background: '#e8e8e8', color: '#555', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13
          }}>Cancel</button>
        </form>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16 }}>
        {tables.map(t => (
          <div key={t.id} style={{
            background: '#fff', borderRadius: 12, padding: 20, position: 'relative',
            borderTop: `4px solid ${statusColors[t.status]}`, boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
            textAlign: 'center'
          }}>
            <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 4 }}>
              <button onClick={() => startEdit(t)} style={{
                background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: '#1a1a2e', padding: 2
              }} title="Edit">✏️</button>
              <button onClick={() => deleteTable(t)} style={{
                background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: '#f44', padding: 2
              }} title="Delete">🗑️</button>
            </div>
            <div onClick={() => {
              if (t.active_order_id) navigate(`/orders?highlight=${t.active_order_id}`);
              else navigate('/billing');
            }} style={{ cursor: 'pointer' }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#1a1a2e' }}>{t.table_number}</div>
              <div style={{ fontSize: 12, color: '#888', margin: '4px 0' }}>{t.capacity} seats</div>
              <div style={{
                display: 'inline-block', padding: '4px 12px', borderRadius: 12, fontSize: 11, fontWeight: 600,
                background: `${statusColors[t.status]}22`, color: statusColors[t.status]
              }}>
                {t.status.toUpperCase()}
              </div>
              {t.order_number && (
                <div style={{ marginTop: 8, fontSize: 12, color: '#555' }}>
                  {t.order_number} — ₹{t.order_total}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
