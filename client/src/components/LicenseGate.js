import { useState, useEffect } from 'react';

// Blocks the app until a valid, machine-matched license code is entered.
// In a plain browser (no Electron) it passes through (dev mode).
export default function LicenseGate({ children }) {
  const [status, setStatus] = useState('checking'); // checking | locked | ok
  const [machineId, setMachineId] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!window.electronAPI?.getLicense) { setStatus('ok'); return; }
    window.electronAPI.getLicense()
      .then(r => { setMachineId(r.machineId || ''); setStatus(r.licensed ? 'ok' : 'locked'); })
      .catch(() => setStatus('ok'));
  }, []);

  const activate = async () => {
    if (!code.trim()) return;
    setBusy(true); setErr('');
    try {
      const r = await window.electronAPI.activateLicense(code.trim());
      if (r.ok) { setStatus('ok'); } else { setErr('Invalid license code for this device. Please check and try again.'); }
    } catch { setErr('Activation failed.'); }
    setBusy(false);
  };

  const copyId = () => { navigator.clipboard.writeText(machineId); setCopied(true); setTimeout(() => setCopied(false), 1500); };

  if (status === 'checking') return <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888' }}>Loading…</div>;
  if (status === 'ok') return children;

  const inp = { padding: '12px 14px', border: '1px solid #ddd', borderRadius: 8, fontSize: 15, width: '100%', boxSizing: 'border-box' };
  return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f172a', padding: 20 }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: 36, width: 460, maxWidth: '100%', boxShadow: '0 10px 40px rgba(0,0,0,0.3)' }}>
        <h2 style={{ margin: '0 0 4px', color: '#1a1a2e' }}>Activate 1BHK CRM</h2>
        <p style={{ margin: '0 0 24px', color: '#888', fontSize: 14 }}>This copy needs a one-time license to run on this computer.</p>

        <label style={{ fontSize: 13, fontWeight: 600, color: '#555' }}>1. Your Machine ID (send this to your provider)</label>
        <div style={{ display: 'flex', gap: 8, margin: '6px 0 20px' }}>
          <input readOnly value={machineId} style={{ ...inp, fontFamily: 'monospace', fontWeight: 700, letterSpacing: 1, background: '#f8f9fa' }} />
          <button onClick={copyId} style={{ padding: '0 16px', background: '#eee', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>{copied ? '✓' : 'Copy'}</button>
        </div>

        <label style={{ fontSize: 13, fontWeight: 600, color: '#555' }}>2. Paste the License Code you received</label>
        <textarea value={code} onChange={e => setCode(e.target.value)} placeholder="Paste your license code here…"
          style={{ ...inp, fontFamily: 'monospace', marginTop: 6, height: 80, resize: 'none' }} />
        {err && <div style={{ color: '#e11', fontSize: 13, marginTop: 8 }}>{err}</div>}

        <button onClick={activate} disabled={busy || !code.trim()} style={{
          marginTop: 18, width: '100%', padding: 14, background: busy || !code.trim() ? '#9bbcf0' : '#2563eb',
          color: '#fff', border: 'none', borderRadius: 10, fontSize: 16, fontWeight: 700, cursor: busy || !code.trim() ? 'default' : 'pointer'
        }}>{busy ? 'Activating…' : 'Activate'}</button>

        <p style={{ fontSize: 12, color: '#aaa', marginTop: 18, textAlign: 'center' }}>One license works on one computer only.</p>
      </div>
    </div>
  );
}
