import React, { useState } from 'react';
import { createShopkeeper } from '../api/shopkeeper';
import { Store, Phone, ArrowRight, Loader2, Sparkles, ShieldCheck } from 'lucide-react';
import { motion } from 'framer-motion';

export default function Onboarding({ onComplete }) {
  const [shopName, setShopName] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(() => {
    const savedErr = localStorage.getItem('voice_udhar_auth_error');
    if (savedErr) {
      localStorage.removeItem('voice_udhar_auth_error');
      return savedErr;
    }
    return '';
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const trimmedShopName = shopName.trim();
    const trimmedPhone = phone.trim();

    if (!trimmedShopName || !trimmedPhone) {
      setError('મહેરબાની કરીને દુકાનનું નામ અને નંબર બંને દાખલ કરો. / Please enter both shop name and phone number.');
      return;
    }

    setLoading(true);

    try {
      const response = await createShopkeeper({
        shopName: trimmedShopName,
        phone: trimmedPhone,
      });

      const shopkeeperData = response.data;
      if (shopkeeperData && shopkeeperData.shopkeeperId) {
        localStorage.setItem('voice_udhar_shopkeeper_id', shopkeeperData.shopkeeperId);
        localStorage.setItem('voice_udhar_shop_name', shopkeeperData.shopName || trimmedShopName);
        if (shopkeeperData.apiKey) {
          localStorage.setItem('voice_udhar_api_key', shopkeeperData.apiKey);
        }
        onComplete(shopkeeperData);
      } else {
        throw new Error('અમાન્ય સર્વર પ્રતિસાદ / Invalid response from server');
      }
    } catch (err) {
      console.error('Onboarding error:', err);
      setError(err.message || 'સર્વર સાથે જોડાણમાં ભૂલ આવી. / Error connecting to server.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      style={{
        padding: '2rem 1.5rem',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        maxWidth: '480px',
        margin: '0 auto',
        position: 'relative',
        zIndex: 2,
      }}
    >
      <div className="glass-panel" style={{ padding: '2.25rem 1.75rem', position: 'relative' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <motion.div
            initial={{ scale: 0.8, rotate: -5 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            style={{
              width: '84px',
              height: '84px',
              background: 'radial-gradient(circle at 35% 35%, #C026D3 0%, #7C3AED 60%, #4C1D95 100%)',
              color: '#F0C674',
              borderRadius: '24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 1.25rem auto',
              boxShadow: '0 12px 30px rgba(124, 58, 237, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.3)',
              border: '1px solid rgba(240, 198, 116, 0.35)',
              position: 'relative',
            }}
          >
            <Store size={42} />
            <motion.div
              animate={{ scale: [1, 1.25, 1] }}
              transition={{ repeat: Infinity, duration: 2.5 }}
              style={{ position: 'absolute', top: '-4px', right: '-4px' }}
            >
              <Sparkles size={22} color="#F0C674" fill="#F0C674" />
            </motion.div>
          </motion.div>

          <h1 className="gold-gradient-text" style={{ fontSize: '2.2rem', marginBottom: '0.4rem', letterSpacing: '-0.02em', fontFamily: "'Outfit', sans-serif" }}>
            વોઇસ ઉધાર
          </h1>
          <p style={{ color: '#E9D5FF', fontSize: '1.15rem', fontWeight: '700' }}>
            તમારી દુકાનની નોંધણી કરો
          </p>
          <p style={{ color: '#94A3B8', fontSize: '0.925rem', marginTop: '0.2rem', fontWeight: '500' }}>
            Register your shop to get started
          </p>
        </div>

        {error && (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="error-banner" role="alert">
            {error}
          </motion.div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div className="form-group">
            <label className="form-label" htmlFor="shopName">
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#F8FAFC' }}>
                <Store size={20} color="#F0C674" />
                દુકાનનું નામ
              </span>
              <span className="form-sublabel">Shop Name</span>
            </label>
            <input
              id="shopName"
              type="text"
              className="form-input"
              placeholder="દા.ત. પટેલ જનરલ સ્ટોર્સ"
              value={shopName}
              onChange={(e) => setShopName(e.target.value)}
              disabled={loading}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="phone">
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#F8FAFC' }}>
                <Phone size={20} color="#F0C674" />
                મોબાઇલ નંબર
              </span>
              <span className="form-sublabel">Phone Number</span>
            </label>
            <input
              id="phone"
              type="tel"
              className="form-input"
              placeholder="9876543210"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={loading}
              required
            />
          </div>

          <motion.button
            whileTap={{ scale: 0.98 }}
            type="submit"
            className="btn-primary"
            style={{ marginTop: '1.5rem' }}
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 className="animate-spin" size={24} />
                સાચવી રહ્યું છે...
              </>
            ) : (
              <>
                શરૂ કરો / Continue
                <ArrowRight size={22} />
              </>
            )}
          </motion.button>
        </form>

        <div style={{
          marginTop: '2rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.5rem',
          color: '#94A3B8',
          fontSize: '0.85rem',
          fontWeight: '500',
          paddingTop: '1rem',
          borderTop: '1px dashed rgba(255, 255, 255, 0.1)'
        }}>
          <ShieldCheck size={18} color="#10B981" />
          <span style={{ color: '#A7F3D0' }}>૧૦૦% સલામત અને સુરક્ષિત / 100% Safe & Secure</span>
        </div>
      </div>
    </motion.div>
  );
}
