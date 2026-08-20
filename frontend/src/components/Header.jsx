import React, { useState } from 'react';
import { Store, Sparkles, Settings, QrCode, X, Save, Loader2, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getShopkeeperApi, updateShopkeeperApi } from '../api/shopkeeper';

export default function Header({ shopName }) {
  const [showSettingsModal, setShowShowSettingsModal] = useState(false);
  const [editUpiId, setEditUpiId] = useState('');
  const [loading, setLoading] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleOpenSettings = async () => {
    setErrorMsg('');
    setSavedSuccess(false);
    setShowShowSettingsModal(true);
    const shopkeeperId = localStorage.getItem('voice_udhar_shopkeeper_id');
    if (!shopkeeperId) return;

    try {
      setLoading(true);
      const res = await getShopkeeperApi(shopkeeperId);
      if (res && res.data) {
        setEditUpiId(res.data.upiId || '');
      }
    } catch (err) {
      console.warn('Failed to load shopkeeper settings:', err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSavedSuccess(false);
    const shopkeeperId = localStorage.getItem('voice_udhar_shopkeeper_id');
    if (!shopkeeperId) return;

    try {
      setLoading(true);
      const updated = await updateShopkeeperApi(shopkeeperId, { upiId: editUpiId.trim() });
      if (updated) {
        setSavedSuccess(true);
        setTimeout(() => {
          setShowShowSettingsModal(false);
          setSavedSuccess(false);
        }, 1200);
      }
    } catch (err) {
      console.error('Error updating settings:', err);
      setErrorMsg(err.message || 'સેટિંગ્સ સેવ કરવામાં ભૂલ આવી / Failed to save settings');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <motion.header
        className="app-header"
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <div style={{
            width: '42px',
            height: '42px',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, rgba(124, 58, 237, 0.3) 0%, rgba(192, 38, 211, 0.3) 100%)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(240, 198, 116, 0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 15px rgba(124, 58, 237, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.2)'
          }}>
            <Store size={22} color="#F0C674" />
          </div>
          <div>
            <div className="app-title" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <span className="gold-gradient-text">વોઇસ ઉધાર</span>
              <Sparkles size={14} color="#F0C674" />
            </div>
            <div className="app-subtitle">{shopName || 'Voice Udhar'}</div>
          </div>
        </div>

        <button
          type="button"
          onClick={handleOpenSettings}
          style={{
            background: 'rgba(255, 255, 255, 0.06)',
            border: '1px solid rgba(240, 198, 116, 0.3)',
            borderRadius: '10px',
            padding: '0.5rem',
            color: '#F0C674',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          title="સેટિંગ્સ / Settings"
          aria-label="Settings"
        >
          <Settings size={20} />
        </button>
      </motion.header>

      {/* SETTINGS MODAL */}
      <AnimatePresence>
        {showSettingsModal && (
          <div className="modal-overlay" role="dialog" aria-modal="true" style={{ zIndex: 9999 }}>
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ type: 'spring', stiffness: 350, damping: 25 }}
              className="confirmation-card"
              style={{ maxWidth: '420px', width: '90%' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.2rem', fontWeight: '800', color: '#F8FAFC' }}>
                  <Settings size={22} color="#F0C674" />
                  <span>દુકાન સેટિંગ્સ / Shop Settings</span>
                </div>
                <button className="btn-icon" onClick={() => setShowShowSettingsModal(false)} aria-label="Close modal">
                  <X size={22} color="#94A3B8" />
                </button>
              </div>

              {errorMsg && <div className="error-banner">{errorMsg}</div>}
              {savedSuccess && (
                <div className="success-banner" style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                  <Check size={18} />
                  <span>સેવ થયું! / Saved successfully!</span>
                </div>
              )}

              <form onSubmit={handleSaveSettings}>
                <div className="form-group">
                  <label className="form-label" htmlFor="headerUpiId">
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#F8FAFC' }}>
                      <QrCode size={18} color="#F0C674" />
                      UPI ID (ચુકવણી QR કોડ માટે)
                    </span>
                    <span className="form-sublabel">UPI ID for Payment QR Code</span>
                  </label>
                  <input
                    id="headerUpiId"
                    type="text"
                    className="form-input"
                    placeholder="e.g. 9876543210@paytm"
                    value={editUpiId}
                    onChange={(e) => setEditUpiId(e.target.value)}
                    disabled={loading}
                  />
                  <div style={{ fontSize: '0.78rem', color: '#94A3B8', marginTop: '0.35rem' }}>
                    તમારા ગ્રાહકો માટે બિલમાં UPI QR કોડ બનાવવા માટે તમારું UPI ID દાખલ કરો.
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ flex: 1 }}
                    onClick={() => setShowShowSettingsModal(false)}
                    disabled={loading}
                  >
                    રદ કરો / Cancel
                  </button>
                  <button type="submit" className="btn-primary" style={{ flex: 1 }} disabled={loading}>
                    {loading ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
                    <span>સેવ કરો / Save</span>
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
