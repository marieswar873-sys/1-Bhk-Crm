import { useState, useEffect } from 'react';

const API = 'https://saas-7i5z.onrender.com';

// Gate the app. Two ways to activate:
//  • Cloud subscription  -> enter API key; app unlocks while the tenant status is 'active'.
//    It NEVER auto-locks on expiry/offline — it only locks if you manually suspend the tenant.
//  • One-time            -> machine-locked license code.
export default function LicenseGate({ children }) {
  const [status, setStatus] = useState('checking'); // checking | ok | locked | suspended
  const [machineId, setMachineId] = useState('');
  const [tab, setTab] = useState('cloud');
  const [apiKey, setApiKey] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => { check(); /* eslint-disable-next-line */ }, []);

  async function validateCloud(key) {
    try {
      const res = await fetch(`${API}/api/sync/validate`, { headers: { 'X-API-Key': key } });
      if (res.status === 401) return 'invalid';
      const data = await res.json();
      return data.active ? 'active' : 'suspended';
    } catch { return 'offline'; }
  }

  async function check() {
    if (!window.electronAPI?.getLicense) { setStatus('ok'); return; } // browser/dev: no gate
    const info = await window.electronAPI.getLicense().catch(() => null);
    if (!info) { setStatus('ok'); return; }
    setMachineId(info.machineId || '');
    if (info.licensed) { setStatus('ok'); return; } // one-time license present
    if (info.cloud && info.cloud.key) {
      const r = await validateCloud(info.cloud.key);
      if (r === 'active') { window.electronAPI.setCloudLicense({ key: info.cloud.key, status: 'active', ts: Date.now() }); setStatus('ok'); return; }
      if (r === 'suspended') { setStatus('suspended'); return; }                 // you manually suspended -> lock
      if (r === 'offline' && info.cloud.status === 'active') { setStatus('ok'); return; } // offline grace: never auto-lock
      setStatus('locked'); return;
    }
    setStatus('locked');
  }

  const activateCloud = async () => {
    if (!apiKey.trim()) return;
    setBusy(true); setErr('');
    const r = await validateCloud(apiKey.trim());
    setBusy(false);
    if (r === 'active') { window.electronAPI.setCloudLicense({ key: apiKey.trim(), status: 'active', ts: Date.now() }); setStatus('ok'); }
    else if (r === 'suspended') setErr('This subscription is suspended. Please contact your provider.');
    else if (r === 'invalid') setErr('Invalid API key — check it and try again.');
    else setErr('Could not reach the server. Check your internet and try again.');
  };

  const activateOneTime = async () => {
    if (!code.trim()) return;
    setBusy(true); setErr('');
    try { const r = await window.electronAPI.activateLicense(code.trim()); if (r.ok) setStatus('ok'); else setErr('Invalid license code for this device.'); }
    catch { setErr('Activation failed.'); }
    setBusy(false);
  };

  const copyId = () => { navigator.clipboard.writeText(machineId); setCopied(true); setTimeout(() => setCopied(false), 1500); };

  const center = { height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f172a', padding: 20 };
  const card = { background: '#fff', borderRadius: 16, padding: 32, width: 460, maxWidth: '100%', boxShadow: '0 10px 40px rgba(0,0,0,0.3)' };
  const inp = { padding: '12px 14px', border: '1px solid #ddd', borderRadius: 8, fontSize: 15, width: '100%', boxSizing: 'border-box' };

  if (status === 'checking') return <div style={{ ...center, color: '#94a3b8' }}>Loading…</div>;
  if (status === 'ok') return children;

  if (status === 'suspended') return (
    <div style={center}><div style={{ ...card, textAlign: 'center' }}>
      <div style={{ fontSize: 40 }}>🔒</div>
      <h2 style={{ color: '#1a1a2e' }}>Access Paused</h2>
      <p style={{ color: '#666' }}>Your subscription is currently on hold. Please contact your provider to reactivate.</p>
      <button onClick={() => { setStatus('locked'); setTab('cloud'); }} style={{ ...inp, width: 'auto', background: '#eee', border: 'none', cursor: 'pointer', marginTop: 8 }}>Re-enter key</button>
    </div></div>
  );

  // locked -> activation screen with two tabs
  const tabBtn = (k, label) => (
    <button onClick={() => { setTab(k); setErr(''); }} style={{
      flex: 1, padding: 10, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 14,
      background: tab === k ? '#2563eb' : '#eef2f7', color: tab === k ? '#fff' : '#555',
      borderRadius: 8,
    }}>{label}</button>
  );

  return (
    <div style={center}>
      <div style={card}>
        <h2 style={{ margin: '0 0 4px', color: '#1a1a2e' }}>Activate 1BHK CRM</h2>
        <p style={{ margin: '0 0 18px', color: '#888', fontSize: 14 }}>This app needs to be activated to run on this computer.</p>

        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {tabBtn('cloud', '☁️ Cloud Subscription')}
          {tabBtn('onetime', '💻 One-time License')}
        </div>

        {tab === 'cloud' ? (
          <>
            <label style={{ fontSize: 13, fontWeight: 600, color: '#555' }}>Enter your API Key</label>
            <input value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="Your subscription API key" style={{ ...inp, fontFamily: 'monospace', margin: '6px 0 4px' }} />
            <p style={{ fontSize: 12, color: '#aaa', marginBottom: 12 }}>The key your provider gave you. Needs internet the first time.</p>
            {err && <div style={{ color: '#e11', fontSize: 13, marginBottom: 10 }}>{err}</div>}
            <button onClick={activateCloud} disabled={busy || !apiKey.trim()} style={{ ...inp, background: busy || !apiKey.trim() ? '#9bbcf0' : '#2563eb', color: '#fff', border: 'none', fontWeight: 700, cursor: 'pointer' }}>{busy ? 'Checking…' : 'Activate'}</button>
          </>
        ) : (
          <>
            <label style={{ fontSize: 13, fontWeight: 600, color: '#555' }}>1. Your Machine ID (send to your provider)</label>
            <div style={{ display: 'flex', gap: 8, margin: '6px 0 16px' }}>
              <input readOnly value={machineId} style={{ ...inp, fontFamily: 'monospace', fontWeight: 700, letterSpacing: 1, background: '#f8f9fa' }} />
              <button onClick={copyId} style={{ padding: '0 16px', background: '#eee', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>{copied ? '✓' : 'Copy'}</button>
            </div>
            <label style={{ fontSize: 13, fontWeight: 600, color: '#555' }}>2. Paste the License Code you received</label>
            <textarea value={code} onChange={e => setCode(e.target.value)} placeholder="Paste your license code here…" style={{ ...inp, fontFamily: 'monospace', marginTop: 6, height: 70, resize: 'none' }} />
            {err && <div style={{ color: '#e11', fontSize: 13, marginTop: 8 }}>{err}</div>}
            <button onClick={activateOneTime} disabled={busy || !code.trim()} style={{ ...inp, marginTop: 14, background: busy || !code.trim() ? '#9bbcf0' : '#2563eb', color: '#fff', border: 'none', fontWeight: 700, cursor: 'pointer' }}>{busy ? 'Activating…' : 'Activate'}</button>
          </>
        )}
      </div>
    </div>
  );
}
