import { useState } from 'react';
import api from '../utils/api';
import toast from 'react-hot-toast';

function parseCSV(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_'));
  return lines.slice(1).map(line => {
    const vals = line.split(',').map(v => v.trim());
    const obj = {};
    headers.forEach((h, i) => obj[h] = vals[i] || '');
    return obj;
  });
}

function mapZomatoRow(row) {
  return {
    order_id: row.order_id || row.res_id || row.id || '',
    customer_name: row.customer_name || row.delivery_name || 'Zomato Customer',
    subtotal: row.subtotal || row.order_subtotal || row.amount || '0',
    tax: row.tax || row.gst || '0',
    total: row.total || row.order_total || row.net_total || '0',
    commission: row.commission || row.zomato_commission || '0',
    items_text: row.items || row.item_names || '',
  };
}

function mapSwiggyRow(row) {
  return {
    order_id: row.order_id || row.order_no || row.id || '',
    customer_name: row.customer_name || 'Swiggy Customer',
    subtotal: row.subtotal || row.order_subtotal || row.amount || '0',
    tax: row.tax || row.gst || '0',
    total: row.total || row.order_total || row.net_total || '0',
    commission: row.commission || row.swiggy_commission || '0',
    items_text: row.items || row.item_names || '',
  };
}

export default function Import() {
  const [platform, setPlatform] = useState('zomato');
  const [csvText, setCsvText] = useState('');
  const [preview, setPreview] = useState([]);
  const [result, setResult] = useState(null);

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target.result;
      setCsvText(text);
      const rows = parseCSV(text);
      const mapped = rows.map(platform === 'zomato' ? mapZomatoRow : mapSwiggyRow);
      setPreview(mapped);
    };
    reader.readAsText(file);
  };

  const doImport = async () => {
    if (!preview.length) return toast.error('No data to import');
    try {
      const { data } = await api.post(`/import/${platform}`, { orders: preview });
      setResult(data);
      toast.success(`Imported ${data.records_imported} orders`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Import failed');
    }
  };

  const btnStyle = (active) => ({
    padding: '10px 20px', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14, fontWeight: 600,
    background: active ? '#1a1a2e' : '#e8e8e8', color: active ? '#fff' : '#555',
  });

  return (
    <div>
      <h2 style={{ margin: '0 0 20px', color: '#1a1a2e' }}>Import Orders from CSV</h2>

      <div style={{ background: '#fff', borderRadius: 10, padding: 24, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          <button onClick={() => { setPlatform('zomato'); setPreview([]); setResult(null); }} style={btnStyle(platform === 'zomato')}>
            🟥 Zomato
          </button>
          <button onClick={() => { setPlatform('swiggy'); setPreview([]); setResult(null); }} style={btnStyle(platform === 'swiggy')}>
            🟧 Swiggy
          </button>
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 8 }}>
            Upload {platform.charAt(0).toUpperCase() + platform.slice(1)} CSV file
          </label>
          <input type="file" accept=".csv" onChange={handleFile}
            style={{ fontSize: 13 }} />
        </div>

        <div style={{ marginBottom: 16, fontSize: 12, color: '#888' }}>
          Expected columns: order_id, customer_name, subtotal, tax, total, commission, items
        </div>

        {preview.length > 0 && (
          <>
            <div style={{ marginBottom: 12, fontSize: 14, fontWeight: 600 }}>
              Preview: {preview.length} orders found
            </div>
            <div style={{ maxHeight: 300, overflow: 'auto', marginBottom: 16 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#f8f9fa' }}>
                    {['Order ID', 'Customer', 'Subtotal', 'Tax', 'Total', 'Commission'].map(h => (
                      <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.slice(0, 20).map((r, i) => (
                    <tr key={i} style={{ borderTop: '1px solid #f0f0f0' }}>
                      <td style={{ padding: '6px 12px' }}>{r.order_id}</td>
                      <td style={{ padding: '6px 12px' }}>{r.customer_name}</td>
                      <td style={{ padding: '6px 12px' }}>₹{r.subtotal}</td>
                      <td style={{ padding: '6px 12px' }}>₹{r.tax}</td>
                      <td style={{ padding: '6px 12px', fontWeight: 600 }}>₹{r.total}</td>
                      <td style={{ padding: '6px 12px' }}>₹{r.commission}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.length > 20 && <p style={{ fontSize: 12, color: '#888', padding: 8 }}>...and {preview.length - 20} more</p>}
            </div>

            <button onClick={doImport} style={{
              padding: '12px 24px', background: '#4caf50', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14, fontWeight: 600
            }}>
              Import {preview.length} Orders
            </button>
          </>
        )}

        {result && (
          <div style={{ marginTop: 16, padding: 16, background: '#e8f5e9', borderRadius: 8, fontSize: 14, color: '#2e7d32' }}>
            Successfully imported {result.records_imported} {platform} orders.
          </div>
        )}
      </div>
    </div>
  );
}
