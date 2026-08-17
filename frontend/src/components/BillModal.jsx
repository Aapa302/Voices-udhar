import React from 'react';
import { Share2, X, Receipt, Store, User, Calendar, CheckCircle2 } from 'lucide-react';

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
      <div className="bill-modal-card">
        {/* Modal Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.25rem', fontWeight: '700', color: '#0f172a' }}>
            <Receipt size={24} color="#2563eb" />
            બીલ રેસિપ્ટ / Bill Preview
          </div>
          <button className="btn-icon" onClick={onClose} aria-label="Close modal">
            <X size={24} />
          </button>
        </div>

        {/* Paper Receipt Card */}
        <div className="bill-receipt-paper">
          <div className="receipt-shop-name">{shopName}</div>
          <div className="receipt-subtitle">કહ્યું તે જ સેવ થયું / Voice Bill</div>

          <div className="receipt-divider" />

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.95rem', color: '#334155' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <User size={16} color="#64748b" />
              <strong>ગ્રાહક / Customer:</strong> {customerName}
            </div>
            {customerPhone && customerPhone !== '0000000000' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#64748b', fontSize: '0.875rem' }}>
                મોબાઇલ / Phone: {customerPhone}
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#64748b', fontSize: '0.875rem' }}>
              <Calendar size={14} color="#64748b" />
              તારીખ / Date: {date}
            </div>
          </div>

          <div className="receipt-divider" />

          <div style={{ fontSize: '1rem', fontWeight: '700', color: '#0f172a', marginBottom: '0.5rem' }}>
            વસ્તુઓ / Items:
          </div>

          {Array.isArray(items) && items.length > 0 ? (
            <div>
              {items.map((item, idx) => {
                const itemText = typeof item === 'object' ? `${item.name || item.item} - ₹${item.price || item.amount}` : item;
                return (
                  <div key={idx} className="receipt-item-row">
                    <span>{idx + 1}. {itemText}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ fontSize: '0.95rem', color: '#64748b', fontStyle: 'italic' }}>
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
          <button className="btn-whatsapp" onClick={handleWhatsAppShare}>
            <Share2 size={22} />
            WhatsApp પર મોકલો / Send on WhatsApp
          </button>
          <button className="btn-secondary" onClick={onClose}>
            પૂરું થયું / Done
          </button>
        </div>
      </div>
    </div>
  );
}
