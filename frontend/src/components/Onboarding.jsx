import React, { useState } from 'react';
import { createShopkeeper } from '../api/shopkeeper';
import { Store, Phone, ArrowRight, Loader2 } from 'lucide-react';

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
    <div style={{ padding: '2rem 1.25rem', minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <div style={{
          width: '72px',
          height: '72px',
          backgroundColor: '#eff6ff',
          color: '#2563eb',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 1rem auto'
        }}>
          <Store size={36} />
        </div>
        <h1 style={{ fontSize: '1.75rem', color: '#0f172a', marginBottom: '0.5rem' }}>
          વોઇસ ઉધાર / Voice Udhar
        </h1>
        <p style={{ color: '#64748b', fontSize: '1.1rem' }}>
          તમારી દુકાનની નોંધણી કરો
        </p>
        <p style={{ color: '#94a3b8', fontSize: '0.9rem' }}>
          Register your shop to continue
        </p>
      </div>

      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label className="form-label" htmlFor="shopName">
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Store size={20} color="#2563eb" />
              દુકાનનું નામ
            </span>
            <span className="form-sublabel">Shop Name / দোকান নাম</span>
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
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Phone size={20} color="#2563eb" />
              મોબાઇલ નંબર
            </span>
            <span className="form-sublabel">Phone Number / મોબાઈલ નંબર</span>
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

        <button
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
              <ArrowRight size={24} />
            </>
          )}
        </button>
      </form>
    </div>
  );
}
