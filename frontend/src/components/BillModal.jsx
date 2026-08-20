import React, { useState } from 'react';
import { Share2, X, Receipt, User, Calendar, Sparkles, AlertTriangle, QrCode, PlusCircle, Save, Loader2, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { updateShopkeeperApi } from '../api/shopkeeper';

export default function BillModal({ billData, onClose }) {
  if (!billData) return null;

  const [showUpiPromptModal, setShowUpiPromptModal] = useState(false);
  const [newUpiInput, setNewUpiInput] = useState('');
  const [savingUpi, setSavingUpi] = useState(false);
  const [upiSavedSuccess, setUpiSavedSuccess] = useState(false);
  const [upiError, setUpiError] = useState('');

  const {
    shopName = 'Voice Udhar Shop',
    customerName = 'Valued Customer',
    customerPhone = '',
    totalAmount = 0,
    items = [],
    upiId = '',
    upiQrCodeBase64 = null,
    date = new Date().toLocaleDateString('gu-IN', { year: 'numeric', month: 'short', day: 'numeric' }),
    whatsappShareLink,
  } = billData;

  const handleSaveUpiFromPrompt = async (e) => {
    e.preventDefault();
    setUpiError('');
    setUpiSavedSuccess(false);
    const shopkeeperId = localStorage.getItem('voice_udhar_shopkeeper_id');
    if (!shopkeeperId) return;

    if (!newUpiInput.trim()) {
      setUpiError('મહેરબાની કરીને સાચું UPI ID દાખલ કરો. / Please enter a valid UPI ID.');
      return;
    }

    try {
      setSavingUpi(true);
      await updateShopkeeperApi(shopkeeperId, { upiId: newUpiInput.trim() });
      setUpiSavedSuccess(true);
      setTimeout(() => {
        setShowUpiPromptModal(false);
        setUpiSavedSuccess(false);
      }, 1200);
    } catch (err) {
      console.error('Failed to save UPI ID:', err);
      setUpiError(err.message || 'UPI ID સેવ કરવામાં ભૂલ આવી / Failed to save UPI ID');
    } finally {
      setSavingUpi(false);
    }
  };

  const isDummyPhone = !customerPhone || customerPhone === '0000000000' || customerPhone.trim() === '';

  const handleWhatsAppShare = () => {
    let link = whatsappShareLink;

    if (!link) {
      const itemsSummary = Array.isArray(items) && items.length > 0
        ? items.map(i => typeof i === 'object' ? `${i.name || i.item} (₹${i.price || i.amount || ''})` : i).join(', ')
        : 'Billing Items';

      const whatsappText = `નમસ્તે ${customerName},\nતમારું બિલ - ${shopName}:\nવસ્તુઓ: ${itemsSummary}\nકુલ રકમ: ₹${totalAmount}\nતારીખ: ${date}\nઆભાર!`;
      const encodedText = encodeURIComponent(whatsappText);

      const cleanPhone = customerPhone ? customerPhone.replace(/\D/g, '') : '';
      const phoneWithCountry = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;

      link = phoneWithCountry
        ? `https://wa.me/${phoneWithCountry}?text=${encodedText}`
        : `https://wa.me/?text=${encodedText}`;
    }

    window.open(link, '_blank');
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <motion.div
        initial={{ opacity: 0, scale: 0.85, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9 }}
        transition={{ type: 'spring', stiffness: 350, damping: 25 }}
        className="bill-modal-card"
      >
        {/* Modal Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '1.25rem', fontWeight: '800', color: '#F8FAFC', fontFamily: "'Outfit', sans-serif" }}>
            <div style={{
              width: '38px',
              height: '38px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, rgba(124, 58, 237, 0.3) 0%, rgba(192, 38, 211, 0.3) 100%)',
              border: '1px solid rgba(240, 198, 116, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <Receipt size={22} color="#F0C674" />
            </div>
            <span>બીલ રેસિપ્ટ / Bill Preview</span>
          </div>
          <button className="btn-icon" onClick={onClose} aria-label="Close modal">
            <X size={24} color="#94A3B8" />
          </button>
        </div>

        {/* Paper Receipt Card */}
        <div className="bill-receipt-paper">
          <div className="receipt-shop-name">{shopName}</div>
          <div className="receipt-subtitle" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem' }}>
            <Sparkles size={14} color="#F0C674" fill="#F0C674" />
            <span style={{ color: '#E9D5FF' }}>કહ્યું તે જ સેવ થયું / Voice Bill</span>
          </div>

          <div className="receipt-divider" />

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.95rem', color: '#F8FAFC' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <User size={16} color="#F0C674" />
              <strong>ગ્રાહક / Customer:</strong> {customerName}
            </div>
            {!isDummyPhone ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#94A3B8', fontSize: '0.875rem' }}>
                મોબાઇલ / Phone: {customerPhone}
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#FDA4AF', fontSize: '0.825rem', fontWeight: '600' }}>
                <AlertTriangle size={14} color="#F43F5E" />
                ફોન નંબર મળ્યો નથી / Phone number not captured
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#94A3B8', fontSize: '0.875rem' }}>
              <Calendar size={14} color="#94A3B8" />
              તારીખ / Date: {date}
            </div>
          </div>

          <div className="receipt-divider" />

          <div style={{ fontSize: '1rem', fontWeight: '700', color: '#F0C674', marginBottom: '0.5rem' }}>
            વસ્તુઓ / Items:
          </div>

          {Array.isArray(items) && items.length > 0 ? (
            <div>
              {items.map((item, idx) => {
                const itemText = typeof item === 'object' ? `${item.name || item.item} - ₹${item.price || item.amount}` : item;
                return (
                  <div key={idx} className="receipt-item-row">
                    <span style={{ fontWeight: '500', color: '#F8FAFC' }}>{idx + 1}. {itemText}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ fontSize: '0.95rem', color: '#94A3B8', fontStyle: 'italic', fontWeight: '500' }}>
              રોકડ વેચાણ / Cash Sale
            </div>
          )}

          <div className="receipt-total-box">
            <div className="receipt-total-label">કુલ રકમ / Total:</div>
            <div className="receipt-total-val">₹{totalAmount}</div>
          </div>

          {/* UPI PAYMENT QR CODE SECTION */}
          <div className="receipt-divider" />
          {upiQrCodeBase64 ? (
            <div style={{ textAlign: 'center', margin: '0.75rem 0' }}>
              <div style={{ fontSize: '0.9rem', fontWeight: '700', color: '#F0C674', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem' }}>
                <QrCode size={18} />
                <span>ચુકવણી માટે સ્કેન કરો / Scan to Pay</span>
              </div>
              <div style={{
                display: 'inline-block',
                padding: '8px',
                backgroundColor: '#ffffff',
                borderRadius: '12px',
                boxShadow: '0 4px 15px rgba(0, 0, 0, 0.25)',
                border: '1px solid rgba(240, 198, 116, 0.4)'
              }}>
                <img
                  src={upiQrCodeBase64}
                  alt="UPI QR Code"
                  style={{ width: '150px', height: '150px', display: 'block' }}
                />
              </div>
              {upiId && (
                <div style={{ fontSize: '0.8rem', color: '#CBD5E1', marginTop: '0.4rem', fontWeight: '600' }}>
                  UPI: {upiId}
                </div>
              )}
            </div>
          ) : (
            <div style={{
              margin: '0.75rem 0',
              padding: '0.75rem 0.85rem',
              borderRadius: '10px',
              backgroundColor: 'rgba(240, 198, 116, 0.08)',
              border: '1px dashed rgba(240, 198, 116, 0.3)',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '0.825rem', color: '#CBD5E1', fontWeight: '500', marginBottom: '0.4rem' }}>
                💡 UPI ID ઉમેરો ચુકવણી સરળ બનાવવા / Add UPI ID to enable easy payments
              </div>
              <button
                type="button"
                onClick={() => setShowUpiPromptModal(true)}
                style={{
                  background: 'rgba(240, 198, 116, 0.18)',
                  border: '1px solid rgba(240, 198, 116, 0.4)',
                  color: '#F0C674',
                  padding: '0.35rem 0.75rem',
                  borderRadius: '6px',
                  fontSize: '0.8rem',
                  fontWeight: '700',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem'
                }}
              >
                <PlusCircle size={14} />
                <span>UPI ID ઉમેરો / Add UPI ID</span>
              </button>
            </div>
          )}
        </div>

        {/* UPI ID PROMPT MODAL */}
        <AnimatePresence>
          {showUpiPromptModal && (
            <div className="modal-overlay" role="dialog" aria-modal="true" style={{ zIndex: 10000 }}>
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ type: 'spring', stiffness: 350, damping: 25 }}
                className="confirmation-card"
                style={{ maxWidth: '400px', width: '90%' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.15rem', fontWeight: '800', color: '#F8FAFC' }}>
                    <QrCode size={20} color="#F0C674" />
                    <span>UPI ID ઉમેરો / Add UPI ID</span>
                  </div>
                  <button className="btn-icon" onClick={() => setShowUpiPromptModal(false)} aria-label="Close modal">
                    <X size={20} color="#94A3B8" />
                  </button>
                </div>

                {upiError && <div className="error-banner">{upiError}</div>}
                {upiSavedSuccess && (
                  <div className="success-banner" style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}>
                    <Check size={18} />
                    <span>UPI ID સેવ થયું! / UPI ID Saved!</span>
                  </div>
                )}

                <form onSubmit={handleSaveUpiFromPrompt}>
                  <div className="form-group">
                    <label className="form-label" htmlFor="billUpiInput">
                      તમારું UPI ID (e.g. 9876543210@paytm)
                    </label>
                    <input
                      id="billUpiInput"
                      type="text"
                      className="form-input"
                      placeholder="e.g. shopname@upi"
                      value={newUpiInput}
                      onChange={(e) => setNewUpiInput(e.target.value)}
                      disabled={savingUpi}
                    />
                  </div>

                  <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem' }}>
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ flex: 1 }}
                      onClick={() => setShowUpiPromptModal(false)}
                      disabled={savingUpi}
                    >
                      રદ કરો / Cancel
                    </button>
                    <button type="submit" className="btn-primary" style={{ flex: 1 }} disabled={savingUpi}>
                      {savingUpi ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                      <span>સેવ કરો / Save</span>
                    </button>
                  </div>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Action Buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {isDummyPhone ? (
            <div style={{
              padding: '0.85rem 1rem',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'rgba(244, 63, 94, 0.12)',
              border: '1px solid rgba(244, 63, 94, 0.3)',
              color: '#FDA4AF',
              fontSize: '0.875rem',
              fontWeight: '600',
              textAlign: 'center',
              lineHeight: '1.4'
            }}>
              ⚠️ WhatsApp પર મોકલવા માટે ગ્રાહકનો સાચો ફોન નંબર ઉમેરો.
              <br />
              Please add customer's real phone number first to share on WhatsApp.
            </div>
          ) : (
            <motion.button whileTap={{ scale: 0.98 }} className="btn-whatsapp" onClick={handleWhatsAppShare}>
              <Share2 size={22} />
              WhatsApp પર મોકલો / Send on WhatsApp
            </motion.button>
          )}
          <motion.button whileTap={{ scale: 0.98 }} className="btn-secondary" onClick={onClose}>
            પૂરું થયું / Done
          </motion.button>
        </div>
      </motion.div>
    </div>
  );
}
