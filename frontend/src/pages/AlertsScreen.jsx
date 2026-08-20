import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Phone, ChevronRight, RotateCcw, Loader2, MessageCircle, Clock, TrendingUp, CheckCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { getCustomerAlerts } from '../api/customers';

export default function AlertsScreen() {
  const navigate = useNavigate();
  const [alerts, setAlerts] = useState({ highAmount: [], longPending: [] });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const fetchAlertsList = async (isRefresh = false) => {
    const shopkeeperId = localStorage.getItem('voice_udhar_shopkeeper_id');
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
      const data = await getCustomerAlerts(shopkeeperId, 15);
      setAlerts(data || { highAmount: [], longPending: [] });
    } catch (err) {
      console.error('Error fetching alerts:', err);
      setError(err.message || 'અલર્ટ્સ લોડ કરવામાં ભૂલ આવી / Failed to fetch alerts');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchAlertsList();

    const handleShopChanged = () => {
      fetchAlertsList();
    };

    window.addEventListener('voice_udhar_shop_changed', handleShopChanged);
    return () => {
      window.removeEventListener('voice_udhar_shop_changed', handleShopChanged);
    };
  }, []);

  const openWhatsApp = (e, customer) => {
    e.stopPropagation(); // prevent navigating to customer detail
    if (!customer || !customer.phone || customer.phone === '0000000000') return;

    const cleanPhone = customer.phone.replace(/\D/g, '');
    const formattedPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
    const message = `નમસ્તે ${customer.name}જી, આપનું ₹${customer.totalUdhaar} નું ઉધાર બાકી છે. કૃપા કરીને વહેલી તકે જમા કરાવવા વિનંતી. / Namaste ${customer.name} ji, your pending balance is ₹${customer.totalUdhaar}. Please clear it at your earliest convenience.`;

    const waUrl = `https://wa.me/${formattedPhone}?text=${encodeURIComponent(message)}`;
    window.open(waUrl, '_blank', 'noopener,noreferrer');
  };

  const renderCustomerCard = (customer, isLongPending = false, index = 0) => {
    const udhaarVal = Number(customer.totalUdhaar) || 0;
    const hasRealPhone = customer.phone && customer.phone !== '0000000000';

    return (
      <motion.div
        key={`${customer.customerId}-${isLongPending ? 'lp' : 'ha'}`}
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, delay: index * 0.04 }}
        whileTap={{ scale: 0.98 }}
        className="customer-card high-udhaar"
        onClick={() => navigate(`/customers/${customer.customerId}`, { state: { customer } })}
        style={{
          borderLeft: isLongPending ? '4px solid #EF4444' : '4px solid #F59E0B',
          position: 'relative',
        }}
      >
        <div className="customer-info" style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span className="customer-name">{customer.name}</span>
            {isLongPending && (
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
                <Clock size={12} color="#FCA5A5" />
                {customer.daysSinceLastActivity} દિવસ પહેલા / {customer.daysSinceLastActivity}d ago
              </span>
            )}
          </div>

          {hasRealPhone ? (
            <div className="customer-phone">
              <Phone size={14} color="#94A3B8" />
              {customer.phone}
            </div>
          ) : (
            <div className="customer-phone" style={{ color: '#FDA4AF', fontSize: '0.78rem' }}>
              <AlertTriangle size={12} color="#F43F5E" />
              નંબર નથી / Phone not captured
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <div className="udhaar-amount-badge">
            <div className="udhaar-amount-val has-udhaar">₹{udhaarVal}</div>
            <div className="udhaar-label">બાકી ઉધાર</div>
          </div>

          {hasRealPhone && (
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={(e) => openWhatsApp(e, customer)}
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '12px',
                backgroundColor: 'rgba(34, 197, 94, 0.15)',
                border: '1px solid rgba(34, 197, 94, 0.4)',
                color: '#4ADE80',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
              title="WhatsApp પર મેસેજ મોકલો / Send WhatsApp Message"
              aria-label={`Send WhatsApp message to ${customer.name}`}
            >
              <MessageCircle size={20} color="#4ADE80" />
            </motion.button>
          )}

          <ChevronRight size={20} color="#64748B" />
        </div>
      </motion.div>
    );
  };

  const hasHighAmount = alerts.highAmount && alerts.highAmount.length > 0;
  const hasLongPending = alerts.longPending && alerts.longPending.length > 0;
  const isEmpty = !hasHighAmount && !hasLongPending;

  return (
    <div className="main-content">
      {/* Title & Refresh Controls */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
        <div>
          <h2 style={{ fontSize: '1.4rem', color: '#F8FAFC', fontWeight: '800', fontFamily: "'Outfit', sans-serif" }}>
            બાકી ઉધાર અલર્ટ્સ / Udhaar Alerts
          </h2>
          <p style={{ fontSize: '0.875rem', color: '#94A3B8', marginTop: '0.2rem' }}>
            વધુ રકમ અને લાંબા સમયથી બાકી ઉધાર ગ્રાહકો / Priority follow-up list
          </p>
        </div>

        <motion.button
          whileTap={{ scale: 0.92 }}
          className="btn-icon"
          style={{
            height: '44px',
            width: '44px',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'rgba(255, 255, 255, 0.05)',
            borderColor: 'rgba(255, 255, 255, 0.12)',
          }}
          onClick={() => fetchAlertsList(true)}
          disabled={loading || refreshing}
          title="Refresh Alerts"
          aria-label="Refresh Alerts List"
        >
          <RotateCcw className={refreshing ? 'animate-spin' : ''} size={20} color="#F0C674" />
        </motion.button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {/* Loading State */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4rem 0' }}>
          <Loader2 className="animate-spin" size={44} color="#C026D3" />
          <p style={{ marginTop: '1rem', color: '#94A3B8', fontSize: '1.1rem', fontWeight: '600' }}>
            અલર્ટ્સ લોડ થઈ રહ્યા છે... / Loading alerts...
          </p>
        </div>
      ) : isEmpty ? (
        /* Empty State */
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="placeholder-card">
          <div
            style={{
              width: '72px',
              height: '72px',
              background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.25) 0%, rgba(5, 150, 105, 0.25) 100%)',
              color: '#34D399',
              borderRadius: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 8px 20px rgba(16, 185, 129, 0.2)',
              border: '1px solid rgba(52, 211, 153, 0.3)',
            }}
          >
            <CheckCircle size={36} />
          </div>
          <h2 className="placeholder-title">કોઈ અર્જન્ટ અલર્ટ નથી / All Clear!</h2>
          <p className="placeholder-text">
            તમામ ઉધાર નિયમિત છે અથવા કોઈ વધુ દિવસોથી બાકી રકમ નથી.
            <br />
            No urgent or long-pending udhaar balances found.
          </p>
        </motion.div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
          {/* Section 2: Long Pending (Displayed first if present to highlight urgency) */}
          {hasLongPending && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.85rem' }}>
                <Clock size={20} color="#EF4444" />
                <h3 style={{ fontSize: '1.15rem', color: '#F8FAFC', fontWeight: '800', fontFamily: "'Outfit', sans-serif" }}>
                  લાંબા સમયથી બાકી / Long Pending (15+ Days)
                </h3>
              </div>
              <div className="customer-list">
                {alerts.longPending.map((customer, idx) => renderCustomerCard(customer, true, idx))}
              </div>
            </div>
          )}

          {/* Section 1: Highest Pending */}
          {hasHighAmount && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.85rem' }}>
                <TrendingUp size={20} color="#F59E0B" />
                <h3 style={{ fontSize: '1.15rem', color: '#F8FAFC', fontWeight: '800', fontFamily: "'Outfit', sans-serif" }}>
                  સૌથી વધુ ઉધાર / Highest Pending
                </h3>
              </div>
              <div className="customer-list">
                {alerts.highAmount.map((customer, idx) => renderCustomerCard(customer, false, idx))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
