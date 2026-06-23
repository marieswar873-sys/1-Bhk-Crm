import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import logo from '../logo.png';

export default function Login() {
  const [email, setEmail] = useState('admin@restaurant.com');
  const [password, setPassword] = useState('admin123');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
      toast.success('Welcome back!');
      navigate('/');
    } catch {
      toast.error('Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)'
    }}>
      <form onSubmit={handleSubmit} style={{
        background: '#fff', padding: 40, borderRadius: 12, width: 360,
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
      }}>
        <img src={logo} alt="1BHK Kitchen" style={{ width: 80, height: 80, marginBottom: 12 }} />
        <h1 style={{ margin: '0 0 4px', fontSize: 22, color: '#1a1a2e' }}>1BHK CRM</h1>
        <p style={{ margin: '0 0 24px', color: '#888', fontSize: 12 }}>Best Hyderabadi Kitchen</p>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', marginBottom: 4, fontSize: 13, color: '#555' }}>Email</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
            style={{ width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' }} />
        </div>
        <div style={{ marginBottom: 24 }}>
          <label style={{ display: 'block', marginBottom: 4, fontSize: 13, color: '#555' }}>Password</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
            style={{ width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' }} />
        </div>
        <button type="submit" disabled={loading} style={{
          width: '100%', padding: 12, background: '#1a1a2e', color: '#fff',
          border: 'none', borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: 'pointer'
        }}>
          {loading ? 'Signing in...' : 'Sign In'}
        </button>
        <p style={{ marginTop: 16, fontSize: 11, color: '#999', textAlign: 'center' }}>
          Default: admin@restaurant.com / admin123
        </p>
      </form>
    </div>
  );
}
