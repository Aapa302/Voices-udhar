import React, { useState, useEffect } from 'react';
import { Store, Sparkles, Settings, QrCode, X, Save, Loader2, Check, Download, FileSpreadsheet, FileText, ChevronDown, Plus, PlusCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getShopkeeperApi, updateShopkeeperApi } from '../api/shopkeeper';
import { getShopsApi, createShopApi } from '../api/shops';
import { downloadDataExportApi } from '../api/export';

export default function Header({ shopName: initialShopName }) {
  const [shops, setShops] = useState([]);
  const [currentShop, setCurrentShop] = useState(null);
  const [showShopDropdown, setShowShopDropdown] = useState(false);

  const [showNewShopModal, setShowNewShopModal] = useState(false);
  const [newShopNameInput, setNewShopNameInput] = useState('');
  const [newShopUpiInput, setNewShopUpiInput] = useState('');
  const [creatingShop, setCreatingShop] = useState(false);

  const [showSettingsModal, setShowShowSettingsModal] = useState(false);
  const [editUpiId, setEditUpiId] = useState('');
  const [loading, setLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(null); // 'excel' | 'pdf' | null
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const loadShops = async () => {
    const shopkeeperId = localStorage.getItem('voice_udhar_shopkeeper_id');
    if (!shopkeeperId) return;

    try {
      const res = await getShopsApi();
      const shopList = (res && res.data) || [];
      setShops(shopList);

      if (shopList.length > 0) {
        const savedShopId = localStorage.getItem('voice_udhar_shop_id');
        const active = shopList.find((s) => s.shopId === savedShopId) || shopList[0];
        setCurrentShop(active);
        localStorage.setItem('voice_udhar_shop_id', active.shopId);
        localStorage.setItem('voice_udhar_shop_name', active.shopName);
      }
    } catch (err) {
      console.warn('Error loading shops:', err.message);
    }
  };

  useEffect(() => {
    loadShops();
  }, []);

  const handleSelectShop = (shop) => {
    if (!shop) return;
    setCurrentShop(shop);
    localStorage.setItem('voice_udhar_shop_id', shop.shopId);
    localStorage.setItem('voice_udhar_shop_name', shop.shopName);
    setShowShopDropdown(false);
    window.dispatchEvent(new Event('voice_udhar_shop_changed'));
  };

  const handleCreateNewShop = async (e) => {
    e.preventDefault();
    if (!newShopNameInput.trim()) return;

    try {
      setCreatingShop(true);
      setErrorMsg('');
      const res = await createShopApi({
        shopName: newShopNameInput.trim(),
        upiId: newShopUpiInput.trim(),
      });

      const newShop = (res && res.data) || res;
      if (newShop && newShop.shopId) {
        setNewShopNameInput('');
        setNewShopUpiInput('');
        setShowNewShopModal(false);
        setShowShopDropdown(false);

        // Reload shop list and switch to newly created shop
        await loadShops();
        handleSelectShop(newShop);
      }
    } catch (err) {
      console.error('Error creating new shop:', err);
      setErrorMsg(err.message || 'નવી દુકાન બનાવવામાં નિષ્ફળ / Failed to create new shop');
    } finally {
      setCreatingShop(false);
    }
  };

  const handleExportData = async (format) => {
    const shopkeeperId = localStorage.getItem('voice_udhar_shopkeeper_id');
    if (!shopkeeperId) return;
    setErrorMsg('');
    try {
      setExportLoading(format);
      await downloadDataExportApi(shopkeeperId, format);
    } catch (err) {
      console.error('Export failed:', err);
      setErrorMsg(err.message || 'ડેટા ડાઉનલોડ કરવામાં નિષ્ફળ / Failed to download data');
    } finally {
      setExportLoading(null);
    }
  };

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

            {/* SHOP SELECTOR DROPDOWN BUTTON */}
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => setShowShopDropdown(!showShopDropdown)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  padding: 0,
                  color: '#CBD5E1',
                  fontSize: '0.85rem',
                  fontWeight: '700',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                  marginTop: '1px'
                }}
              >
                <span>{currentShop ? currentShop.shopName : (initialShopName || 'Voice Udhar')}</span>
                <ChevronDown size={14} color="#F0C674" />
              </button>

              {/* DROPDOWN MENU */}
              <AnimatePresence>
                {showShopDropdown && (
                  <motion.div
                    initial={{ opacity: 0, y: 5, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 5, scale: 0.95 }}
                    style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      marginTop: '0.4rem',
                      width: '210px',
                      backgroundColor: 'rgba(20, 20, 30, 0.96)',
                      border: '1px solid rgba(240, 198, 116, 0.35)',
                      borderRadius: '12px',
                      boxShadow: '0 10px 30px rgba(0, 0, 0, 0.5)',
                      backdropFilter: 'blur(16px)',
                      zIndex: 999,
                      padding: '0.4rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.2rem'
                    }}
                  >
                    <div style={{ fontSize: '0.725rem', color: '#94A3B8', fontWeight: '700', padding: '0.3rem 0.5rem' }}>
                      તમારી દુકાનો / Your Shops:
                    </div>

                    {shops.map((s) => {
                      const isSelected = currentShop && currentShop.shopId === s.shopId;
                      return (
                        <button
                          key={s.shopId}
                          type="button"
                          onClick={() => handleSelectShop(s)}
                          style={{
                            width: '100%',
                            textAlign: 'left',
                            padding: '0.45rem 0.6rem',
                            borderRadius: '8px',
                            border: isSelected ? '1px solid rgba(240, 198, 116, 0.5)' : '1px solid transparent',
                            backgroundColor: isSelected ? 'rgba(240, 198, 116, 0.18)' : 'transparent',
                            color: isSelected ? '#F0C674' : '#F8FAFC',
                            fontWeight: isSelected ? '800' : '600',
                            fontSize: '0.85rem',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between'
                          }}
                        >
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {s.shopName}
                          </span>
                          {isSelected && <Check size={14} color="#F0C674" />}
                        </button>
                      );
                    })}

                    <div style={{ borderTop: '1px dashed rgba(255, 255, 255, 0.15)', margin: '0.3rem 0' }} />

                    <button
                      type="button"
                      onClick={() => {
                        setShowShopDropdown(false);
                        setShowNewShopModal(true);
                      }}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        padding: '0.5rem 0.6rem',
                        borderRadius: '8px',
                        border: '1px solid rgba(124, 58, 237, 0.4)',
                        backgroundColor: 'rgba(124, 58, 237, 0.2)',
                        color: '#C084FC',
                        fontWeight: '800',
                        fontSize: '0.825rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.35rem'
                      }}
                    >
                      <PlusCircle size={15} />
                      <span>+ નવી દુકાન ઉમેરો / Add Shop</span>
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
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

      {/* ADD NEW SHOP MODAL */}
      <AnimatePresence>
        {showNewShopModal && (
          <div className="modal-overlay" role="dialog" aria-modal="true" style={{ zIndex: 10000 }}>
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
                  <Store size={22} color="#F0C674" />
                  <span>નવી દુકાન ઉમેરો / Add New Shop</span>
                </div>
                <button className="btn-icon" onClick={() => setShowNewShopModal(false)} aria-label="Close modal">
                  <X size={22} color="#94A3B8" />
                </button>
              </div>

              {errorMsg && <div className="error-banner">{errorMsg}</div>}

              <form onSubmit={handleCreateNewShop}>
                <div className="form-group">
                  <label className="form-label" htmlFor="newShopName">
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#F8FAFC' }}>
                      <Store size={18} color="#F0C674" />
                      દુકાનનું નામ
                    </span>
                    <span className="form-sublabel">Shop Name</span>
                  </label>
                  <input
                    id="newShopName"
                    type="text"
                    className="form-input"
                    placeholder="દા.ત. મારુતિ જનરલ સ્ટોર્સ"
                    value={newShopNameInput}
                    onChange={(e) => setNewShopNameInput(e.target.value)}
                    disabled={creatingShop}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="newShopUpi">
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#F8FAFC' }}>
                      <QrCode size={18} color="#F0C674" />
                      UPI ID (ચુકવણી QR કોડ માટે - Optional)
                    </span>
                    <span className="form-sublabel">UPI ID for Payment QR Code</span>
                  </label>
                  <input
                    id="newShopUpi"
                    type="text"
                    className="form-input"
                    placeholder="e.g. 9876543210@paytm"
                    value={newShopUpiInput}
                    onChange={(e) => setNewShopUpiInput(e.target.value)}
                    disabled={creatingShop}
                  />
                </div>

                <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ flex: 1 }}
                    onClick={() => setShowNewShopModal(false)}
                    disabled={creatingShop}
                  >
                    રદ કરો / Cancel
                  </button>
                  <button type="submit" className="btn-primary" style={{ flex: 1 }} disabled={creatingShop}>
                    {creatingShop ? <Loader2 className="animate-spin" size={20} /> : <Plus size={20} />}
                    <span>ઉમેરો / Create Shop</span>
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

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

              {/* DATA EXPORT SECTION IN SETTINGS */}
              <div style={{ marginTop: '1.5rem', paddingTop: '1.25rem', borderTop: '1px dashed rgba(255, 255, 255, 0.15)' }}>
                <div style={{ fontSize: '0.95rem', fontWeight: '700', color: '#F8FAFC', marginBottom: '0.6rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Download size={18} color="#F0C674" />
                  <span>ડેટા ડાઉનલોડ કરો / Export Data</span>
                </div>
                <div style={{ fontSize: '0.8rem', color: '#94A3B8', marginBottom: '0.85rem' }}>
                  તમારો ગ્રાહક અને ટ્રાન્ઝેક્શન ડેટા Excel અથવા PDF ફાઇલમાં ડાઉનલોડ કરો.
                </div>

                <div style={{ display: 'flex', gap: '0.6rem' }}>
                  <motion.button
                    whileTap={{ scale: 0.96 }}
                    type="button"
                    onClick={() => handleExportData('excel')}
                    disabled={exportLoading !== null}
                    style={{
                      flex: 1,
                      padding: '0.65rem 0.5rem',
                      borderRadius: '8px',
                      border: '1px solid rgba(34, 197, 94, 0.4)',
                      backgroundColor: 'rgba(34, 197, 94, 0.15)',
                      color: '#4ADE80',
                      fontWeight: '700',
                      fontSize: '0.825rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.35rem',
                    }}
                  >
                    {exportLoading === 'excel' ? <Loader2 className="animate-spin" size={16} /> : <FileSpreadsheet size={16} />}
                    <span>Excel ડાઉનલોડ કરો</span>
                  </motion.button>

                  <motion.button
                    whileTap={{ scale: 0.96 }}
                    type="button"
                    onClick={() => handleExportData('pdf')}
                    disabled={exportLoading !== null}
                    style={{
                      flex: 1,
                      padding: '0.65rem 0.5rem',
                      borderRadius: '8px',
                      border: '1px solid rgba(244, 63, 94, 0.4)',
                      backgroundColor: 'rgba(244, 63, 94, 0.15)',
                      color: '#FDA4AF',
                      fontWeight: '700',
                      fontSize: '0.825rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.35rem',
                    }}
                  >
                    {exportLoading === 'pdf' ? <Loader2 className="animate-spin" size={16} /> : <FileText size={16} />}
                    <span>PDF ડાઉનલોડ કરો</span>
                  </motion.button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
