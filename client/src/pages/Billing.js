import { useState, useEffect, useCallback } from 'react';
import api from '../utils/api';
import toast from 'react-hot-toast';

const LOGO_URL = window.location.origin + '/logo.png';

function printContent(html, waitForImages) {
  const win = window.open('', '_blank', 'width=320,height=700');
  win.document.write(`<html><head><style>
    body { font-family: 'Courier New', monospace; font-size: 12px; width: 72mm; margin: 0 auto; padding: 4mm; color: #000; }
    .center { text-align: center; } .bold { font-weight: bold; } .line { border-top: 1px dashed #000; margin: 6px 0; }
    .dbl-line { border-top: 2px solid #000; margin: 6px 0; }
    .row { display: flex; justify-content: space-between; } .big { font-size: 16px; } .xl { font-size: 20px; }
    table { width: 100%; border-collapse: collapse; } td { padding: 2px 0; font-size: 12px; }
    .logo { width: 60px; height: 60px; margin: 0 auto 4px; display: block; }
    .sub { font-size: 10px; color: #555; } .detail { font-size: 11px; }
    @media print { body { margin: 0; } @page { margin: 2mm; } }
  </style></head><body>${html}</body></html>`);
  win.document.close();
  const delay = waitForImages ? 800 : 300;
  setTimeout(() => { win.print(); win.close(); }, delay);
}

function formatTime(dateStr) {
  return new Date(dateStr).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function Billing() {
  const [menuItems, setMenuItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [tables, setTables] = useState([]);
  const [settings, setSettings] = useState({ gst_enabled: 'true', gst_percent: '5', packing_charges: '10', outlet_name: '', outlet_address: '', outlet_phone: '', outlet_gstin: '', outlet_fssai: '', logo_url: '', hero_tagline: '' });

  const [selectedCat, setSelectedCat] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [orderType, setOrderType] = useState('takeaway');
  const [tableId, setTableId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');

  const [mode, setMode] = useState('new_order'); // new_order | active_order | payment
  const [activeOrders, setActiveOrders] = useState([]);
  const [currentOrder, setCurrentOrder] = useState(null);
  const [existingItems, setExistingItems] = useState([]);
  const [newItems, setNewItems] = useState([]);
  const [variantPopup, setVariantPopup] = useState(null);

  const loadMenu = () => {
    Promise.all([api.get('/menu/items'), api.get('/menu/categories'), api.get('/tables'), api.get('/settings')])
      .then(([items, cats, tbls, sett]) => {
        setMenuItems(items.data);
        setCategories(cats.data);
        setTables(tbls.data);
        setSettings(sett.data);
      });
  };

  const loadActiveOrders = useCallback(() => {
    api.get('/orders/active').then(r => setActiveOrders(r.data)).catch(() => {});
  }, []);

  useEffect(() => { loadMenu(); loadActiveOrders(); }, [loadActiveOrders]);
  useEffect(() => { const i = setInterval(loadActiveOrders, 30000); return () => clearInterval(i); }, [loadActiveOrders]);

  const gstEnabled = settings.gst_enabled === 'true';

  const filteredItems = menuItems.filter(i => {
    if (selectedCat !== 'all' && i.category_id !== selectedCat) return false;
    if (searchQuery && !i.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return i.is_available;
  });

  // Cart management (newItems only)
  const addToCart = (item, variant) => {
    const cartKey = variant ? `${item.id}_${variant.id}` : item.id;
    const price = variant ? item.price + variant.price_delta : item.price;
    const label = variant ? `${item.name} (${variant.name})` : item.name;
    setNewItems(prev => {
      const existing = prev.find(c => c.cart_key === cartKey);
      if (existing) return prev.map(c => c.cart_key === cartKey ? { ...c, quantity: c.quantity + 1 } : c);
      return [...prev, { cart_key: cartKey, menu_item_id: item.id, variant_id: variant?.id || null, name: label, price, tax_percent: item.tax_percent, quantity: 1, is_veg: item.is_veg, price_delta: variant?.price_delta || 0 }];
    });
    setVariantPopup(null);
  };

  const handleItemClick = (item) => {
    if (item.variants && item.variants.length > 0) setVariantPopup(item);
    else addToCart(item, null);
  };

  const updateNewQty = (cartKey, delta) => {
    setNewItems(prev => prev.map(c => c.cart_key !== cartKey ? c : { ...c, quantity: Math.max(0, c.quantity + delta) }).filter(c => c.quantity > 0));
  };

  const removeNew = (cartKey) => setNewItems(prev => prev.filter(c => c.cart_key !== cartKey));

  const updateNewPrice = (cartKey, newPrice) => {
    const p = parseFloat(newPrice);
    if (isNaN(p) || p < 0) return;
    setNewItems(prev => prev.map(c => c.cart_key !== cartKey ? c : { ...c, price: p }));
  };

  // Existing item edit (already in kitchen)
  const updateExistingQty = async (itemId, newQty) => {
    if (!currentOrder) return;
    try {
      await api.patch(`/orders/${currentOrder.id}/items/${itemId}`, { quantity: newQty });
      await loadOrder(currentOrder.id);
      toast.success('Updated');
    } catch (err) { toast.error(err.response?.data?.error || 'Failed'); }
  };

  const removeExistingItem = async (itemId) => {
    if (!currentOrder) return;
    try {
      await api.delete(`/orders/${currentOrder.id}/items/${itemId}`);
      await loadOrder(currentOrder.id);
      toast.success('Removed');
    } catch (err) { toast.error(err.response?.data?.error || 'Failed'); }
  };

  // Load an active order
  const loadOrder = async (orderId) => {
    const { data } = await api.get(`/orders/${orderId}`);
    setCurrentOrder(data);
    setExistingItems(data.items || []);
    setCustomerName(data.customer_name || '');
    setCustomerPhone(data.customer_phone || '');
    setOrderType(data.order_type);
    setTableId(data.table_id || '');
    setNewItems([]);
    // If bill already printed, go straight to payment mode
    setMode(data.bill_printed ? 'payment' : 'active_order');
  };

  // Totals
  const packingEnabled = settings.packing_enabled !== 'false';
  const isTakeawayOrder = (mode === 'new_order' ? orderType === 'takeaway' : currentOrder?.order_type === 'takeaway');
  const existingSubtotal = existingItems.reduce((s, i) => s + i.unit_price * i.quantity, 0);
  const existingTax = gstEnabled ? existingItems.reduce((s, i) => s + i.tax_amount, 0) : 0;
  const existingPacking = existingItems.reduce((s, i) => s + (i.packing_charge || 0), 0);
  const newSubtotal = newItems.reduce((s, c) => s + c.price * c.quantity, 0);
  const newTax = gstEnabled ? newItems.reduce((s, c) => s + (c.price * c.quantity * c.tax_percent / 100), 0) : 0;
  const grandSubtotal = Math.round((existingSubtotal + newSubtotal) * 100) / 100;
  const grandTax = Math.round((existingTax + newTax) * 100) / 100;
  const grandPacking = Math.round(existingPacking * 100) / 100;
  const grandTotal = Math.round((grandSubtotal + grandTax + grandPacking) * 100) / 100;

  // === KOT PRINT ===
  const printKot = (kotNumber, orderNumber, type, tableNum, items) => {
    const rows = items.map(i => `<tr><td>${i.quantity} x ${i.name}</td></tr>`).join('');
    printContent(`
      <div class="center bold big">--- KOT #${kotNumber} ---</div>
      <div class="line"></div>
      <div>Order: ${orderNumber}</div>
      <div>Type: ${type === 'dine_in' ? 'Dine-in' : 'Takeaway'}${tableNum ? ' ('+tableNum+')' : ''}</div>
      <div>Time: ${new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</div>
      <div class="line"></div>
      <table>${rows}</table>
      <div class="line"></div>
    `);
  };

  // === BILL PRINT ===
  const printBill = (order, items) => {
    const s = settings;
    const rows = items.map(i => {
      const name = i.item_name + (i.variant_name ? ` (${i.variant_name})` : '');
      const amt = (i.unit_price * i.quantity).toFixed(0);
      return `<tr><td style="max-width:120px">${name}</td><td style="text-align:center">${i.quantity}</td><td style="text-align:right">₹${i.unit_price}</td><td style="text-align:right">₹${amt}</td></tr>`;
    }).join('');

    const totalItems = items.reduce((s, i) => s + i.quantity, 0);

    const gstSection = gstEnabled ? `
      <div class="row detail"><span>CGST (${(s.gst_percent/2)}%)</span><span>₹${(order.tax_amount/2).toFixed(2)}</span></div>
      <div class="row detail"><span>SGST (${(s.gst_percent/2)}%)</span><span>₹${(order.tax_amount/2).toFixed(2)}</span></div>
    ` : '';

    printContent(`
      <!-- Logo & Header -->
      <div class="center">
        <img src="${s.logo_url || LOGO_URL}" class="logo" alt="Logo" />
      </div>
      <div class="center bold big">${s.outlet_name || 'Restaurant'}</div>
      ${s.hero_tagline ? `<div class="center sub">${s.hero_tagline}</div>` : ''}
      ${s.outlet_address ? `<div class="center sub">${s.outlet_address}</div>` : ''}
      ${s.outlet_phone ? `<div class="center sub">Ph: ${s.outlet_phone}</div>` : ''}
      <div class="dbl-line"></div>

      <!-- Tax Invoice Header -->
      <div class="center bold" style="font-size:13px">${gstEnabled ? 'TAX INVOICE' : 'BILL'}</div>
      ${s.outlet_gstin ? `<div class="center sub">GSTIN: ${s.outlet_gstin}</div>` : ''}
      ${s.outlet_fssai ? `<div class="center sub">FSSAI: ${s.outlet_fssai}</div>` : ''}
      <div class="line"></div>

      <!-- Order Details -->
      <div class="row detail"><span>Order #</span><span>${order.order_number}</span></div>
      <div class="row detail"><span>Date</span><span>${formatDate(order.created_at)}</span></div>
      <div class="row detail"><span>Type</span><span>${order.order_type === 'dine_in' ? 'Dine-in' : 'Takeaway'}</span></div>
      ${order.customer_name ? `<div class="row detail"><span>Customer</span><span>${order.customer_name}</span></div>` : ''}
      ${order.customer_phone ? `<div class="row detail"><span>Phone</span><span>${order.customer_phone}</span></div>` : ''}
      <div class="dbl-line"></div>

      <!-- Items Table -->
      <table>
        <tr style="font-weight:bold; border-bottom:1px solid #000; font-size:11px">
          <td>Item</td><td style="text-align:center">Qty</td><td style="text-align:right">Rate</td><td style="text-align:right">Amt</td>
        </tr>
        ${rows}
      </table>
      <div class="dbl-line"></div>

      <!-- Totals -->
      <div class="row detail"><span>Subtotal (${totalItems} items)</span><span>₹${order.subtotal.toFixed(2)}</span></div>
      ${gstSection}
      ${order.packing_charges > 0 ? `<div class="row detail"><span>Packing Charges</span><span>₹${order.packing_charges.toFixed(2)}</span></div>` : ''}
      <div class="dbl-line"></div>
      <div class="row bold xl"><span>TOTAL</span><span>₹${order.total.toFixed(2)}</span></div>
      <div class="dbl-line"></div>

      <!-- Footer -->
      <br>
      <div class="center sub">Thank you for dining with us!</div>
      <div class="center sub">Visit again — ${s.outlet_name || 'see you soon'}</div>
      <div class="center sub" style="margin-top:4px">--- * ---</div>
    `, true);
  };

  // === ACTIONS ===

  // Send to Kitchen (new order)
  const sendToKitchen = async () => {
    if (!newItems.length) return toast.error('Add items first');
    if (orderType === 'dine_in' && !tableId) return toast.error('Select a table');

    try {
      const { data } = await api.post('/orders', {
        order_type: orderType, table_id: orderType === 'dine_in' ? tableId : null,
        customer_name: customerName || null, customer_phone: customerPhone || null,
        items: newItems.map(c => ({ menu_item_id: c.menu_item_id, variant_id: c.variant_id, quantity: c.quantity, price_delta: c.price_delta })),
      });
      toast.success(`Order ${data.order_number} — KOT #${data.kot_number}`);
      const table = tables.find(t => t.id === tableId);
      printKot(data.kot_number, data.order_number, orderType, table?.table_number, newItems);
      await loadOrder(data.id);
      loadActiveOrders();
      loadMenu();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed'); }
  };

  // Send additional KOT
  const sendAdditionalKot = async () => {
    if (!newItems.length || !currentOrder) return;
    try {
      const { data } = await api.post(`/orders/${currentOrder.id}/kot`, {
        items: newItems.map(c => ({ menu_item_id: c.menu_item_id, variant_id: c.variant_id, quantity: c.quantity, price_delta: c.price_delta })),
      });
      toast.success(`KOT #${data.kot_number} sent!`);
      const table = tables.find(t => t.id === currentOrder.table_id);
      printKot(data.kot_number, currentOrder.order_number, currentOrder.order_type, table?.table_number, newItems);
      await loadOrder(currentOrder.id);
      loadActiveOrders();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed'); }
  };

  // Save Order (just refresh totals, no print)
  const saveOrder = async () => {
    if (!currentOrder) return;
    toast.success('Order saved');
    await loadOrder(currentOrder.id);
    loadActiveOrders();
  };

  // Generate Bill (print bill, mark as billed, then show payment buttons)
  const generateBill = async () => {
    if (!currentOrder) return;
    if (newItems.length > 0) return toast.error('Send pending items to kitchen first');
    printBill(currentOrder, existingItems);
    await api.patch(`/orders/${currentOrder.id}/bill-printed`);
    setCurrentOrder(prev => ({ ...prev, bill_printed: 1 }));
    setMode('payment');
    toast.success('Bill printed');
  };

  // Bill & Paid (print bill + mark paid in one click)
  const billAndPay = async (method) => {
    if (!currentOrder) return;
    if (newItems.length > 0) return toast.error('Send pending items to kitchen first');
    printBill(currentOrder, existingItems);
    try {
      await api.post(`/orders/${currentOrder.id}/quick-pay`, { method });
      toast.success(`Bill printed & paid via ${method}!`);
      resetToNew();
      loadActiveOrders();
      loadMenu();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed'); }
  };

  // Quick Pay (from payment screen after bill is printed)
  const quickPay = async (method) => {
    if (!currentOrder) return;
    try {
      await api.post(`/orders/${currentOrder.id}/quick-pay`, { method });
      toast.success(`Paid via ${method}!`);
      resetToNew();
      loadActiveOrders();
      loadMenu();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed'); }
  };

  const resetToNew = () => {
    setMode('new_order');
    setCurrentOrder(null);
    setExistingItems([]);
    setNewItems([]);
    setCustomerName('');
    setCustomerPhone('');
    setTableId('');
    setOrderType('takeaway');
  };

  const [mobileTab, setMobileTab] = useState('menu'); // orders | menu | cart
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  const btnStyle = (active) => ({
    padding: '7px 14px', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600,
    background: active ? '#1a1a2e' : '#e8e8e8', color: active ? '#fff' : '#555',
  });

  const cartCount = newItems.length + existingItems.length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 48px)', position: 'relative' }}>
      {/* Mobile Tab Bar */}
      <div style={{ display: 'none', background: '#1a1a2e', padding: '6px', gap: 4 }}
        className="mobile-tabs">
        {[['orders', `Orders (${activeOrders.length})`], ['menu', 'Menu'], ['cart', `Cart (${cartCount})`]].map(([key, label]) => (
          <button key={key} onClick={() => setMobileTab(key)} style={{
            flex: 1, padding: '8px', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 700,
            background: mobileTab === key ? '#d4a853' : 'transparent', color: mobileTab === key ? '#1a1a2e' : '#fff',
          }}>{label}</button>
        ))}
      </div>
      <style>{`
        @media (max-width: 768px) {
          .mobile-tabs { display: flex !important; }
          .desktop-sidebar { display: none !important; }
          .desktop-menu { display: ${mobileTab === 'menu' ? 'flex' : 'none'} !important; }
          .desktop-cart { display: ${mobileTab === 'cart' ? 'flex' : 'none'} !important; }
          .mobile-orders { display: ${mobileTab === 'orders' ? 'block' : 'none'} !important; }
          .desktop-cart { width: 100% !important; border-left: none !important; }
          .desktop-menu { padding: 8px !important; }
        }
      `}</style>
      <div style={{ display: 'flex', flex: 1, gap: 0, overflow: 'hidden' }}>

      {/* === LEFT: Active Orders Sidebar === */}
      <div className="desktop-sidebar" style={{ width: 200, background: '#fff', borderRight: '1px solid #e8e8e8', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        <button onClick={resetToNew} style={{
          margin: 10, padding: '10px', background: '#4caf50', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700
        }}>+ New Order</button>
        <div style={{ padding: '0 10px 6px', fontSize: 11, color: '#888', fontWeight: 600 }}>ACTIVE ORDERS ({activeOrders.length})</div>
        <div style={{ flex: 1, overflow: 'auto' }}>
          {activeOrders.map(o => (
            <div key={o.id} onClick={() => loadOrder(o.id)} style={{
              padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid #f0f0f0',
              background: currentOrder?.id === o.id ? '#e3f2fd' : 'transparent'
            }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1a2e' }}>{o.order_number}</div>
              <div style={{ fontSize: 11, color: '#888' }}>
                {o.order_type === 'dine_in' ? '🍽️' : '🛍️'} {o.customer_name || 'Walk-in'} · ₹{o.total}
              </div>
              <div style={{ fontSize: 10, color: '#aaa' }}>
                {formatTime(o.created_at)} · {o.item_count} items
                {o.bill_printed ? <span style={{ color: '#ff9800', fontWeight: 700 }}> · BILLED</span> : ''}
              </div>
            </div>
          ))}
          {activeOrders.length === 0 && <p style={{ textAlign: 'center', color: '#ccc', fontSize: 12, padding: 20 }}>No active orders</p>}
        </div>
      </div>

      {/* === Mobile: Orders Tab === */}
      <div className="mobile-orders" style={{ display: 'none', flex: 1, overflow: 'auto', background: '#fff', padding: 12 }}>
        <button onClick={() => { resetToNew(); setMobileTab('menu'); }} style={{
          width: '100%', padding: 10, background: '#4caf50', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700, marginBottom: 10
        }}>+ New Order</button>
        <div style={{ fontSize: 11, color: '#888', fontWeight: 600, marginBottom: 8 }}>ACTIVE ORDERS ({activeOrders.length})</div>
        {activeOrders.map(o => (
          <div key={o.id} onClick={() => { loadOrder(o.id); setMobileTab('cart'); }} style={{
            padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid #f0f0f0', borderRadius: 8, marginBottom: 4,
            background: currentOrder?.id === o.id ? '#e3f2fd' : '#f8f9fa'
          }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1a2e' }}>{o.order_number}</div>
            <div style={{ fontSize: 11, color: '#888' }}>{o.order_type === 'dine_in' ? '🍽️' : '🛍️'} {o.customer_name || 'Walk-in'} · ₹{o.total}</div>
          </div>
        ))}
        {activeOrders.length === 0 && <p style={{ textAlign: 'center', color: '#ccc', fontSize: 12, padding: 20 }}>No active orders</p>}
      </div>

      {/* === MIDDLE: Menu Grid === */}
      <div className="desktop-menu" style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '12px 16px', minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          {mode === 'new_order' && <>
            {['takeaway', 'dine_in'].map(t => (
              <button key={t} onClick={() => setOrderType(t)} style={btnStyle(orderType === t)}>
                {t === 'dine_in' ? '🍽️ Dine-in' : '🛍️ Takeaway'}
              </button>
            ))}
            {orderType === 'dine_in' && (
              <select value={tableId} onChange={e => setTableId(e.target.value)} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #ddd', fontSize: 12 }}>
                <option value="">Select Table</option>
                {tables.filter(t => t.status === 'available').map(t => <option key={t.id} value={t.id}>{t.table_number} ({t.capacity})</option>)}
              </select>
            )}
          </>}
          {mode === 'active_order' && currentOrder && (
            <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1a2e' }}>
              {currentOrder.order_number} · {currentOrder.order_type === 'dine_in' ? '🍽️' : '🛍️'} · {currentOrder.customer_name || 'Walk-in'}
            </div>
          )}
          {mode === 'payment' && <div style={{ fontSize: 14, fontWeight: 700, color: '#4caf50' }}>Bill printed — Select payment method</div>}
        </div>

        {mode !== 'payment' && (
          <>
            <input placeholder="Search menu..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #ddd', marginBottom: 10, fontSize: 13 }} />
            <div style={{ display: 'flex', gap: 4, marginBottom: 10, flexWrap: 'wrap' }}>
              <button onClick={() => setSelectedCat('all')} style={btnStyle(selectedCat === 'all')}>All</button>
              {categories.map(c => <button key={c.id} onClick={() => setSelectedCat(c.id)} style={btnStyle(selectedCat === c.id)}>{c.name}</button>)}
            </div>
            <div style={{ flex: 1, overflow: 'auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8, alignContent: 'start' }}>
              {filteredItems.map(item => {
                const hasV = item.variants?.length > 0;
                const minP = hasV ? Math.min(item.price, ...item.variants.map(v => item.price + v.price_delta)) : item.price;
                const maxP = hasV ? Math.max(...item.variants.map(v => item.price + v.price_delta)) : null;
                return (
                  <div key={item.id} onClick={() => handleItemClick(item)} style={{
                    background: '#fff', borderRadius: 8, padding: 12, cursor: 'pointer', border: '2px solid transparent',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.05)', transition: 'border-color 0.15s'
                  }} onMouseEnter={e => e.currentTarget.style.borderColor = '#4fc3f7'} onMouseLeave={e => e.currentTarget.style.borderColor = 'transparent'}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                      <span style={{ width: 8, height: 8, borderRadius: 2, background: item.is_veg ? '#4caf50' : '#f44336' }} />
                      <span style={{ fontSize: 11, fontWeight: 600, color: '#1a1a2e', lineHeight: 1.2 }}>{item.name}</span>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#4fc3f7' }}>₹{minP}{maxP ? `–₹${maxP}` : ''}</div>
                    {hasV && <div style={{ fontSize: 9, color: '#ff9800', fontWeight: 600 }}>{item.variants.length} sizes</div>}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {mode === 'payment' && currentOrder && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 20 }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: '#1a1a2e' }}>₹{currentOrder.total.toFixed(2)}</div>
            <div style={{ fontSize: 14, color: '#888' }}>Order {currentOrder.order_number} — Bill printed</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#555', marginTop: 10 }}>How did they pay?</div>
            <div style={{ display: 'flex', gap: 16 }}>
              {[['cash', '💵 Cash', '#4caf50'], ['upi', '📱 UPI', '#2196f3'], ['card', '💳 Card', '#ff9800']].map(([m, label, color]) => (
                <button key={m} onClick={() => quickPay(m)} style={{
                  padding: '20px 32px', background: color, color: '#fff', border: 'none', borderRadius: 12,
                  cursor: 'pointer', fontSize: 18, fontWeight: 700, boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
                }}>{label}</button>
              ))}
            </div>
            <button onClick={() => setMode('active_order')} style={{ marginTop: 10, background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 13 }}>
              ← Back to order
            </button>
          </div>
        )}
      </div>

      {/* === RIGHT: Order Panel === */}
      {mode !== 'payment' && (
        <div className="desktop-cart" style={{ width: 340, background: '#fff', borderLeft: '1px solid #e8e8e8', padding: 16, display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
          <h3 style={{ margin: '0 0 4px', fontSize: 15, color: '#1a1a2e' }}>
            {mode === 'new_order' ? 'New Order' : `Order ${currentOrder?.order_number || ''}`}
          </h3>

          {mode === 'new_order' && (
            <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
              <input placeholder="Customer name" value={customerName} onChange={e => setCustomerName(e.target.value)}
                style={{ flex: 1, padding: '6px 8px', border: '1px solid #ddd', borderRadius: 6, fontSize: 12 }} />
              <input placeholder="Phone" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)}
                style={{ width: 100, padding: '6px 8px', border: '1px solid #ddd', borderRadius: 6, fontSize: 12 }} />
            </div>
          )}

          <div style={{ flex: 1, overflow: 'auto' }}>
            {/* Existing items (in kitchen) */}
            {existingItems.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#888', textTransform: 'uppercase', marginBottom: 6 }}>In Kitchen</div>
                {existingItems.map(item => (
                  <div key={item.id} style={{ display: 'flex', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #f5f5f5', background: '#fafafa', borderRadius: 4, marginBottom: 2, paddingLeft: 6, paddingRight: 6 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: '#666' }}>
                        {item.is_veg ? '🟢' : '🔴'} {item.item_name}{item.variant_name ? ` (${item.variant_name})` : ''}
                      </div>
                      <div style={{ fontSize: 10, color: '#aaa' }}>₹{item.unit_price} × {item.quantity}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
                      <button onClick={() => updateExistingQty(item.id, Math.max(1, item.quantity - 1))} style={{ width: 22, height: 22, borderRadius: '50%', border: '1px solid #ddd', background: '#fff', cursor: 'pointer', fontSize: 13 }}>−</button>
                      <span style={{ fontSize: 12, fontWeight: 600, minWidth: 16, textAlign: 'center' }}>{item.quantity}</span>
                      <button onClick={() => updateExistingQty(item.id, item.quantity + 1)} style={{ width: 22, height: 22, borderRadius: '50%', border: '1px solid #ddd', background: '#fff', cursor: 'pointer', fontSize: 13 }}>+</button>
                      <button onClick={() => removeExistingItem(item.id)} style={{ background: 'none', border: 'none', color: '#f44', cursor: 'pointer', fontSize: 12 }}>✕</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* New items (pending KOT) */}
            {newItems.length > 0 && (
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#ff9800', textTransform: 'uppercase', marginBottom: 6 }}>
                  {mode === 'active_order' ? 'New Items (pending KOT)' : 'Cart'}
                </div>
                {newItems.map(item => (
                  <div key={item.cart_key} style={{ display: 'flex', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #f0f0f0' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: '#1a1a2e' }}>{item.is_veg ? '🟢' : '🔴'} {item.name}</div>
                      <div style={{ fontSize: 10, color: '#888', display: 'flex', alignItems: 'center', gap: 2 }}>
                        ₹<input type="number" value={item.price} onChange={e => updateNewPrice(item.cart_key, e.target.value)}
                          style={{ width: 45, border: '1px solid #ddd', borderRadius: 3, padding: '1px 3px', fontSize: 10, textAlign: 'center' }} />
                        × {item.quantity} = ₹{(item.price * item.quantity).toFixed(0)}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
                      <button onClick={() => updateNewQty(item.cart_key, -1)} style={{ width: 22, height: 22, borderRadius: '50%', border: '1px solid #ddd', background: '#fff', cursor: 'pointer', fontSize: 13 }}>−</button>
                      <span style={{ fontSize: 12, fontWeight: 600, minWidth: 16, textAlign: 'center' }}>{item.quantity}</span>
                      <button onClick={() => updateNewQty(item.cart_key, 1)} style={{ width: 22, height: 22, borderRadius: '50%', border: '1px solid #ddd', background: '#fff', cursor: 'pointer', fontSize: 13 }}>+</button>
                      <button onClick={() => removeNew(item.cart_key)} style={{ background: 'none', border: 'none', color: '#f44', cursor: 'pointer', fontSize: 12 }}>✕</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {existingItems.length === 0 && newItems.length === 0 && (
              <p style={{ textAlign: 'center', color: '#ccc', padding: 30, fontSize: 13 }}>Tap items to add</p>
            )}
          </div>

          {/* Totals */}
          <div style={{ borderTop: '2px solid #1a1a2e', paddingTop: 10, marginTop: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#666', marginBottom: 3 }}>
              <span>Subtotal</span><span>₹{grandSubtotal.toFixed(2)}</span>
            </div>
            {gstEnabled && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#666', marginBottom: 3 }}>
                <span>GST ({settings.gst_percent}%)</span><span>₹{grandTax.toFixed(2)}</span>
              </div>
            )}
            {grandPacking > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#ff9800', marginBottom: 3 }}>
                <span>Packing</span><span>₹{grandPacking.toFixed(2)}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 17, fontWeight: 700, color: '#1a1a2e', marginTop: 4 }}>
              <span>Total</span><span>₹{grandTotal.toFixed(2)}</span>
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {mode === 'new_order' && (
              <button onClick={sendToKitchen} disabled={!newItems.length} style={{
                padding: 12, background: newItems.length ? '#ff9800' : '#ccc', color: '#fff',
                border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: newItems.length ? 'pointer' : 'default'
              }}>🔥 Send to Kitchen (KOT)</button>
            )}
            {mode === 'active_order' && (
              <>
                {newItems.length > 0 && (
                  <button onClick={sendAdditionalKot} style={{
                    padding: 12, background: '#ff9800', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer'
                  }}>🔥 Send KOT ({newItems.length} new items)</button>
                )}
                <button onClick={saveOrder} style={{
                  padding: 10, background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer'
                }}>💾 Save Order</button>

                {/* Dine-in: Generate Bill only (customer pays later) */}
                {(currentOrder?.order_type === 'dine_in') && (
                  <button onClick={generateBill} disabled={newItems.length > 0} style={{
                    padding: 10, background: newItems.length > 0 ? '#ccc' : '#2196f3', color: '#fff',
                    border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: newItems.length > 0 ? 'default' : 'pointer'
                  }}>🧾 Generate Bill</button>
                )}

                {/* Takeaway: Bill & Pay one-click (customer pays at counter) */}
                {(currentOrder?.order_type !== 'dine_in') && (
                  <>
                    <button onClick={generateBill} disabled={newItems.length > 0} style={{
                      padding: 10, background: newItems.length > 0 ? '#ccc' : '#2196f3', color: '#fff',
                      border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: newItems.length > 0 ? 'default' : 'pointer'
                    }}>🧾 Generate Bill</button>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {[['cash', '💵 Bill & Cash', '#4caf50'], ['upi', '📱 Bill & UPI', '#2196f3'], ['card', '💳 Bill & Card', '#ff9800']].map(([m, label, color]) => (
                        <button key={m} onClick={() => billAndPay(m)} disabled={newItems.length > 0} style={{
                          flex: 1, padding: '8px 4px', background: newItems.length > 0 ? '#ccc' : color, color: '#fff',
                          border: 'none', borderRadius: 6, fontSize: 10, fontWeight: 700, cursor: newItems.length > 0 ? 'default' : 'pointer'
                        }}>{label}</button>
                      ))}
                    </div>
                  </>
                )}

                {newItems.length > 0 && <div style={{ fontSize: 10, color: '#f44', textAlign: 'center' }}>Send pending items to kitchen before billing</div>}
              </>
            )}
          </div>
        </div>
      )}

      </div>{/* end flex wrapper */}

      {/* Variant Popup */}
      {variantPopup && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setVariantPopup(null)}>
          <div style={{ background: '#fff', borderRadius: 14, padding: 24, width: 340, boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: variantPopup.is_veg ? '#4caf50' : '#f44336' }} />
              <h3 style={{ margin: 0, fontSize: 15, color: '#1a1a2e' }}>{variantPopup.name}</h3>
            </div>
            <p style={{ fontSize: 11, color: '#888', margin: '0 0 12px' }}>Select size</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {variantPopup.variants.map(v => (
                <button key={v.id} onClick={() => addToCart(variantPopup, v)} style={{
                  display: 'flex', justifyContent: 'space-between', padding: '12px 14px', background: '#f8f9fa', border: '2px solid #e8e8e8',
                  borderRadius: 8, cursor: 'pointer', fontSize: 13, transition: 'all 0.15s'
                }} onMouseEnter={e => { e.currentTarget.style.borderColor = '#4fc3f7'; e.currentTarget.style.background = '#e3f2fd'; }}
                   onMouseLeave={e => { e.currentTarget.style.borderColor = '#e8e8e8'; e.currentTarget.style.background = '#f8f9fa'; }}>
                  <span style={{ fontWeight: 600 }}>{v.name}</span>
                  <span style={{ fontWeight: 700, color: '#4fc3f7' }}>₹{variantPopup.price + v.price_delta}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
