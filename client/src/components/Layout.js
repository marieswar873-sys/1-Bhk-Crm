import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { FiHome, FiShoppingCart, FiGrid, FiList, FiBarChart2, FiUpload, FiLogOut, FiMenu, FiSettings } from 'react-icons/fi';
import { useState } from 'react';
import logo from '../logo.png';

const navItems = [
  { to: '/', icon: FiHome, label: 'Dashboard' },
  { to: '/billing', icon: FiShoppingCart, label: 'Billing' },
  { to: '/tables', icon: FiGrid, label: 'Tables' },
  { to: '/orders', icon: FiList, label: 'Orders' },
  { to: '/menu', icon: FiMenu, label: 'Menu' },
  { to: '/import', icon: FiUpload, label: 'Import' },
  { to: '/reports', icon: FiBarChart2, label: 'Reports' },
  { to: '/settings', icon: FiSettings, label: 'Settings' },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#f0f2f5' }}>
      <aside style={{
        width: sidebarOpen ? 220 : 60, background: '#1a1a2e', color: '#fff',
        transition: 'width 0.2s', overflow: 'hidden', display: 'flex', flexDirection: 'column'
      }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #333', display: 'flex', alignItems: 'center', gap: 8 }}>
          <img src={logo} alt="1BHK" style={{ width: 36, height: 36, borderRadius: 6, cursor: 'pointer' }} onClick={() => setSidebarOpen(!sidebarOpen)} />
          {sidebarOpen && <span style={{ fontWeight: 700, fontSize: 15 }}>1BHK CRM</span>}
        </div>
        <nav style={{ flex: 1, padding: '8px 0' }}>
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink key={to} to={to} end={to === '/'} style={({ isActive }) => ({
              display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
              color: isActive ? '#4fc3f7' : '#ccc', background: isActive ? '#16213e' : 'transparent',
              textDecoration: 'none', fontSize: 14, borderLeft: isActive ? '3px solid #4fc3f7' : '3px solid transparent'
            })}>
              <Icon size={18} />
              {sidebarOpen && label}
            </NavLink>
          ))}
        </nav>
        <div style={{ padding: 16, borderTop: '1px solid #333' }}>
          {sidebarOpen && <div style={{ fontSize: 12, color: '#999', marginBottom: 8 }}>
            {user?.name} ({user?.role})
          </div>}
          <button onClick={handleLogout} style={{
            display: 'flex', alignItems: 'center', gap: 8, background: 'none',
            border: 'none', color: '#f44', cursor: 'pointer', fontSize: 13
          }}>
            <FiLogOut size={16} />
            {sidebarOpen && 'Logout'}
          </button>
        </div>
      </aside>
      <main style={{ flex: 1, overflow: 'auto', padding: 24 }}>
        <Outlet />
      </main>
    </div>
  );
}
