import { useState, useEffect } from 'react';
import api from '../utils/api';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts';

const COLORS = ['#4fc3f7', '#81c784', '#ff8a65', '#ba68c8'];

const card = (label, value, color) => (
  <div key={label} style={{
    background: '#fff', borderRadius: 10, padding: '20px 24px', flex: '1 1 200px',
    borderLeft: `4px solid ${color}`, boxShadow: '0 2px 8px rgba(0,0,0,0.06)'
  }}>
    <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>{label}</div>
    <div style={{ fontSize: 24, fontWeight: 700, color: '#1a1a2e' }}>{value}</div>
  </div>
);

export default function Dashboard() {
  const [summary, setSummary] = useState(null);
  const [topItems, setTopItems] = useState([]);
  const [hourly, setHourly] = useState([]);
  const [trend, setTrend] = useState([]);

  useEffect(() => {
    Promise.all([
      api.get('/dashboard/summary'),
      api.get('/dashboard/top-items'),
      api.get('/dashboard/hourly'),
      api.get('/dashboard/daily-trend?days=7'),
    ]).then(([s, t, h, d]) => {
      setSummary(s.data);
      setTopItems(t.data);
      setHourly(h.data);
      setTrend(d.data);
    });
  }, []);

  if (!summary) return <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>Loading dashboard...</div>;

  const platformData = [
    { name: 'Dine-in', value: summary.dine_in_revenue, count: summary.dine_in_count },
    { name: 'Takeaway', value: summary.takeaway_revenue, count: summary.takeaway_count },
    { name: 'Zomato', value: summary.zomato_revenue, count: summary.zomato_count },
    { name: 'Swiggy', value: summary.swiggy_revenue, count: summary.swiggy_count },
  ].filter(d => d.value > 0);

  return (
    <div>
      <h2 style={{ margin: '0 0 20px', color: '#1a1a2e' }}>Today's Dashboard</h2>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>
        {card('Total Revenue', `₹${summary.total_revenue.toLocaleString()}`, '#4fc3f7')}
        {card('Total Orders', summary.total_orders, '#81c784')}
        {card('GST Collected', `₹${summary.total_tax.toLocaleString()}`, '#ff8a65')}
        {card('Cancelled', summary.cancelled_count, '#f44336')}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
        <div style={{ background: '#fff', borderRadius: 10, padding: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <h3 style={{ margin: '0 0 16px', fontSize: 15, color: '#1a1a2e' }}>Revenue by Platform</h3>
          {platformData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={platformData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                  {platformData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={v => `₹${v.toLocaleString()}`} />
              </PieChart>
            </ResponsiveContainer>
          ) : <p style={{ color: '#999', textAlign: 'center', padding: 40 }}>No revenue data yet</p>}
        </div>

        <div style={{ background: '#fff', borderRadius: 10, padding: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <h3 style={{ margin: '0 0 16px', fontSize: 15, color: '#1a1a2e' }}>Top Selling Items</h3>
          {topItems.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={topItems.slice(0, 8)} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="total_qty" fill="#4fc3f7" name="Qty Sold" />
              </BarChart>
            </ResponsiveContainer>
          ) : <p style={{ color: '#999', textAlign: 'center', padding: 40 }}>No orders yet</p>}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div style={{ background: '#fff', borderRadius: 10, padding: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <h3 style={{ margin: '0 0 16px', fontSize: 15, color: '#1a1a2e' }}>Hourly Orders</h3>
          {hourly.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={hourly}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="hour" tickFormatter={h => `${h}:00`} />
                <YAxis />
                <Tooltip />
                <Bar dataKey="orders" fill="#81c784" name="Orders" />
              </BarChart>
            </ResponsiveContainer>
          ) : <p style={{ color: '#999', textAlign: 'center', padding: 40 }}>No data yet</p>}
        </div>

        <div style={{ background: '#fff', borderRadius: 10, padding: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <h3 style={{ margin: '0 0 16px', fontSize: 15, color: '#1a1a2e' }}>7-Day Revenue Trend</h3>
          {trend.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tickFormatter={d => d.slice(5)} />
                <YAxis />
                <Tooltip formatter={v => `₹${v?.toLocaleString()}`} />
                <Line type="monotone" dataKey="revenue" stroke="#4fc3f7" strokeWidth={2} name="Total" />
                <Line type="monotone" dataKey="dine_in" stroke="#81c784" name="Dine-in" />
                <Line type="monotone" dataKey="zomato" stroke="#ff8a65" name="Zomato" />
                <Line type="monotone" dataKey="swiggy" stroke="#ba68c8" name="Swiggy" />
              </LineChart>
            </ResponsiveContainer>
          ) : <p style={{ color: '#999', textAlign: 'center', padding: 40 }}>No data yet</p>}
        </div>
      </div>
    </div>
  );
}
