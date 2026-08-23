import { useState, useEffect, useRef } from 'react';
import api from '../utils/api';
import toast from 'react-hot-toast';

const PLATFORMS = [
  { id: 'swiggy', label: 'Swiggy', color: '#fc8019', icon: '🟧', emailKey: 'swiggy_email', fieldLabel: 'Mobile / Restaurant ID', passwordKey: 'swiggy_password' },
  { id: 'zomato', label: 'Zomato', color: '#e23744', icon: '🟥', emailKey: 'zomato_email', fieldLabel: 'Partner Email' },
];

export default function PlatformSync() {
  const [sales, setSales] = useState([]);
  const [summary, setSummary] = useState(null);
  const [settings, setSettings] = useState({});
  const [scraping, setScraping] = useState(null); // 'swiggy' | 'zomato' | null
  const [scrapeStatus, setScrapeStatus] = useState('');
  const [otpModal, setOtpModal] = useState(null); // { platform }
  const [otp, setOtp] = useState('');
  const [saving, setSaving] = useState(false);
  const pollRef = useRef(null);

  const load = async () => {
    try {
      const [s, sum, sett] = await Promise.all([
        api.get('/platform/sales'),
        api.get('/platform/summary'),
        api.get('/settings'),
      ]);
      setSales(s.data);
      setSummary(sum.data);
      setSettings(sett.data);
    } catch (e) {
      toast.error('Failed to load: ' + e.message);
    }
  };

  useEffect(() => { load(); }, []);

  const saveCredentials = async () => {
    setSaving(true);
    try {
      await api.put('/settings', settings);
      toast.success('Credentials saved');
    } catch (e) {
      toast.error(e.response?.data?.error || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const startScrape = async (platform) => {
    const emailKey = PLATFORMS.find(p => p.id === platform).emailKey;
    if (!settings[emailKey]) return toast.error(`Enter your ${platform} partner email first`);

    setScraping(platform);
    setScrapeStatus('Triggering scrape...');

    try {
      await api.post('/platform/scrape', { platform });
    } catch (e) {
      toast.error(e.response?.data?.error || 'Trigger failed');
      setScraping(null);
      return;
    }

    // Poll for status and OTP prompts
    pollRef.current = setInterval(async () => {
      try {
        const { data } = await api.get('/platform/scrape-status');
        if (data.status) setScrapeStatus(data.status.status || '');
        if (data.otpNeeded) {
          clearInterval(pollRef.current);
          setOtpModal({ platform: data.otpNeeded.platform });
          await api.post('/platform/otp-clear');
        }
        if (data.status?.status?.startsWith('Done') || data.status?.status?.startsWith('Error')) {
          clearInterval(pollRef.current);
          setScraping(null);
          if (data.status.status.startsWith('Done')) {
            toast.success('Data scraped and saved!');
            load();
          } else {
            toast.error(data.status.status);
          }
        }
      } catch {}
    }, 1500);
  };

  const submitOtp = async () => {
    if (!otp || otp.length < 4) return toast.error('Enter the OTP');
    try {
      await api.post('/platform/otp', { otp, platform: otpModal.platform });
      setOtpModal(null);
      setOtp('');
      setScrapeStatus('OTP submitted — scraping...');
      // Resume polling
      pollRef.current = setInterval(async () => {
        try {
          const { data } = await api.get('/platform/scrape-status');
          if (data.status) setScrapeStatus(data.status.status || '');
          if (data.status?.status?.startsWith('Done') || data.status?.status?.startsWith('Error')) {
            clearInterval(pollRef.current);
            setScraping(null);
            if (data.status.status.startsWith('Done')) { toast.success('Data scraped!'); load(); }
            else toast.error(data.status.status);
          }
        } catch {}
      }, 1500);
    } catch (e) {
      toast.error('OTP submit failed');
    }
  };

  useEffect(() => () => clearInterval(pollRef.current), []);

  const byPlatform = (p) => sales.filter(s => s.platform === p);
  const today = new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);

  return (
    <div style={{ maxWidth: 900 }}>
      <h2 style={{ margin: '0 0 20px', color: '#1a1a2e' }}>Platform Sync</h2>
      <p style={{ color: '#888', fontSize: 13, marginTop: -14, marginBottom: 20 }}>
        Scrape your daily sales & payout data from Swiggy and Zomato partner portals.
      </p>

      {/* OTP Modal */}
      {otpModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 32, width: 340, textAlign: 'center' }}>
            <div style={{ fontSize: 40 }}>{PLATFORMS.find(p => p.id === otpModal.platform)?.icon}</div>
            <h3 style={{ margin: '12px 0 8px', color: '#1a1a2e' }}>Enter {otpModal.platform.charAt(0).toUpperCase() + otpModal.platform.slice(1)} OTP</h3>
            <p style={{ fontSize: 13, color: '#888', marginBottom: 20 }}>Check your email for the OTP</p>
            <input
              value={otp}
              onChange={e => setOtp(e.target.value)}
              placeholder="Enter OTP"
              maxLength={8}
              onKeyDown={e => e.key === 'Enter' && submitOtp()}
              style={{ width: '100%', padding: '12px 16px', border: '2px solid #ddd', borderRadius: 8, fontSize: 20, textAlign: 'center', letterSpacing: 6, boxSizing: 'border-box', marginBottom: 16 }}
              autoFocus
            />
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={submitOtp} style={{ flex: 1, padding: '12px', background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                Submit OTP
              </button>
              <button onClick={() => { setOtpModal(null); setScraping(null); clearInterval(pollRef.current); }} style={{ padding: '12px 16px', background: '#eee', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Credentials */}
      <div style={{ background: '#fff', borderRadius: 12, padding: 24, marginBottom: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <h3 style={{ margin: '0 0 16px', fontSize: 16 }}>Partner Portal Credentials</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          {PLATFORMS.map(p => (
            <div key={p.id}>
              <label style={{ fontSize: 13, fontWeight: 600, color: '#555', display: 'block', marginBottom: 6 }}>
                {p.icon} {p.label} {p.fieldLabel}
              </label>
              <input
                value={settings[p.emailKey] || ''}
                onChange={e => setSettings(s => ({ ...s, [p.emailKey]: e.target.value }))}
                placeholder={`${p.label} ${p.fieldLabel}`}
                style={{ padding: '10px 14px', border: '1px solid #ddd', borderRadius: 8, fontSize: 14, width: '100%', boxSizing: 'border-box' }}
              />
              {p.passwordKey && (
                <input
                  type="password"
                  value={settings[p.passwordKey] || ''}
                  onChange={e => setSettings(s => ({ ...s, [p.passwordKey]: e.target.value }))}
                  placeholder="Password (optional — skips OTP)"
                  style={{ padding: '10px 14px', border: '1px solid #ddd', borderRadius: 8, fontSize: 14, width: '100%', boxSizing: 'border-box', marginTop: 8 }}
                />
              )}
            </div>
          ))}
        </div>
        <button onClick={saveCredentials} disabled={saving} style={{
          padding: '10px 24px', background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer'
        }}>{saving ? 'Saving...' : 'Save Credentials'}</button>
        <div style={{ fontSize: 11, color: '#888', marginTop: 8 }}>
          Login uses Email + OTP (your phone/email gets the code). Session is saved so OTP is only needed once per session.
        </div>
      </div>

      {/* Today's summary */}
      {summary && (
        <div style={{ background: '#fff', borderRadius: 12, padding: 24, marginBottom: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <h3 style={{ margin: '0 0 16px', fontSize: 16 }}>Today — {today}</h3>
          {summary.platforms.length === 0 ? (
            <p style={{ color: '#aaa', fontSize: 13 }}>No data yet for today. Run a scrape below.</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
              {summary.platforms.map(p => {
                const pl = PLATFORMS.find(x => x.id === p.platform);
                return (
                  <div key={p.platform} style={{ background: `${pl.color}11`, border: `2px solid ${pl.color}33`, borderRadius: 10, padding: 16 }}>
                    <div style={{ fontWeight: 700, fontSize: 15, color: pl.color, marginBottom: 8 }}>{pl.icon} {pl.label}</div>
                    <div style={{ fontSize: 13, color: '#555', marginBottom: 4 }}>📦 Orders: <b>{p.orders}</b></div>
                    <div style={{ fontSize: 13, color: '#555', marginBottom: 4 }}>💰 Gross: <b>₹{parseFloat(p.gross_revenue || 0).toFixed(0)}</b></div>
                    <div style={{ fontSize: 13, color: '#e53935', marginBottom: 4 }}>✂️ Commission: <b>-₹{parseFloat(p.commission || 0).toFixed(0)}</b></div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#2e7d32', marginTop: 6 }}>Net: ₹{parseFloat(p.net_payout || 0).toFixed(0)}</div>
                    <div style={{ fontSize: 10, color: '#aaa', marginTop: 4 }}>Scraped: {new Date(p.scraped_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Scrape buttons */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        {PLATFORMS.map(p => (
          <div key={p.id} style={{ background: '#fff', borderRadius: 12, padding: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <div style={{ fontWeight: 700, fontSize: 16, color: p.color, marginBottom: 8 }}>{p.icon} {p.label}</div>
            <div style={{ fontSize: 12, color: '#888', marginBottom: 14 }}>
              Logs in to {p.label} partner portal and pulls today's orders, revenue, commission & payout.
            </div>
            <button
              onClick={() => startScrape(p.id)}
              disabled={!!scraping}
              style={{
                width: '100%', padding: '12px', background: scraping === p.id ? '#ccc' : p.color,
                color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700,
                cursor: scraping ? 'default' : 'pointer'
              }}
            >
              {scraping === p.id ? `⏳ ${scrapeStatus || 'Scraping...'}` : `▶ Scrape ${p.label} Now`}
            </button>
          </div>
        ))}
      </div>

      {/* History table */}
      {sales.length > 0 && (
        <div style={{ background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <h3 style={{ margin: '0 0 16px', fontSize: 16 }}>History (last 30 days)</h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f8f9fa' }}>
                  {['Date', 'Platform', 'Orders', 'Gross', 'Commission', 'Net Payout'].map(h => (
                    <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: '#555', borderBottom: '2px solid #eee' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sales.map(r => {
                  const pl = PLATFORMS.find(p => p.id === r.platform);
                  return (
                    <tr key={r.id} style={{ borderBottom: '1px solid #f5f5f5' }}>
                      <td style={{ padding: '9px 12px', color: '#1a1a2e', fontWeight: 600 }}>{r.date}</td>
                      <td style={{ padding: '9px 12px', color: pl?.color, fontWeight: 700 }}>{pl?.icon} {pl?.label}</td>
                      <td style={{ padding: '9px 12px' }}>{r.orders}</td>
                      <td style={{ padding: '9px 12px' }}>₹{parseFloat(r.gross_revenue || 0).toFixed(0)}</td>
                      <td style={{ padding: '9px 12px', color: '#e53935' }}>-₹{parseFloat(r.commission || 0).toFixed(0)}</td>
                      <td style={{ padding: '9px 12px', color: '#2e7d32', fontWeight: 700 }}>₹{parseFloat(r.net_payout || 0).toFixed(0)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
