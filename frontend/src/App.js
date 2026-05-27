import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './utils/AuthContext';
import Layout from './components/layout/Layout';
import Landing from './pages/Landing';
import Product from './pages/Product';
import Contact from './pages/Contact';
import Privacy from './pages/Privacy';
import Terms from './pages/Terms';
import Refund from './pages/Refund';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Payment from './pages/Payment';
import Dashboard from './pages/Dashboard';
import Upload from './pages/Upload';
import Orders from './pages/Orders';
import SKUPricing from './pages/SKUPricing';
import AdminPanel from './pages/AdminPanel';

function FullScreenLoader() {
  return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="logo-mark" style={{ width: 56, height: 56, fontSize: 20 }}>PX</div>
    </div>
  );
}

function PublicRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <FullScreenLoader />;
  if (user) {
    if (user.isAdmin) return <Navigate to="/admin" replace />;
    if (!user.isActive) return <Navigate to="/payment" replace />;
    return <Navigate to="/app" replace />;
  }
  return children;
}

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <FullScreenLoader />;
  if (!user) return <Navigate to="/login" replace />;
  if (!user.isActive && !user.isAdmin) return <Navigate to="/payment" replace />;
  return <Layout>{children}</Layout>;
}

function AdminRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <FullScreenLoader />;
  if (!user) return <Navigate to="/login" replace />;
  if (!user.isAdmin) return <Navigate to="/app" replace />;
  return <Layout>{children}</Layout>;
}

function PaymentRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <FullScreenLoader />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.isAdmin) return <Navigate to="/admin" replace />;
  if (user.isActive) return <Navigate to="/app" replace />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/"        element={<PublicRoute><Landing /></PublicRoute>} />
          <Route path="/product" element={<Product />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/terms"   element={<Terms />} />
          <Route path="/refund"  element={<Refund />} />
          <Route path="/login"   element={<PublicRoute><Login /></PublicRoute>} />
          <Route path="/signup"  element={<PublicRoute><Signup /></PublicRoute>} />
          <Route path="/payment" element={<PaymentRoute><Payment /></PaymentRoute>} />

          <Route path="/app"           element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/app/upload"    element={<ProtectedRoute><Upload /></ProtectedRoute>} />
          <Route path="/app/orders"    element={<ProtectedRoute><Orders /></ProtectedRoute>} />
          <Route path="/app/sku"       element={<ProtectedRoute><SKUPricing /></ProtectedRoute>} />

          <Route path="/admin" element={<AdminRoute><AdminPanel /></AdminRoute>} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
