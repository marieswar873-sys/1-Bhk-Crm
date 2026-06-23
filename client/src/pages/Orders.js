import { useState, useEffect } from 'react';
import api from '../utils/api';
import toast from 'react-hot-toast';

const statusColors = {
  active: '#2196f3', preparing: '#ff9800', ready: '#4caf50',
  served: '#9c27b0', completed: '#607d8b', cancelled: '#f44336'
};

const typeLabels = { dine_in: '🍽️ Dine-in', takeaway: '🛍️ Takeaway', zomato: '🟥 Zomato', swiggy: '🟧 Swiggy' };

export default function Orders() {
  const [orders, setOrders] = useState([]);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [filter, setFilter] = useState({ status: '', type: '' });

  const load = () => {
    const params = new URLSearchParams();
    if (filter.status) params.set('status', filter.status);
    if (filter.type) params.set('type', filter.type);
    api.get(`/orders?${params}`).then(r => setOrders(r.data));
  };

  useEffect(() => { load(); }, [filter]);

  const loadDetail = async (id) => {
    setSelected(id);
    const { data } = await api.get(`/orders/${id}`);
    setDetail(data);
  };

  const updateStatus = async (id, status) => {
    await api.patch(`/orders/${id}/status`, { status });
    toast.success(`Order ${status}`);
    load();
    if (selected === id) loadDetail(id);
  };

  return (
    <div style={{ display: 'flex', gap: 20, height: 'calc(100vh - 48px)' }}>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
          <h2 style={{ margin: 0, color: '#1a1a2e', flex: 1 }}>Orders</h2>
          <select value={filter.type} onChange={e => setFilter(f => ({ ...f, type: e.target.value }))}
            style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #ddd', fontSize: 13 }}>
            <option value="">All Types</option>
            <option value="dine_in">Dine-in</option>
            <option value="takeaway">Takeaway</option>
            <option value="zomato">Zomato</option>
            <option value="swiggy">Swiggy</option>
          </select>
          <select value={filter.status} onChange={e => setFilter(f => ({ ...f, status: e.target.value }))}
            style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #ddd', fontSize: 13 }}>
            <option value="">All Status</option>
            {Object.keys(statusColors).map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <button onClick={load} style={{
            padding: '6px 14px', background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13
          }}>Refresh</button>
        </div>

        <div style={{ overflow: 'auto' }}>
          {orders.map(o => (
            <div key={o.id} onClick={() => loadDetail(o.id)} style={{
              background: selected === o.id ? '#e3f2fd' : '#fff', borderRadius: 8, padding: '12px 16px',
              marginBottom: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12,
              boxShadow: '0 1px 4px rgba(0,0,0,0.04)'
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{o.order_number}</div>
                <div style={{ fontSize: 12, color: '#888' }}>{typeLabels[o.order_type]} · {o.customer_name || 'Walk-in'}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>₹{o.total}</div>
                <span style={{
                  fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 600,
                  background: `${statusColors[o.status]}22`, color: statusColors[o.status]
                }}>{o.status}</span>
              </div>
            </div>
          ))}
          {orders.length === 0 && <p style={{ textAlign: 'center', color: '#999', padding: 40 }}>No orders today</p>}
        </div>
      </div>

      {detail && (
        <div style={{
          width: 360, background: '#fff', borderRadius: 12, padding: 20,
          boxShadow: '0 2px 12px rgba(0,0,0,0.08)', overflow: 'auto'
        }}>
          <h3 style={{ margin: '0 0 4px' }}>{detail.order_number}</h3>
          <div style={{ fontSize: 12, color: '#888', marginBottom: 16 }}>
            {typeLabels[detail.order_type]} · {new Date(detail.created_at).toLocaleString()}
          </div>

          {detail.items?.map(item => (
            <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f5f5f5', fontSize: 13 }}>
              <span>{item.is_veg ? '🟢' : '🔴'} {item.item_name} × {item.quantity}</span>
              <span style={{ fontWeight: 600 }}>₹{item.total}</span>
            </div>
          ))}

          <div style={{ borderTop: '2px solid #1a1a2e', marginTop: 12, paddingTop: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
              <span>Subtotal</span><span>₹{detail.subtotal}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
              <span>CGST</span><span>₹{(detail.tax_amount / 2).toFixed(2)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 8 }}>
              <span>SGST</span><span>₹{(detail.tax_amount / 2).toFixed(2)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 18, fontWeight: 700 }}>
              <span>Total</span><span>₹{detail.total}</span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 6, marginTop: 16, flexWrap: 'wrap' }}>
            {detail.status === 'active' && <button onClick={() => updateStatus(detail.id, 'preparing')}
              style={{ padding: '8px 14px', background: '#ff9800', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Mark Preparing</button>}
            {detail.status === 'preparing' && <button onClick={() => updateStatus(detail.id, 'ready')}
              style={{ padding: '8px 14px', background: '#4caf50', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Mark Ready</button>}
            {detail.status === 'ready' && <button onClick={() => updateStatus(detail.id, 'served')}
              style={{ padding: '8px 14px', background: '#9c27b0', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Mark Served</button>}
            {!['completed', 'cancelled'].includes(detail.status) && (
              <button onClick={() => updateStatus(detail.id, 'cancelled')}
                style={{ padding: '8px 14px', background: '#f44336', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Cancel</button>
            )}
          </div>

          <div style={{ marginTop: 12, fontSize: 12, color: '#888' }}>
            Payment: <b style={{ color: detail.payment_status === 'paid' ? '#4caf50' : '#ff9800' }}>{detail.payment_status}</b>
            {detail.payment_method && ` via ${detail.payment_method}`}
          </div>
        </div>
      )}
    </div>
  );
}
