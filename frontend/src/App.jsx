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
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      style={{ display: 'flex', flexDirection: 'column', flex: 1, width: '100%' }}
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
  }, []);

  const handleOnboardingComplete = (data) => {
    setShopkeeperId(data.shopkeeperId);
    setShopName(data.shopName || '');
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', gap: '1rem', backgroundColor: '#FAFAF9' }}>
        <div style={{
          width: '64px',
          height: '64px',
          borderRadius: '16px',
          background: 'linear-gradient(135deg, #4C1D95 0%, #6D28D9 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 8px 20px rgba(76, 29, 149, 0.25)'
        }}>
          <Sparkles size={32} color="#F59E0B" />
        </div>
        <Loader2 className="animate-spin" size={32} color="#6D28D9" />
        <p style={{ fontSize: '1.1rem', color: '#64748B', fontWeight: '600' }}>લોડ થઈ રહ્યું છે... / Loading...</p>
      </div>
    );
  }

  // Show onboarding if shopkeeperId is not found in localStorage
  if (!shopkeeperId) {
    return <Onboarding onComplete={handleOnboardingComplete} />;
  }

  return (
    <BrowserRouter>
      <Header shopName={shopName} />
      <AnimatedRoutes />
      <BottomNav />
    </BrowserRouter>
  );
}
