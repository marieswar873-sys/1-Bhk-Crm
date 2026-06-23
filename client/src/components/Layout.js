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
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#f0f2f5' }}>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div onClick={() => setSidebarOpen(false)} style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 998
        }} className="mobile-overlay" />
      )}

      <style>{`
        .mobile-overlay { display: none; }
        @media (max-width: 768px) {
          .mobile-overlay { display: block !important; }
          .crm-sidebar {
            position: fixed !important; left: ${sidebarOpen ? '0' : '-250px'} !important;
            top: 0 !important; bottom: 0 !important; z-index: 999 !important;
            width: 220px !important; transition: left 0.3s !important;
          }
          .crm-main { margin-left: 0 !important; }
          .crm-topbar { display: flex !important; }
        }
      `}</style>

      {/* Sidebar */}
      <aside className="crm-sidebar" style={{
        width: 220, background: '#1a1a2e', color: '#fff',
        overflow: 'hidden', display: 'flex', flexDirection: 'column', flexShrink: 0
      }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #333', display: 'flex', alignItems: 'center', gap: 8 }}>
          <img src={logo} alt="1BHK" style={{ width: 36, height: 36, borderRadius: 6 }} />
          <span style={{ fontWeight: 700, fontSize: 15 }}>1BHK CRM</span>
        </div>
        <nav style={{ flex: 1, padding: '8px 0', overflowY: 'auto' }}>
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink key={to} to={to} end={to === '/'} onClick={() => setSidebarOpen(false)} style={({ isActive }) => ({
              display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px',
              color: isActive ? '#4fc3f7' : '#ccc', background: isActive ? '#16213e' : 'transparent',
              textDecoration: 'none', fontSize: 13, borderLeft: isActive ? '3px solid #4fc3f7' : '3px solid transparent'
            })}>
              <Icon size={17} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div style={{ padding: 14, borderTop: '1px solid #333' }}>
          <div style={{ fontSize: 11, color: '#999', marginBottom: 6 }}>{user?.name} ({user?.role})</div>
          <button onClick={handleLogout} style={{
            display: 'flex', alignItems: 'center', gap: 8, background: 'none',
            border: 'none', color: '#f44', cursor: 'pointer', fontSize: 12
          }}>
            <FiLogOut size={14} /> Logout
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="crm-main" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Mobile top bar */}
        <div className="crm-topbar" style={{
          display: 'none', alignItems: 'center', gap: 10, padding: '8px 12px',
          background: '#1a1a2e', color: '#fff'
        }}>
          <button onClick={() => setSidebarOpen(!sidebarOpen)} style={{
            background: 'none', border: 'none', color: '#fff', fontSize: 22, cursor: 'pointer', padding: 4
          }}>☰</button>
          <img src={logo} alt="1BHK" style={{ width: 28, height: 28, borderRadius: 4 }} />
          <span style={{ fontWeight: 700, fontSize: 14 }}>1BHK CRM</span>
        </div>
        <main style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
