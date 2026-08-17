import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import Header from './components/Header';
import BottomNav from './components/BottomNav';
import Onboarding from './components/Onboarding';
import HomeScreen from './pages/HomeScreen';
import CustomersScreen from './pages/CustomersScreen';
import CustomerHistoryScreen from './pages/CustomerHistoryScreen';
import SummaryScreen from './pages/SummaryScreen';
import { Loader2, Sparkles } from 'lucide-react';

function AnimatedRoutes() {
  const location = useLocation();

  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route
          path="/"
          element={
            <PageWrapper>
              <HomeScreen />
            </PageWrapper>
          }
        />
        <Route
          path="/customers"
          element={
            <PageWrapper>
              <CustomersScreen />
            </PageWrapper>
          }
        />
        <Route
          path="/customers/:customerId"
          element={
            <PageWrapper>
              <CustomerHistoryScreen />
            </PageWrapper>
          }
        />
        <Route
          path="/summary"
          element={
            <PageWrapper>
              <SummaryScreen />
            </PageWrapper>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AnimatePresence>
  );
}

function PageWrapper({ children }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
      style={{ display: 'flex', flexDirection: 'column', flex: 1, width: '100%', zIndex: 1 }}
    >
      {children}
    </motion.div>
  );
}

export default function App() {
  const [shopkeeperId, setShopkeeperId] = useState(null);
  const [shopName, setShopName] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const savedId = localStorage.getItem('voice_udhar_shopkeeper_id');
    const savedName = localStorage.getItem('voice_udhar_shop_name') || '';
    if (savedId) {
      setShopkeeperId(savedId);
      setShopName(savedName);
    }
    setLoading(false);

    const handleAuthFailure = () => {
      setShopkeeperId(null);
      setShopName('');
    };

    window.addEventListener('voice_udhar_auth_failed', handleAuthFailure);
    return () => window.removeEventListener('voice_udhar_auth_failed', handleAuthFailure);
  }, []);

  const handleOnboardingComplete = (data) => {
    setShopkeeperId(data.shopkeeperId);
    setShopName(data.shopName || '');
  };

  return (
    <div style={{ position: 'relative', minHeight: '100vh', width: '100%', overflow: 'hidden' }}>
      {/* Drifting Ambient Background Orbs */}
      <motion.div
        className="ambient-bg-orb orb-1"
        animate={{
          x: [0, 30, -20, 0],
          y: [0, -30, 20, 0],
        }}
        transition={{ repeat: Infinity, duration: 18, ease: 'easeInOut' }}
      />
      <motion.div
        className="ambient-bg-orb orb-2"
        animate={{
          x: [0, -40, 20, 0],
          y: [0, 30, -30, 0],
        }}
        transition={{ repeat: Infinity, duration: 22, ease: 'easeInOut' }}
      />
      <motion.div
        className="ambient-bg-orb orb-3"
        animate={{
          scale: [1, 1.25, 0.9, 1],
          opacity: [0.15, 0.25, 0.1, 0.15],
        }}
        transition={{ repeat: Infinity, duration: 15, ease: 'easeInOut' }}
      />

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', gap: '1rem', backgroundColor: '#0A0A0F', position: 'relative', zIndex: 2 }}>
          <div style={{
            width: '72px',
            height: '72px',
            borderRadius: '20px',
            background: 'linear-gradient(135deg, #7C3AED 0%, #C026D3 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 12px 30px rgba(124, 58, 237, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.3)',
            border: '1px solid rgba(240, 198, 116, 0.3)'
          }}>
            <Sparkles size={36} color="#F0C674" />
          </div>
          <Loader2 className="animate-spin" size={32} color="#C026D3" />
          <p style={{ fontSize: '1.1rem', color: '#94A3B8', fontWeight: '600' }}>લોડ થઈ રહ્યું છે... / Loading...</p>
        </div>
      ) : !shopkeeperId ? (
        <Onboarding onComplete={handleOnboardingComplete} />
      ) : (
        <BrowserRouter>
          <Header shopName={shopName} />
          <AnimatedRoutes />
          <BottomNav />
        </BrowserRouter>
      )}
    </div>
  );
}
