import { useState, useEffect } from 'react';
import api from '../utils/api';
import toast from 'react-hot-toast';

export default function Settings() {
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [newEmail, setNewEmail] = useState('');
  const [sendingReport, setSendingReport] = useState(false);

  useEffect(() => {
    api.get('/settings').then(r => { setSettings(r.data); setLoading(false); });
  }, []);

  const save = async () => {
    try {
      await api.put('/settings', settings);
      toast.success('Settings saved');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed');
    }
  };

  const update = (key, value) => setSettings(s => ({ ...s, [key]: value }));

  const partnerEmails = (() => {
    try { return JSON.parse(settings.partner_emails || '[]'); } catch { return []; }
  })();

  const addPartnerEmail = () => {
    const email = newEmail.trim().toLowerCase();
    if (!email || !email.includes('@')) return toast.error('Enter a valid email');
    if (partnerEmails.includes(email)) return toast.error('Email already added');
    const updated = [...partnerEmails, email];
    update('partner_emails', JSON.stringify(updated));
    setNewEmail('');
    toast.success('Email added — click Save to confirm');
  };

  const removePartnerEmail = (email) => {
    const updated = partnerEmails.filter(e => e !== email);
    update('partner_emails', JSON.stringify(updated));
    toast.success('Email removed — click Save to confirm');
  };

  const sendTestReport = async () => {
    setSendingReport(true);
    try {
      await save();
      const { data } = await api.post('/reports/send-daily');
      toast.success(data.message || 'Report sent!');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to send. Check SMTP_PASS in .env');
    } finally {
      setSendingReport(false);
    }
  };

  if (loading) return <div style={{ padding: 40, color: '#888' }}>Loading...</div>;

  const fieldStyle = { padding: '10px 14px', border: '1px solid #ddd', borderRadius: 8, fontSize: 14, width: '100%', boxSizing: 'border-box' };
  const labelStyle = { fontSize: 13, fontWeight: 600, color: '#555', display: 'block', marginBottom: 6 };

  const toggleBtn = (key, label, description) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, padding: '12px 16px', background: '#f8f9fa', borderRadius: 8 }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#1a1a2e' }}>{label}</div>
        <div style={{ fontSize: 12, color: '#888' }}>{description}</div>
      </div>
      <button onClick={() => update(key, settings[key] === 'true' ? 'false' : 'true')} style={{
        width: 52, height: 28, borderRadius: 14, border: 'none', cursor: 'pointer', position: 'relative',
        background: settings[key] === 'true' ? '#4caf50' : '#ccc', transition: 'background 0.2s'
      }}>
        <div style={{
          width: 22, height: 22, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3,
          left: settings[key] === 'true' ? 27 : 3, transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
        }} />
      </button>
    </div>
  );

  return (
    <div style={{ maxWidth: 640 }}>
      <h2 style={{ margin: '0 0 20px', color: '#1a1a2e' }}>Settings</h2>

      {/* GST Settings */}
      <div style={{ background: '#fff', borderRadius: 12, padding: 24, marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <h3 style={{ margin: '0 0 16px', fontSize: 16, color: '#1a1a2e' }}>GST Settings</h3>
        {toggleBtn('gst_enabled', 'GST Enabled', 'Turn on when you have GST registration')}
        {settings.gst_enabled === 'true' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <label style={labelStyle}>GST Percentage</label>
              <input type="number" value={settings.gst_percent} onChange={e => update('gst_percent', e.target.value)} style={fieldStyle} />
            </div>
            <div>
              <label style={labelStyle}>GSTIN Number</label>
              <input value={settings.outlet_gstin} onChange={e => update('outlet_gstin', e.target.value)} placeholder="e.g. 29AABCU9603R1ZM" style={fieldStyle} />
            </div>
          </div>
        )}
      </div>

      {/* Outlet Details */}
      <div style={{ background: '#fff', borderRadius: 12, padding: 24, marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <h3 style={{ margin: '0 0 16px', fontSize: 16, color: '#1a1a2e' }}>Outlet Details</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <label style={labelStyle}>Outlet Name</label>
            <input value={settings.outlet_name} onChange={e => update('outlet_name', e.target.value)} style={fieldStyle} />
          </div>
          <div>
            <label style={labelStyle}>Phone</label>
            <input value={settings.outlet_phone} onChange={e => update('outlet_phone', e.target.value)} style={fieldStyle} />
          </div>
          <div style={{ gridColumn: 'span 2' }}>
            <label style={labelStyle}>Address</label>
            <input value={settings.outlet_address} onChange={e => update('outlet_address', e.target.value)} style={fieldStyle} />
          </div>
          <div>
            <label style={labelStyle}>FSSAI Number</label>
            <input value={settings.outlet_fssai} onChange={e => update('outlet_fssai', e.target.value)} style={fieldStyle} />
          </div>
          <div>
            <label style={labelStyle}>Default Packing Charge per item (₹)</label>
            <input type="number" value={settings.packing_charges} onChange={e => update('packing_charges', e.target.value)} style={fieldStyle} />
          </div>
        </div>
      </div>

      {/* Packing Charges */}
      <div style={{ background: '#fff', borderRadius: 12, padding: 24, marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <h3 style={{ margin: '0 0 16px', fontSize: 16, color: '#1a1a2e' }}>Packing Charges</h3>
        {toggleBtn('packing_enabled', 'Packing Charges Enabled', 'Add per-item packing charges for takeaway orders. Each menu item has its own charge (set in Menu).')}
        <div style={{ fontSize: 12, color: '#888', padding: '0 4px' }}>
          Packing charges only apply to <b>Takeaway</b> orders, not Dine-in. Set individual item packing charges in Menu → Edit item.
        </div>
      </div>

      {/* Email & Daily Report */}
      <div style={{ background: '#fff', borderRadius: 12, padding: 24, marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <h3 style={{ margin: '0 0 16px', fontSize: 16, color: '#1a1a2e' }}>Email & Daily Report</h3>

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Company Email (sender)</label>
          <input value={settings.company_email} onChange={e => update('company_email', e.target.value)}
            placeholder="1bhkkitchen@gmail.com" style={fieldStyle} />
          <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>This email sends the daily report. Set SMTP_PASS in .env for Gmail App Password.</div>
        </div>

        {toggleBtn('daily_report_enabled', 'Daily Sales Report', 'Auto-send yesterday\'s sales report at configured time')}

        {settings.daily_report_enabled === 'true' && (
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Report Send Time</label>
            <select value={settings.daily_report_time || '06:00'} onChange={e => update('daily_report_time', e.target.value)} style={fieldStyle}>
              {['05:00','06:00','07:00','08:00','09:00','10:00','21:00','22:00','23:00'].map(t => (
                <option key={t} value={t}>{t === '05:00' ? '5 AM' : t === '06:00' ? '6 AM (Recommended)' : t === '07:00' ? '7 AM' : t === '08:00' ? '8 AM' : t === '09:00' ? '9 AM' : t === '10:00' ? '10 AM' : t === '21:00' ? '9 PM' : t === '22:00' ? '10 PM' : '11 PM'}</option>
              ))}
            </select>
          </div>
        )}

        {/* Partner Emails */}
        <div style={{ marginTop: 8 }}>
          <label style={labelStyle}>Partner Emails (report recipients)</label>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <input value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="partner@example.com"
              onKeyDown={e => e.key === 'Enter' && addPartnerEmail()}
              style={{ ...fieldStyle, flex: 1 }} />
            <button onClick={addPartnerEmail} style={{
              padding: '10px 16px', background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: 8,
              cursor: 'pointer', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap'
            }}>+ Add</button>
          </div>

          {partnerEmails.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {partnerEmails.map(email => (
                <div key={email} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '8px 12px', background: '#f8f9fa', borderRadius: 8
                }}>
                  <span style={{ fontSize: 13, color: '#1a1a2e' }}>📧 {email}</span>
                  <button onClick={() => removePartnerEmail(email)} style={{
                    background: 'none', border: 'none', color: '#f44', cursor: 'pointer', fontSize: 12, fontWeight: 600
                  }}>Remove</button>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: '#999', padding: 8 }}>No partner emails added. Company email will still receive the report.</div>
          )}
        </div>

        {/* Test Send */}
        <button onClick={sendTestReport} disabled={sendingReport} style={{
          marginTop: 16, padding: '10px 20px', background: '#ff9800', color: '#fff', border: 'none',
          borderRadius: 8, cursor: sendingReport ? 'default' : 'pointer', fontSize: 13, fontWeight: 600
        }}>
          {sendingReport ? 'Sending...' : '📧 Send Test Report Now'}
        </button>
      </div>

      {/* Save All */}
      <button onClick={save} style={{
        padding: '14px 32px', background: '#4caf50', color: '#fff', border: 'none',
        borderRadius: 8, fontSize: 15, fontWeight: 700, cursor: 'pointer', width: '100%'
      }}>
        Save All Settings
      </button>
    </div>
  );
}
