import { useState, useEffect } from 'react';
import api from '../utils/api';
import toast from 'react-hot-toast';
import EscPos from '../utils/escpos';

export default function Settings() {
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [newEmail, setNewEmail] = useState('');
  const [sendingReport, setSendingReport] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [printers, setPrinters] = useState([]);

  useEffect(() => {
    api.get('/settings').then(r => { setSettings(r.data); setLoading(false); });
    if (window.electronAPI?.getPrinters) {
      window.electronAPI.getPrinters().then(list => setPrinters(list || [])).catch(() => {});
    }
  }, []);

  const testPrint = (which) => {
    const printer = which === 'kot' ? settings.kot_printer : settings.bill_printer;
    const mode = (which === 'kot' ? settings.kot_mode : settings.bill_mode) || 'graphic';
    const width = parseInt(settings.paper_width) || 80;
    if (!printer) return toast.error('Select a printer first');
    if (mode === 'escpos') {
      if (!window.electronAPI?.printRaw) return toast.error('Desktop app only');
      const p = new EscPos(width);
      p.align('center').bold(true).size(true).line(settings.outlet_name || 'Test').size(false).bold(false);
      p.line('Printer test OK').line(new Date().toLocaleString()).line(`-- ${which === 'kot' ? 'KOT' : 'BILL'} ${width}mm --`).cut();
      window.electronAPI.printRaw(p.toBase64(), { deviceName: printer });
      return toast.success('Test sent (ESC/POS)');
    }
    if (!window.electronAPI?.printReceipt) return toast.error('Desktop app only');
    const doc = `<html><head><meta charset="utf-8"><style>@page{size:${width}mm auto;margin:0}body{font-family:'Courier New',monospace;width:${width}mm;text-align:center;padding:4mm;color:#000}</style></head><body>`
      + `<h3>${settings.outlet_name || 'Test'}</h3><p>Printer test OK &#10003;</p><p>${new Date().toLocaleString()}</p><p>--- ${which === 'kot' ? 'KOT' : 'BILL'} &middot; ${width}mm ---</p></body></html>`;
    window.electronAPI.printReceipt(doc, { deviceName: printer });
    toast.success('Test page sent');
  };

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

  const syncNow = async () => {
    setSyncing(true);
    try {
      await save();
      const { data } = await api.post('/sync/now');
      toast.success(data.message || 'Sync complete');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const restoreFromCloud = async () => {
    if (!window.confirm('Pull your menu and outlet details from the cloud into this app? Items with the same ID will be updated. Use this on a fresh install.')) return;
    setRestoring(true);
    try {
      await save();
      const { data } = await api.post('/sync/restore');
      toast.success(data.message || 'Restored from cloud');
      api.get('/settings').then(r => setSettings(r.data));
    } catch (err) {
      toast.error(err.response?.data?.error || 'Restore failed');
    } finally {
      setRestoring(false);
    }
  };

  const handleLogoUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return toast.error('Please choose an image file');
    // Resize to a small thumbnail (logos on bills are tiny) so any size uploads,
    // stays small to store, and prints reliably.
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const MAX = 300;
        let { width, height } = img;
        if (width > MAX || height > MAX) {
          if (width >= height) { height = Math.round((height * MAX) / width); width = MAX; }
          else { width = Math.round((width * MAX) / height); height = MAX; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        update('logo_url', canvas.toDataURL('image/png'));
        toast.success('Logo loaded — click "Save All Settings" to confirm');
      };
      img.onerror = () => toast.error('Could not read that image — try a PNG or JPG');
      img.src = reader.result;
    };
    reader.onerror = () => toast.error('Could not read that file');
    reader.readAsDataURL(file);
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
          <div style={{ gridColumn: 'span 2' }}>
            <label style={labelStyle}>Logo (shown on printed bills)</label>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              {settings.logo_url ? (
                <img src={settings.logo_url} alt="logo" style={{ width: 48, height: 48, objectFit: 'contain', border: '1px solid #eee', borderRadius: 8, background: '#fff' }} />
              ) : null}
              <label style={{ padding: '10px 16px', background: '#1a1a2e', color: '#fff', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>
                Upload Image
                <input type="file" accept="image/*" onChange={handleLogoUpload} style={{ display: 'none' }} />
              </label>
              {settings.logo_url ? (
                <button onClick={() => update('logo_url', '')} style={{ padding: '10px 14px', background: '#eee', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>Remove</button>
              ) : null}
            </div>
            <input value={(settings.logo_url || '').startsWith('data:') ? '' : (settings.logo_url || '')}
              onChange={e => update('logo_url', e.target.value)}
              placeholder="…or paste an image URL — leave blank to use the default"
              style={{ ...fieldStyle, marginTop: 8 }} />
            <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>Upload a PNG/JPG (max 1 MB) or paste a URL. Shown at the top of every printed bill.</div>
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

      {/* Printers */}
      <div style={{ background: '#fff', borderRadius: 12, padding: 24, marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <h3 style={{ margin: '0 0 4px', fontSize: 16, color: '#1a1a2e' }}>🖨️ Printers</h3>
        <div style={{ fontSize: 12, color: '#888', marginBottom: 16 }}>Choose which printer prints bills and KOTs. Pick the <b>same</b> one for both if you only have a single printer.</div>
        {window.electronAPI ? (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <label style={labelStyle}>Bill / Receipt Printer</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <select value={settings.bill_printer || ''} onChange={e => update('bill_printer', e.target.value)} style={{ ...fieldStyle, flex: 1 }}>
                    <option value="">Ask each time (system dialog)</option>
                    {printers.map(p => <option key={p.name} value={p.name}>{p.displayName || p.name}</option>)}
                  </select>
                  <button onClick={() => testPrint('bill')} style={{ padding: '8px 12px', background: '#eee', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 12, whiteSpace: 'nowrap' }}>Test</button>
                </div>
              </div>
              <div>
                <label style={labelStyle}>Kitchen (KOT) Printer</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <select value={settings.kot_printer || ''} onChange={e => update('kot_printer', e.target.value)} style={{ ...fieldStyle, flex: 1 }}>
                    <option value="">Ask each time (system dialog)</option>
                    {printers.map(p => <option key={p.name} value={p.name}>{p.displayName || p.name}</option>)}
                  </select>
                  <button onClick={() => testPrint('kot')} style={{ padding: '8px 12px', background: '#eee', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 12, whiteSpace: 'nowrap' }}>Test</button>
                </div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
              <div>
                <label style={labelStyle}>Bill Print Mode</label>
                <select value={settings.bill_mode || 'graphic'} onChange={e => update('bill_mode', e.target.value)} style={fieldStyle}>
                  <option value="graphic">Graphic (logo, needs good driver)</option>
                  <option value="escpos">Thermal ESC/POS (works on any printer)</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>KOT Print Mode</label>
                <select value={settings.kot_mode || 'graphic'} onChange={e => update('kot_mode', e.target.value)} style={fieldStyle}>
                  <option value="graphic">Graphic</option>
                  <option value="escpos">Thermal ESC/POS (works on any printer)</option>
                </select>
              </div>
            </div>
            <div style={{ marginTop: 16 }}>
              <label style={labelStyle}>Paper Width</label>
              <div style={{ display: 'flex', gap: 20 }}>
                {['80', '58'].map(w => (
                  <label key={w} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 14 }}>
                    <input type="radio" name="paper_width" checked={(settings.paper_width || '80') === w} onChange={() => update('paper_width', w)} /> {w}mm
                  </label>
                ))}
              </div>
            </div>
            <div style={{ fontSize: 11, color: '#888', marginTop: 10 }}>Prints silently — no popup. <b>Graphic</b> prints the logo (needs a good driver). <b>Thermal ESC/POS</b> works on any thermal printer (no logo, plain text — most reliable for local/non-branded printers). If a printer prints garbled in Graphic mode, switch it to ESC/POS. Click <b>Test</b>, then <b>Save All Settings</b>.</div>
          </>
        ) : (
          <div style={{ fontSize: 13, color: '#888' }}>Printer selection works in the installed desktop app. In a browser, printing uses the system dialog.</div>
        )}
      </div>

      {/* Cloud Sync */}
      <div style={{ background: '#fff', borderRadius: 12, padding: 24, marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <h3 style={{ margin: '0 0 4px', fontSize: 16, color: '#1a1a2e' }}>☁️ Cloud Sync</h3>
        <div style={{ fontSize: 12, color: '#888', marginBottom: 16 }}>
          Connects this billing app to your online dashboard & website. Paste the <b>API Key</b> from your SaaS admin panel (shown when the restaurant was added).
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Tenant API Key</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input type={showKey ? 'text' : 'password'} value={settings.cloud_api_key || ''}
              onChange={e => update('cloud_api_key', e.target.value)} placeholder="paste your API key"
              style={{ ...fieldStyle, fontFamily: 'monospace', flex: 1 }} />
            <button onClick={() => setShowKey(s => !s)} style={{
              padding: '10px 14px', background: '#eee', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, whiteSpace: 'nowrap'
            }}>{showKey ? 'Hide' : 'Show'}</button>
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Cloud API URL</label>
          <input value={settings.cloud_api_url || ''} onChange={e => update('cloud_api_url', e.target.value)}
            placeholder="https://saas-7i5z.onrender.com" style={{ ...fieldStyle, fontFamily: 'monospace' }} />
          <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>Leave default unless you self-host the SaaS API.</div>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button onClick={syncNow} disabled={syncing} style={{
            padding: '10px 20px', background: '#2196f3', color: '#fff', border: 'none',
            borderRadius: 8, cursor: syncing ? 'default' : 'pointer', fontSize: 13, fontWeight: 600
          }}>
            {syncing ? 'Syncing…' : '☁️ Sync Now'}
          </button>
          <button onClick={restoreFromCloud} disabled={restoring} style={{
            padding: '10px 20px', background: '#fff', color: '#2196f3', border: '1px solid #2196f3',
            borderRadius: 8, cursor: restoring ? 'default' : 'pointer', fontSize: 13, fontWeight: 600
          }}>
            {restoring ? 'Restoring…' : '⬇️ Restore Menu from Cloud'}
          </button>
        </div>
        <div style={{ fontSize: 11, color: '#888', marginTop: 8 }}>Sync (up) runs automatically every 5 minutes. Restore (down) pulls your menu from the cloud — use it on a fresh install.</div>
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
