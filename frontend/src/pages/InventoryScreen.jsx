import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Package, Plus, Edit2, Volume2, VolumeX, RotateCcw, AlertTriangle, CheckCircle2, Trash2, X, Save, Sparkles, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getInventoryApi, addOrUpdateInventoryApi, updateInventoryItemApi, deleteInventoryItemApi } from '../api/inventory';

export default function InventoryScreen() {
  const location = useLocation();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [isSpeaking, setIsSpeaking] = useState(false);

  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);

  // Form states
  const [formData, setFormData] = useState({
    itemName: '',
    quantity: '',
    unit: 'packet',
    lowStockThreshold: '5',
  });
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const shopkeeperId = localStorage.getItem('voice_udhar_shopkeeper_id');

  const fetchInventory = async (isRefresh = false) => {
    if (!shopkeeperId) {
      setError('દુકાનદાર આઈડી મળ્યો નથી. / Shopkeeper ID missing.');
      setLoading(false);
      return;
    }

    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError('');

    try {
      const data = await getInventoryApi(shopkeeperId);
      // Items returned from backend are already sorted with lowStock items first
      setItems(data || []);
    } catch (err) {
      console.error('Error fetching inventory:', err);
      setError(err.message || 'સ્ટોક વિગતો લોડ કરવામાં ભૂલ આવી / Failed to fetch inventory');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchInventory();

    const handleShopChanged = () => {
      fetchInventory();
    };

    window.addEventListener('voice_udhar_shop_changed', handleShopChanged);
    return () => {
      window.removeEventListener('voice_udhar_shop_changed', handleShopChanged);
    };
  }, []);

  const lowStockItems = items.filter((item) => item.isLowStock || Number(item.quantity) <= Number(item.lowStockThreshold || 5));

  // Speech synthesis TTS helper for low-stock items
  const handleReadAloudLowStock = async () => {
    if (!('speechSynthesis' in window)) {
      alert('તમારા બ્રાઉઝરમાં અવાજ ફીચર ઉપલબ્ધ નથી / Text to speech not supported');
      return;
    }

    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }

    if (lowStockItems.length === 0) {
      alert('કોઈ વસ્તુ ખતમ થવાના આરે નથી / No low-stock items found');
      return;
    }

    const itemNamesStr = lowStockItems.map((it) => it.itemName).join(', ');
    const textToSpeak = `${itemNamesStr} ખતમ થવાના છે.`;

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(textToSpeak);

    const getVoices = () => new Promise((resolve) => {
      let voices = window.speechSynthesis.getVoices();
      if (voices && voices.length > 0) return resolve(voices);
      const handleVoices = () => {
        voices = window.speechSynthesis.getVoices();
        window.speechSynthesis.removeEventListener('voiceschanged', handleVoices);
        resolve(voices || []);
      };
      window.speechSynthesis.addEventListener('voiceschanged', handleVoices);
      setTimeout(() => resolve(window.speechSynthesis.getVoices() || []), 800);
    });

    const voices = await getVoices();
    const guVoice = voices.find((v) => v.lang && v.lang.toLowerCase().includes('gu'));
    const hiVoice = voices.find((v) => v.lang && v.lang.toLowerCase().includes('hi'));

    if (guVoice) {
      utterance.voice = guVoice;
      utterance.lang = 'gu-IN';
    } else if (hiVoice) {
      utterance.voice = hiVoice;
      utterance.lang = 'hi-IN';
    } else {
      utterance.lang = 'hi-IN';
    }

    utterance.rate = 0.9;

    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    setIsSpeaking(true);
    window.speechSynthesis.speak(utterance);
  };

  const handleOpenAddModal = () => {
    setFormData({
      itemName: '',
      quantity: '',
      unit: 'packet',
      lowStockThreshold: '5',
    });
    setFormError('');
    setShowAddModal(true);
  };

  const handleOpenEditModal = (item) => {
    setEditingItem(item);
    setFormData({
      itemName: item.itemName || '',
      quantity: (item.quantity !== undefined && item.quantity !== null) ? String(item.quantity) : '0',
      unit: item.unit || 'packet',
      lowStockThreshold: (item.lowStockThreshold !== undefined && item.lowStockThreshold !== null) ? String(item.lowStockThreshold) : '5',
    });
    setFormError('');
  };

  const handleCloseModals = () => {
    setShowAddModal(false);
    setEditingItem(null);
    setFormError('');
  };

  const handleSaveAdd = async (e) => {
    e.preventDefault();
    if (!formData.itemName.trim()) {
      setFormError('વસ્તુનું નામ દાખલ કરો / Enter item name');
      return;
    }

    const qtyNum = Number(formData.quantity);
    if (isNaN(qtyNum) || qtyNum < 0) {
      setFormError('સાચી જથ્થાની રકમ લખો / Enter valid quantity');
      return;
    }

    const threshNum = Number(formData.lowStockThreshold);
    if (isNaN(threshNum) || threshNum < 0) {
      setFormError('સાચી લિમિટ લખો / Enter valid threshold');
      return;
    }

    setSaving(true);
    setFormError('');

    try {
      await addOrUpdateInventoryApi({
        itemName: formData.itemName.trim(),
        quantity: qtyNum,
        unit: formData.unit,
        lowStockThreshold: threshNum,
        mode: 'set',
      });

      handleCloseModals();
      await fetchInventory(true);
    } catch (err) {
      console.error('Error adding inventory item:', err);
      setFormError(err.message || 'ઉમેરવામાં ભૂલ આવી / Failed to add item');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editingItem) return;

    if (!formData.itemName.trim()) {
      setFormError('વસ્તુનું નામ દાખલ કરો / Enter item name');
      return;
    }

    const qtyNum = Number(formData.quantity);
    if (isNaN(qtyNum) || qtyNum < 0) {
      setFormError('સાચી જથ્થાની રકમ લખો / Enter valid quantity');
      return;
    }

    const threshNum = Number(formData.lowStockThreshold);
    if (isNaN(threshNum) || threshNum < 0) {
      setFormError('સાચી લિમિટ લખો / Enter valid threshold');
      return;
    }

    setSaving(true);
    setFormError('');

    try {
      await updateInventoryItemApi(editingItem.itemId, {
        itemName: formData.itemName.trim(),
        quantity: qtyNum,
        unit: formData.unit,
        lowStockThreshold: threshNum,
      });

      handleCloseModals();
      await fetchInventory(true);
    } catch (err) {
      console.error('Error updating inventory item:', err);
      setFormError(err.message || 'અપડેટ કરવામાં ભૂલ આવી / Failed to update item');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteItem = async (itemId) => {
    if (!window.confirm('શું તમે ખરેખર આ વસ્તુ સ્ટોકમાંથી દૂર કરવા માંગો છો? / Are you sure you want to delete this item?')) {
      return;
    }

    try {
      await deleteInventoryItemApi(itemId);
      handleCloseModals();
      await fetchInventory(true);
    } catch (err) {
      alert(err.message || 'દૂર કરવામાં નિષ્ફળ / Failed to delete item');
    }
  };

  return (
    <div className="main-content">
      {/* Title & Top Action Bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', color: '#F8FAFC', fontWeight: '800', fontFamily: "'Outfit', sans-serif" }}>
            સ્ટોક મેનેજમેન્ટ / Inventory
          </h2>
          <p style={{ fontSize: '0.875rem', color: '#94A3B8', marginTop: '0.2rem' }}>
            તમામ વસ્તુઓ અને ઓછો સ્ટોક અલર્ટ / Item stock levels
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <motion.button
            whileTap={{ scale: 0.92 }}
            className="btn-icon"
            style={{
              height: '42px',
              width: '42px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              borderColor: 'rgba(255, 255, 255, 0.12)',
            }}
            onClick={() => fetchInventory(true)}
            disabled={loading || refreshing}
            title="Refresh Inventory"
            aria-label="Refresh Inventory"
          >
            <RotateCcw className={refreshing ? 'animate-spin' : ''} size={20} color="#F0C674" />
          </motion.button>

          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={handleOpenAddModal}
            style={{
              padding: '0.6rem 1rem',
              borderRadius: 'var(--radius-md)',
              border: '1px solid rgba(240, 198, 116, 0.4)',
              background: 'linear-gradient(135deg, #7C3AED 0%, #C026D3 100%)',
              color: '#ffffff',
              fontWeight: '700',
              fontSize: '0.9rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              cursor: 'pointer',
              boxShadow: '0 4px 15px rgba(124, 58, 237, 0.3)',
            }}
          >
            <Plus size={18} color="#F0C674" />
            <span>વસ્તુ ઉમેરો</span>
          </motion.button>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {/* READ ALOUD LOW STOCK BUTTON */}
      {lowStockItems.length > 0 && !loading && (
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={handleReadAloudLowStock}
          style={{
            width: '100%',
            padding: '1rem',
            borderRadius: 'var(--radius-md)',
            border: '1px solid rgba(239, 68, 68, 0.4)',
            background: isSpeaking
              ? 'linear-gradient(135deg, #F43F5E 0%, #E11D48 100%)'
              : 'rgba(239, 68, 68, 0.15)',
            color: '#F8FAFC',
            fontSize: '1.05rem',
            fontWeight: '700',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.6rem',
            cursor: 'pointer',
            boxShadow: '0 4px 15px rgba(239, 68, 68, 0.15)',
            marginBottom: '1.25rem',
            backdropFilter: 'blur(10px)',
          }}
        >
          {isSpeaking ? (
            <>
              <VolumeX size={22} color="#ffffff" />
              <span>અવાજ બંધ કરો / Stop Voice</span>
            </>
          ) : (
            <>
              <Volume2 size={22} color="#FCA5A5" />
              <span>
                બોલકે સુણો: {lowStockItems.length} વસ્તુઓ ખતમ થવાની છે / Read Low Stock
              </span>
            </>
          )}
        </motion.button>
      )}

      {/* Loading State */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4rem 0' }}>
          <Loader2 className="animate-spin" size={44} color="#C026D3" />
          <p style={{ marginTop: '1rem', color: '#94A3B8', fontSize: '1.1rem', fontWeight: '600' }}>
            સ્ટોક લોડ થઈ રહ્યો છે... / Loading inventory...
          </p>
        </div>
      ) : items.length === 0 ? (
        /* Empty State */
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="placeholder-card">
          <div
            style={{
              width: '72px',
              height: '72px',
              background: 'linear-gradient(135deg, rgba(124, 58, 237, 0.25) 0%, rgba(192, 38, 211, 0.25) 100%)',
              color: '#F0C674',
              borderRadius: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 8px 20px rgba(124, 58, 237, 0.2)',
              border: '1px solid rgba(240, 198, 116, 0.3)',
            }}
          >
            <Package size={36} />
          </div>
          <h2 className="placeholder-title">સ્ટોકમાં કોઈ વસ્તુ નથી / Inventory Empty</h2>
          <p className="placeholder-text">
            તમે અવાજ દ્વારા (જેમ કે "5 પેકેટ પાર્લેજી આવ્યું") અથવા પર "+ વસ્તુ ઉમેરો" બટન દ્વારા સ્ટોક ઉમેરી શકો છો.
            <br />
            Add inventory by voice or click "+ વસ્તુ ઉમેરો" to set up manually.
          </p>
          <button
            type="button"
            className="btn-primary"
            style={{ marginTop: '1rem' }}
            onClick={handleOpenAddModal}
          >
            <Plus size={20} />
            નવી વસ્તુ ઉમેરો / Add First Item
          </button>
        </motion.div>
      ) : (
        /* Item Cards List */
        <div className="customer-list">
          {items.map((item, idx) => {
            const isLow = item.isLowStock || Number(item.quantity) <= Number(item.lowStockThreshold || 5);

            return (
              <motion.div
                key={item.itemId || idx}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.22, delay: idx * 0.03 }}
                className="customer-card"
                style={{
                  borderLeft: isLow ? '4px solid #EF4444' : '4px solid #10B981',
                  background: isLow ? 'rgba(239, 68, 68, 0.05)' : 'rgba(255, 255, 255, 0.03)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ flex: 1, paddingRight: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <span className="customer-name" style={{ fontSize: '1.1rem' }}>
                      {item.itemName}
                    </span>

                    {isLow ? (
                      <span
                        style={{
                          fontSize: '0.75rem',
                          fontWeight: '700',
                          padding: '0.2rem 0.55rem',
                          borderRadius: '12px',
                          backgroundColor: 'rgba(239, 68, 68, 0.2)',
                          color: '#FCA5A5',
                          border: '1px solid rgba(239, 68, 68, 0.4)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.25rem',
                        }}
                      >
                        <AlertTriangle size={12} color="#FCA5A5" />
                        ઓછો સ્ટોક / Low Stock
                      </span>
                    ) : (
                      <span
                        style={{
                          fontSize: '0.75rem',
                          fontWeight: '700',
                          padding: '0.2rem 0.55rem',
                          borderRadius: '12px',
                          backgroundColor: 'rgba(16, 185, 129, 0.15)',
                          color: '#34D399',
                          border: '1px solid rgba(52, 211, 153, 0.3)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.25rem',
                        }}
                      >
                        <CheckCircle2 size={12} color="#34D399" />
                        પર્યાપ્ત / Sufficient
                      </span>
                    )}
                  </div>

                  <div style={{ fontSize: '0.8rem', color: '#94A3B8', marginTop: '0.3rem' }}>
                    લિમિટ: {item.lowStockThreshold || 5} {item.unit || 'piece'} | છેલ્લું અપડેટ: {item.lastUpdated ? new Date(item.lastUpdated).toLocaleDateString() : 'નવું'}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div style={{ textAlign: 'right' }}>
                    <div
                      className="number-font"
                      style={{
                        fontSize: '1.35rem',
                        fontWeight: '800',
                        color: isLow ? '#EF4444' : '#34D399',
                      }}
                    >
                      {item.quantity} <span style={{ fontSize: '0.85rem', fontWeight: '600', color: '#94A3B8' }}>{item.unit || 'piece'}</span>
                    </div>
                  </div>

                  <motion.button
                    whileTap={{ scale: 0.9 }}
                    onClick={() => handleOpenEditModal(item)}
                    style={{
                      width: '38px',
                      height: '38px',
                      borderRadius: '10px',
                      backgroundColor: 'rgba(240, 198, 116, 0.12)',
                      border: '1px solid rgba(240, 198, 116, 0.3)',
                      color: '#F0C674',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                    }}
                    title="Edit Item"
                    aria-label={`Edit ${item.itemName}`}
                  >
                    <Edit2 size={18} />
                  </motion.button>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* ADD / EDIT ITEM MODAL */}
      {(showAddModal || editingItem) && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(10, 10, 15, 0.82)',
            backdropFilter: 'blur(10px)',
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="confirmation-card"
            style={{ width: '100%', maxWidth: '440px', position: 'relative' }}
          >
            <button
              type="button"
              onClick={handleCloseModals}
              style={{
                position: 'absolute',
                top: '1rem',
                right: '1rem',
                background: 'transparent',
                border: 'none',
                color: '#94A3B8',
                cursor: 'pointer',
              }}
            >
              <X size={22} />
            </button>

            <h2 style={{ fontSize: '1.25rem', marginBottom: '1.25rem', color: '#F8FAFC', fontWeight: '800' }}>
              {editingItem ? 'વસ્તુની વિગતો સુધારો / Edit Item' : 'નવી વસ્તુ ઉમેરો / Add Item'}
            </h2>

            {formError && <div className="error-banner">{formError}</div>}

            <form onSubmit={editingItem ? handleSaveEdit : handleSaveAdd}>
              <div className="form-group">
                <label className="form-label" htmlFor="itemName">
                  વસ્તુનું નામ
                  <span className="form-sublabel"> Item Name</span>
                </label>
                <input
                  id="itemName"
                  type="text"
                  className="form-input"
                  placeholder="e.g. Parle-G, Amul Doodh, Sugar"
                  value={formData.itemName}
                  onChange={(e) => setFormData({ ...formData, itemName: e.target.value })}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div className="form-group">
                  <label className="form-label" htmlFor="quantity">
                    જથ્થો
                    <span className="form-sublabel"> Quantity</span>
                  </label>
                  <input
                    id="quantity"
                    type="number"
                    min="0"
                    step="any"
                    className="form-input"
                    placeholder="10"
                    value={formData.quantity}
                    onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="unit">
                    એકમ
                    <span className="form-sublabel"> Unit</span>
                  </label>
                  <select
                    id="unit"
                    className="form-select"
                    value={formData.unit}
                    onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                  >
                    <option value="packet">પેકેટ (packet)</option>
                    <option value="piece">પીસ (piece)</option>
                    <option value="kg">કિલો (kg)</option>
                    <option value="gram">ગ્રામ (gram)</option>
                    <option value="liter">લીટર (liter)</option>
                    <option value="box">બોક્સ (box)</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="threshold">
                  ઓછા સ્ટોકની લિમિટ (Alert threshold)
                  <span className="form-sublabel"> Low stock threshold</span>
                </label>
                <input
                  id="threshold"
                  type="number"
                  min="0"
                  className="form-input"
                  placeholder="5"
                  value={formData.lowStockThreshold}
                  onChange={(e) => setFormData({ ...formData, lowStockThreshold: e.target.value })}
                  required
                />
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
                {editingItem && (
                  <button
                    type="button"
                    onClick={() => handleDeleteItem(editingItem.itemId)}
                    style={{
                      padding: '0.75rem',
                      borderRadius: 'var(--radius-md)',
                      backgroundColor: 'rgba(239, 68, 68, 0.15)',
                      border: '1px solid rgba(239, 68, 68, 0.4)',
                      color: '#FCA5A5',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                    title="Delete Item"
                  >
                    <Trash2 size={20} />
                  </button>
                )}

                <button
                  type="button"
                  className="btn-secondary"
                  style={{ flex: 1 }}
                  onClick={handleCloseModals}
                  disabled={saving}
                >
                  રદ કરો
                </button>

                <button
                  type="submit"
                  className="btn-primary"
                  style={{ flex: 1 }}
                  disabled={saving}
                >
                  {saving ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
                  <span>{editingItem ? 'અપડેટ' : 'સાચવો'}</span>
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
}
