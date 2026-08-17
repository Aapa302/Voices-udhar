import React, { useState } from 'react';
import { createShopkeeper } from '../api/shopkeeper';
import { Store, Phone, ArrowRight, Loader2, Sparkles, ShieldCheck } from 'lucide-react';
import { motion } from 'framer-motion';

export default function Onboarding({ onComplete }) {
  const [shopName, setShopName] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      style={{
        padding: '2rem 1.5rem',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        maxWidth: '480px',
        margin: '0 auto',
      }}
    >
      <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
        <motion.div
          initial={{ scale: 0.8, rotate: -5 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
          style={{
            width: '84px',
            height: '84px',
            background: 'linear-gradient(135deg, #4C1D95 0%, #6D28D9 100%)',
            color: '#F59E0B',
            borderRadius: '24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 1.25rem auto',
            boxShadow: '0 12px 28px rgba(76, 29, 149, 0.25)',
            position: 'relative',
          }}
        >
          <Store size={42} />
          <motion.div
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ repeat: Infinity, duration: 2.5 }}
            style={{ position: 'absolute', top: '-4px', right: '-4px' }}
          >
            <Sparkles size={20} color="#F59E0B" fill="#F59E0B" />
          </motion.div>
        </motion.div>

        <h1 style={{ fontSize: '2rem', color: '#0F172A', marginBottom: '0.5rem', letterSpacing: '-0.02em' }}>
          વોઇસ ઉધાર
        </h1>
        <p style={{ color: '#4C1D95', fontSize: '1.15rem', fontWeight: '700' }}>
          તમારી દુકાનની નોંધણી કરો
        </p>
        <p style={{ color: '#64748B', fontSize: '0.925rem', marginTop: '0.2rem', fontWeight: '500' }}>
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
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#0F172A' }}>
              <Store size={20} color="#6D28D9" />
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
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#0F172A' }}>
              <Phone size={20} color="#6D28D9" />
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
        marginTop: '2.5rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.5rem',
        color: '#64748B',
        fontSize: '0.85rem',
        fontWeight: '500'
      }}>
        <ShieldCheck size={18} color="#10B981" />
        <span>૧૦૦% સલામત અને સુરક્ષિત / 100% Safe & Secure</span>
      </div>
    </motion.div>
  );
}
