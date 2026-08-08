import React, { useEffect, useState } from 'react';

const API = 'http://localhost:3001';

export default function ActivationGate({ children }) {
  const [status, setStatus] = useState('loading'); // loading | activated | pending
  const [apiKey, setApiKey] = useState('');
  const [error, setError] = useState('');
  const [activating, setActivating] = useState(false);
  const [restaurantName, setRestaurantName] = useState('');

  useEffect(() => {
    fetch(`${API}/api/activation/status`)
      .then(r => r.json())
      .then(d => setStatus(d.activated ? 'activated' : 'pending'))
      .catch(() => setStatus('pending'));
  }, []);

  async function handleActivate(e) {
    e.preventDefault();
    const key = apiKey.trim();
    if (!key) { setError('Please enter the CRM Connection Key.'); return; }
    setActivating(true);
    setError('');
    try {
      const res = await fetch(`${API}/api/activation/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: key }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Activation failed. Check the key and try again.'); return; }
      setRestaurantName(data.name || '');
      setStatus('activated');
    } catch {
      setError('Cannot connect to the local server. Make sure the app is running.');
    } finally {
      setActivating(false);
    }
  }

  if (status === 'loading') {
    return (
      <div style={styles.overlay}>
        <p style={{ color: '#888' }}>Starting up…</p>
      </div>
    );
  }

  if (status === 'activated') {
    return children;
  }

  // pending — show activation screen
  return (
    <div style={styles.overlay}>
      <div style={styles.card}>
        <div style={styles.logo}>🍽️</div>
        <h2 style={styles.title}>Activate your CRM</h2>
        <p style={styles.sub}>
          Enter the <strong>CRM Connection Key</strong> provided by your administrator to activate this software on this computer.
        </p>

        <form onSubmit={handleActivate}>
          <input
            style={styles.input}
            type="text"
            placeholder="Paste your CRM Connection Key here"
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            autoFocus
            spellCheck={false}
          />
          {error && <p style={styles.error}>{error}</p>}
          <button style={styles.btn} type="submit" disabled={activating}>
            {activating ? 'Activating…' : 'Activate'}
          </button>
        </form>

        <p style={styles.hint}>
          Contact your restaurant administrator if you don't have a key.
        </p>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed', inset: 0, background: '#f4f6f9',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: 'sans-serif',
  },
  card: {
    background: '#fff', borderRadius: 16, padding: '40px 36px',
    boxShadow: '0 4px 32px rgba(0,0,0,0.10)', maxWidth: 420, width: '90%',
    textAlign: 'center',
  },
  logo: { fontSize: 48, marginBottom: 12 },
  title: { margin: '0 0 8px', fontSize: 22, color: '#1a1a2e' },
  sub: { color: '#555', fontSize: 14, lineHeight: 1.6, margin: '0 0 24px' },
  input: {
    width: '100%', padding: '12px 14px', borderRadius: 8,
    border: '1.5px solid #d0d5dd', fontSize: 14, boxSizing: 'border-box',
    outline: 'none', marginBottom: 12, fontFamily: 'monospace',
  },
  error: { color: '#e53935', fontSize: 13, marginBottom: 12, textAlign: 'left' },
  btn: {
    width: '100%', padding: '12px', borderRadius: 8,
    background: '#4f46e5', color: '#fff', fontSize: 15, fontWeight: 600,
    border: 'none', cursor: 'pointer',
  },
  hint: { color: '#aaa', fontSize: 12, marginTop: 20 },
};
