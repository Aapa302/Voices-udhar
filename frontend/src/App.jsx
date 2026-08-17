import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Header from './components/Header';
import BottomNav from './components/BottomNav';
import Onboarding from './components/Onboarding';
import HomeScreen from './pages/HomeScreen';
import CustomersScreen from './pages/CustomersScreen';
import CustomerHistoryScreen from './pages/CustomerHistoryScreen';

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
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <p style={{ fontSize: '1.25rem', color: '#64748b' }}>લોડ થઈ રહ્યું છે... / Loading...</p>
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
      <Routes>
        <Route path="/" element={<HomeScreen />} />
        <Route path="/customers" element={<CustomersScreen />} />
        <Route path="/customers/:customerId" element={<CustomerHistoryScreen />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <BottomNav />
    </BrowserRouter>
  );
}
