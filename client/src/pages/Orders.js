import { useState, useEffect } from 'react';
import api from '../utils/api';
import toast from 'react-hot-toast';
import { buildBillEscPos, logoToRaster } from '../utils/escpos';

const statusColors = {
  active: '#2196f3', preparing: '#ff9800', ready: '#4caf50',
  served: '#9c27b0', completed: '#607d8b', cancelled: '#f44336'
};

const typeLabels = { dine_in: '🍽️ Dine-in', takeaway: '🛍️ Takeaway', delivery: '🛵 Delivery', zomato: '🟥 Zomato', swiggy: '🟧 Swiggy' };

function printContent(html, opts = {}) {
  const width = parseInt(opts.width) || 80;
  const printer = opts.printer || '';
  const doc = `<html><head><meta charset="utf-8"><style>
    @page { size: ${width}mm auto; margin: 0; }
    body { font-family: 'Courier New', monospace; font-size: 12px; width: ${width}mm; margin: 0 auto; padding: 3mm; color: #000; }
    .center { text-align: center; } .bold { font-weight: bold; } .line { border-top: 1px dashed #000; margin: 6px 0; }
    .dbl-line { border-top: 2px solid #000; margin: 6px 0; }
    .row { display: flex; justify-content: space-between; } .big { font-size: 16px; }
    table { width: 100%; border-collapse: collapse; } td { padding: 2px 0; font-size: 12px; }
    .sub { font-size: 10px; color: #555; } .detail { font-size: 11px; }
  </style></head><body>${html}</body></html>`;
  if (typeof window !== 'undefined' && window.electronAPI && printer) {
    window.electronAPI.printReceipt(doc, { deviceName: printer });
  } else {
    const win = window.open('', '_blank', 'width=320,height=700');
    win.document.write(doc);
    win.document.close();
    setTimeout(() => { win.print(); win.close(); }, 300);
  }
}

export default function Orders() {
  const [orders, setOrders] = useState([]);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [filter, setFilter] = useState({ status: '', type: '' });
  const [settings, setSettings] = useState({});
  const [reprintingId, setReprintingId] = useState(null);
  const [logoRaster, setLogoRaster] = useState(null);

  const load = () => {
    const params = new URLSearchParams();
    if (filter.status) params.set('status', filter.status);
    if (filter.type) params.set('type', filter.type);
    api.get(`/orders?${params}`).then(r => setOrders(r.data));
  };

  useEffect(() => { load(); }, [filter]);
  useEffect(() => {
    api.get('/settings').then(r => {
      setSettings(r.data);
      if (r.data.logo_url) {
        const w = parseInt(r.data.paper_width) === 58 ? 384 : 576;
        logoToRaster(r.data.logo_url, w).then(lr => setLogoRaster(lr)).catch(() => {});
      }
    }).catch(() => {});
  }, []);

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

  const reprintBill = async (order) => {
    setReprintingId(order.id);
    try {
      const { data } = await api.get(`/orders/${order.id}`);
      const gstEnabled = settings.gst_enabled !== 'false';
      if (window.electronAPI?.printRaw && settings.bill_printer) {
        const escData = buildBillEscPos(data, data.items || [], settings, gstEnabled, settings.paper_width, logoRaster);
        window.electronAPI.printRaw(escData, { deviceName: settings.bill_printer });
      } else {
        const rows = (data.items || []).map(i => {
          const name = i.item_name + (i.variant_name ? ` (${i.variant_name})` : '');
          return `<tr><td style="max-width:120px">${name}</td><td style="text-align:center">${i.quantity}</td><td style="text-align:right">₹${i.unit_price}</td><td style="text-align:right">₹${(i.unit_price*i.quantity).toFixed(0)}</td></tr>`;
        }).join('');
        printContent(`
          <div class="center bold big">${settings.outlet_name || 'Restaurant'} — REPRINT</div>
          <div class="dbl-line"></div>
          <div class="row detail"><span>Order #</span><span>${data.order_number}</span></div>
          <div class="row detail"><span>Type</span><span>${data.order_type === 'dine_in' ? 'Dine-in' : data.order_type === 'delivery' ? 'Delivery' : 'Takeaway'}</span></div>
          <div class="dbl-line"></div>
          <table>
            <tr style="font-weight:bold; font-size:11px"><td>Item</td><td style="text-align:center">Qty</td><td style="text-align:right">Rate</td><td style="text-align:right">Amt</td></tr>
            ${rows}
          </table>
          <div class="dbl-line"></div>
          <div class="row detail"><span>Subtotal</span><span>₹${parseFloat(data.subtotal).toFixed(2)}</span></div>
          ${parseFloat(data.tax_amount) > 0 ? `<div class="row detail"><span>GST</span><span>₹${parseFloat(data.tax_amount).toFixed(2)}</span></div>` : ''}
          ${parseFloat(data.packing_charges) > 0 ? `<div class="row detail"><span>Packing</span><span>₹${parseFloat(data.packing_charges).toFixed(2)}</span></div>` : ''}
          ${parseFloat(data.delivery_charges) > 0 ? `<div class="row detail"><span>Delivery</span><span>₹${parseFloat(data.delivery_charges).toFixed(2)}</span></div>` : ''}
          ${parseFloat(data.discount_amount) > 0 ? `<div class="row detail" style="color:#e53935"><span>Discount</span><span>-₹${parseFloat(data.discount_amount).toFixed(2)}</span></div>` : ''}
          <div class="dbl-line"></div>
          <div class="row bold" style="font-size:16px"><span>TOTAL</span><span>₹${parseFloat(data.total).toFixed(2)}</span></div>
          <div class="dbl-line"></div>
          <div class="center sub">*** REPRINT ***</div>
        `, { printer: settings.bill_printer, width: settings.paper_width });
      }
    } catch (err) { toast.error('Reprint failed'); }
    finally { setReprintingId(null); }
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
            <option value="delivery">Delivery</option>
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
              <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>₹{o.total}</div>
                <span style={{
                  fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 600,
                  background: `${statusColors[o.status]}22`, color: statusColors[o.status]
                }}>{o.status}</span>
                {o.payment_status === 'paid' && (
                  <button onClick={e => { e.stopPropagation(); reprintBill(o); }} disabled={reprintingId === o.id} style={{
                    padding: '3px 10px', fontSize: 10, fontWeight: 600, background: reprintingId === o.id ? '#ccc' : '#1a1a2e',
                    color: '#fff', border: 'none', borderRadius: 4, cursor: reprintingId === o.id ? 'default' : 'pointer'
                  }}>{reprintingId === o.id ? '...' : '🖨️ Reprint'}</button>
                )}
              </div>
            </div>
          ))}
          {orders.length === 0 && <p style={{ textAlign: 'center', color: '#999', padding: 40 }}>No orders today</p>}
        </div>
      </div>

      {detail && (
        <div style={{
          width: 380, background: '#fff', borderRadius: 12,
          boxShadow: '0 2px 12px rgba(0,0,0,0.08)', overflow: 'auto', display: 'flex', flexDirection: 'column'
        }}>
          {/* Bill Header */}
          <div style={{ background: '#1a1a2e', color: '#fff', padding: '16px 20px', borderRadius: '12px 12px 0 0' }}>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{detail.order_number}</div>
            <div style={{ fontSize: 12, color: '#aaa', marginTop: 2 }}>
              {typeLabels[detail.order_type]} · {new Date(detail.created_at).toLocaleString('en-IN', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })}
            </div>
            {detail.customer_name && <div style={{ fontSize: 12, color: '#ccc', marginTop: 2 }}>👤 {detail.customer_name}{detail.customer_phone ? ` · ${detail.customer_phone}` : ''}</div>}
            {detail.delivery_address && <div style={{ fontSize: 11, color: '#90caf9', marginTop: 2 }}>📍 {detail.delivery_address}</div>}
          </div>

          <div style={{ padding: '16px 20px', flex: 1 }}>
            {/* Items Table */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: '4px 10px', fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', paddingBottom: 6, borderBottom: '1px solid #e8e8e8', marginBottom: 6 }}>
                <span>Item</span><span style={{ textAlign: 'right' }}>Qty</span><span style={{ textAlign: 'right' }}>Rate</span><span style={{ textAlign: 'right' }}>Amt</span>
              </div>
              {detail.items?.map(item => (
                <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: '3px 10px', padding: '5px 0', borderBottom: '1px solid #f8f8f8', fontSize: 13, alignItems: 'center' }}>
                  <span style={{ color: '#1a1a2e', fontWeight: 500 }}>
                    <span style={{ fontSize: 8, marginRight: 4 }}>{item.is_veg ? '🟢' : '🔴'}</span>
                    {item.item_name}{item.variant_name ? ` (${item.variant_name})` : ''}
                  </span>
                  <span style={{ textAlign: 'right', color: '#555' }}>{item.quantity}</span>
                  <span style={{ textAlign: 'right', color: '#555' }}>₹{item.unit_price}</span>
                  <span style={{ textAlign: 'right', fontWeight: 600 }}>₹{(item.unit_price * item.quantity).toFixed(2)}</span>
                </div>
              ))}
            </div>

            {/* Totals */}
            <div style={{ borderTop: '2px dashed #ddd', paddingTop: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#555', marginBottom: 4 }}>
                <span>Subtotal ({detail.items?.reduce((s,i)=>s+i.quantity,0)} items)</span>
                <span>₹{parseFloat(detail.subtotal).toFixed(2)}</span>
              </div>
              {parseFloat(detail.tax_amount) > 0 && <>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#888', marginBottom: 3 }}>
                  <span>CGST</span><span>₹{(detail.tax_amount / 2).toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#888', marginBottom: 3 }}>
                  <span>SGST</span><span>₹{(detail.tax_amount / 2).toFixed(2)}</span>
                </div>
              </>}
              {parseFloat(detail.packing_charges) > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#ff9800', marginBottom: 3 }}>
                  <span>📦 Packing</span><span>₹{parseFloat(detail.packing_charges).toFixed(2)}</span>
                </div>
              )}
              {parseFloat(detail.delivery_charges) > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#2196f3', marginBottom: 3 }}>
                  <span>🛵 Delivery</span><span>₹{parseFloat(detail.delivery_charges).toFixed(2)}</span>
                </div>
              )}
              {parseFloat(detail.discount_amount) > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#e53935', marginBottom: 3 }}>
                  <span>🏷️ Discount{detail.discount_type === 'percent' && detail.discount_value ? ` (${detail.discount_value}%)` : ''}</span>
                  <span>-₹{parseFloat(detail.discount_amount).toFixed(2)}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 20, fontWeight: 800, color: '#1a1a2e', borderTop: '2px solid #1a1a2e', paddingTop: 8, marginTop: 6 }}>
                <span>TOTAL</span><span>₹{parseFloat(detail.total).toFixed(2)}</span>
              </div>
            </div>

            {/* Payment Badge */}
            <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700,
                background: detail.payment_status === 'paid' ? '#e8f5e9' : '#fff3e0',
                color: detail.payment_status === 'paid' ? '#2e7d32' : '#e65100'
              }}>
                {detail.payment_status === 'paid' ? '✓ PAID' : 'PENDING'}
              </span>
              {detail.payment_method && <span style={{ fontSize: 12, color: '#888' }}>via {detail.payment_method.toUpperCase()}</span>}
              {detail.bill_printed ? <span style={{ fontSize: 11, color: '#1976d2', fontWeight: 600 }}>🖨️ Bill Printed</span> : null}
            </div>

            {/* Reprint */}
            {detail.payment_status === 'paid' && (
              <button onClick={() => reprintBill(detail)} disabled={reprintingId === detail.id} style={{
                marginTop: 10, width: '100%', padding: '8px', background: reprintingId === detail.id ? '#ccc' : '#1a1a2e',
                color: '#fff', border: 'none', borderRadius: 6, cursor: reprintingId === detail.id ? 'default' : 'pointer', fontSize: 12, fontWeight: 600
              }}>{reprintingId === detail.id ? '⏳ Printing...' : '🖨️ Reprint Bill'}</button>
            )}

            {/* Status Actions */}
            <div style={{ display: 'flex', gap: 6, marginTop: 14, flexWrap: 'wrap' }}>
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
          </div>
        </div>
      )}
    </div>
  );
}
