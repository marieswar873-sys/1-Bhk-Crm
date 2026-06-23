import { useState, useEffect } from 'react';
import api from '../utils/api';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

const DATE_PRESETS = [
  { label: 'Today', days: 0 },
  { label: '7 days', days: 7 },
  { label: '14 days', days: 14 },
  { label: '28 days', days: 28 },
  { label: '90 days', days: 90 },
  { label: '365 days', days: 365 },
];

function getDateRange(days) {
  const to = new Date().toISOString().slice(0, 10);
  if (days === 0) return { from: to, to };
  const from = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  return { from, to };
}

function pctChange(current, previous) {
  if (!previous) return current > 0 ? '+100%' : '0%';
  const pct = ((current - previous) / previous * 100).toFixed(1);
  return pct >= 0 ? `+${pct}%` : `${pct}%`;
}

export default function Reports() {
  const [preset, setPreset] = useState('Today');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [showCustom, setShowCustom] = useState(false);
  const [summary, setSummary] = useState(null);
  const [trend, setTrend] = useState([]);
  const [paymentSplit, setPaymentSplit] = useState([]);
  const [comparison, setComparison] = useState(null);
  const [topItems, setTopItems] = useState([]);

  const load = (from, to) => {
    api.get(`/dashboard/summary?from=${from}&to=${to}`).then(r => setSummary(r.data));
    api.get(`/dashboard/top-items?from=${from}&to=${to}`).then(r => setTopItems(r.data));
    api.get(`/dashboard/payment-split?date=${from}`).then(r => setPaymentSplit(r.data));
    api.get(`/dashboard/daily-trend?days=30`).then(r => setTrend(r.data));
    api.get('/dashboard/comparison').then(r => setComparison(r.data));
  };

  useEffect(() => {
    const { from, to } = getDateRange(0);
    load(from, to);
  }, []);

  const selectPreset = (p) => {
    setPreset(p.label);
    setShowCustom(false);
    const { from, to } = getDateRange(p.days);
    load(from, to);
  };

  const applyCustom = () => {
    if (customFrom && customTo) {
      setPreset('Custom');
      load(customFrom, customTo);
    }
  };

  const compCard = (label, todayVal, yesterdayVal, prefix = '₹') => {
    const change = pctChange(todayVal, yesterdayVal);
    const isUp = change.startsWith('+') && change !== '+0.0%';
    return (
      <div style={{ background: '#fff', borderRadius: 10, padding: '16px 20px', flex: '1 1 200px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>{label}</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: '#1a1a2e' }}>{prefix}{todayVal?.toLocaleString() ?? 0}</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
          <span style={{ fontSize: 11, color: '#999' }}>Yesterday: {prefix}{yesterdayVal?.toLocaleString() ?? 0}</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: isUp ? '#4caf50' : todayVal < yesterdayVal ? '#f44336' : '#888' }}>{change}</span>
        </div>
      </div>
    );
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, color: '#1a1a2e' }}>Reports</h2>
        <div style={{ flex: 1 }} />

        {/* Date Presets */}
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {DATE_PRESETS.map(p => (
            <button key={p.label} onClick={() => selectPreset(p)} style={{
              padding: '6px 14px', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600,
              background: preset === p.label ? '#1a1a2e' : '#e8e8e8', color: preset === p.label ? '#fff' : '#555'
            }}>{p.label}</button>
          ))}
          <button onClick={() => setShowCustom(!showCustom)} style={{
            padding: '6px 14px', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600,
            background: preset === 'Custom' ? '#1a1a2e' : '#e8e8e8', color: preset === 'Custom' ? '#fff' : '#555'
          }}>Custom</button>
        </div>
      </div>

      {showCustom && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
          <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
            style={{ padding: '6px 10px', border: '1px solid #ddd', borderRadius: 6, fontSize: 13 }} />
          <span style={{ color: '#888' }}>to</span>
          <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
            style={{ padding: '6px 10px', border: '1px solid #ddd', borderRadius: 6, fontSize: 13 }} />
          <button onClick={applyCustom} style={{
            padding: '6px 14px', background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600
          }}>Show Results</button>
        </div>
      )}

      {/* Today vs Yesterday Comparison */}
      {comparison && (
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 20 }}>
          {compCard('Revenue', comparison.today.revenue, comparison.yesterday.revenue)}
          {compCard('Orders', comparison.today.total_orders, comparison.yesterday.total_orders, '')}
          {compCard('Avg Order', Math.round(comparison.today.avg_order), Math.round(comparison.yesterday.avg_order))}
          {compCard('GST', comparison.today.tax, comparison.yesterday.tax)}
        </div>
      )}

      {summary && (
        <>
          {/* Day-End Summary */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
            <div style={{ background: '#fff', borderRadius: 10, padding: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
              <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>Sales Summary</h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <tbody>
                  {[
                    ['Total Orders', summary.total_orders],
                    ['Total Revenue', `₹${summary.total_revenue.toLocaleString()}`],
                    ['GST Collected', `₹${summary.total_tax.toLocaleString()}`],
                    ['CGST', `₹${(summary.total_tax / 2).toFixed(2)}`],
                    ['SGST', `₹${(summary.total_tax / 2).toFixed(2)}`],
                    ['Dine-in', `₹${summary.dine_in_revenue.toLocaleString()} (${summary.dine_in_count})`],
                    ['Takeaway', `₹${summary.takeaway_revenue.toLocaleString()} (${summary.takeaway_count})`],
                    ['Zomato', `₹${summary.zomato_revenue.toLocaleString()} (${summary.zomato_count})`],
                    ['Swiggy', `₹${summary.swiggy_revenue.toLocaleString()} (${summary.swiggy_count})`],
                    ['Cancelled', summary.cancelled_count],
                  ].map(([label, value]) => (
                    <tr key={label} style={{ borderBottom: '1px solid #f0f0f0' }}>
                      <td style={{ padding: '8px 0', color: '#666' }}>{label}</td>
                      <td style={{ padding: '8px 0', fontWeight: 600, textAlign: 'right' }}>{value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ background: '#fff', borderRadius: 10, padding: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
              <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>Top Selling Items</h3>
              {topItems.length > 0 ? topItems.slice(0, 10).map((item, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f5f5f5', fontSize: 13 }}>
                  <span>{item.is_veg ? '🟢' : '🔴'} {item.name}</span>
                  <span style={{ fontWeight: 600 }}>×{item.total_qty} — ₹{Math.round(item.total_revenue)}</span>
                </div>
              )) : <p style={{ color: '#999', textAlign: 'center', padding: 30 }}>No data</p>}
            </div>
          </div>

          {/* Charts */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div style={{ background: '#fff', borderRadius: 10, padding: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
              <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>Platform Revenue (30 days)</h3>
              {trend.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={trend}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tickFormatter={d => d.slice(5)} />
                    <YAxis />
                    <Tooltip formatter={v => `₹${v?.toLocaleString()}`} />
                    <Legend />
                    <Bar dataKey="dine_in" fill="#4fc3f7" name="Dine-in" stackId="a" />
                    <Bar dataKey="takeaway" fill="#81c784" name="Takeaway" stackId="a" />
                    <Bar dataKey="zomato" fill="#ff8a65" name="Zomato" stackId="a" />
                    <Bar dataKey="swiggy" fill="#ba68c8" name="Swiggy" stackId="a" />
                  </BarChart>
                </ResponsiveContainer>
              ) : <p style={{ color: '#999', textAlign: 'center', padding: 40 }}>No data</p>}
            </div>

            <div style={{ background: '#fff', borderRadius: 10, padding: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
              <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>Payment Methods</h3>
              {paymentSplit.length > 0 ? paymentSplit.map(p => (
                <div key={p.payment_method} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid #f0f0f0' }}>
                  <span style={{ fontSize: 14, textTransform: 'capitalize' }}>
                    {p.payment_method === 'cash' ? '💵' : p.payment_method === 'upi' ? '📱' : '💳'} {p.payment_method}
                  </span>
                  <span style={{ fontWeight: 600 }}>₹{p.amount.toLocaleString()} ({p.count})</span>
                </div>
              )) : <p style={{ color: '#999', textAlign: 'center', padding: 40 }}>No payments yet</p>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
