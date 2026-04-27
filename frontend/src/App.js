// App.js
import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { AuthProvider, useAuth } from "./utils/AuthContext";
import Layout from "./components/layout/Layout";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Payment from "./pages/Payment";
import Dashboard from "./pages/Dashboard";
import Upload from "./pages/Upload";
import Orders from "./pages/Orders";
import SKUPricing from "./pages/SKUPricing";
import AdminPanel from "./pages/AdminPanel";
import "./index.css";

function ProtectedRoute({ children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  // Redirect to payment if not active and not admin
  if (!user.isActive && !user.isAdmin) return <Navigate to="/payment" replace />;
  return children;
}

function AdminRoute({ children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (!user.isAdmin) return <Navigate to="/" replace />;
  return children;
}

function PublicRoute({ children }) {
  const { user } = useAuth();
  if (user?.isActive || user?.isAdmin) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: "#ffffff",
              color: "#0f172a",
              border: "1px solid #e2e8f4",
              fontFamily: "'DM Sans', sans-serif",
              fontSize: "14px",
              boxShadow: "0 4px 16px rgba(15,23,42,0.08)",
            },
            success: { iconTheme: { primary: "#059669", secondary: "#ffffff" } },
            error: { iconTheme: { primary: "#dc2626", secondary: "#ffffff" } },
          }}
        />
        <Routes>
          {/* Public */}
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
          <Route path="/signup" element={<PublicRoute><Signup /></PublicRoute>} />
          <Route path="/payment" element={<Payment />} />

          {/* Protected seller routes */}
          <Route path="/app" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
            <Route index element={<Dashboard />} />
            <Route path="upload" element={<Upload />} />
            <Route path="orders" element={<Orders />} />
            <Route path="sku" element={<SKUPricing />} />
          </Route>

          {/* Admin routes */}
          <Route path="/admin" element={<AdminRoute><Layout isAdmin /></AdminRoute>}>
            <Route index element={<AdminPanel />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
