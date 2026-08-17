import React from 'react';
import { Share2, X, Receipt, User, Calendar, Sparkles, AlertTriangle } from 'lucide-react';
import { motion } from 'framer-motion';

export default function BillModal({ billData, onClose }) {
  if (!billData) return null;

  const {
    shopName = 'Voice Udhar Shop',
    customerName = 'Valued Customer',
    customerPhone = '',
    totalAmount = 0,
    items = [],
    date = new Date().toLocaleDateString('gu-IN', { year: 'numeric', month: 'short', day: 'numeric' }),
    whatsappShareLink,
  } = billData;

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
        </div>

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
