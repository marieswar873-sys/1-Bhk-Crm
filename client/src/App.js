import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import LicenseGate from './components/LicenseGate';
import ActivationGate from './components/ActivationGate';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Billing from './pages/Billing';
import Tables from './pages/Tables';
import Orders from './pages/Orders';
import MenuManagement from './pages/MenuManagement';
import Import from './pages/Import';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import Inventory from './pages/Inventory';
import PlatformSync from './pages/PlatformSync';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  return user ? children : <Navigate to="/login" />;
}

function App() {
  return (
    <ActivationGate>
    <LicenseGate>
    <AuthProvider>
      <HashRouter>
        <Toaster position="top-right" />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
            <Route index element={<Dashboard />} />
            <Route path="billing" element={<Billing />} />
            <Route path="tables" element={<Tables />} />
            <Route path="orders" element={<Orders />} />
            <Route path="menu" element={<MenuManagement />} />
            <Route path="import" element={<Import />} />
            <Route path="reports" element={<Reports />} />
            <Route path="settings" element={<Settings />} />
            <Route path="inventory" element={<Inventory />} />
            <Route path="platform" element={<PlatformSync />} />
          </Route>
        </Routes>
      </HashRouter>
    </AuthProvider>
    </LicenseGate>
    </ActivationGate>
  );
}

export default App;
