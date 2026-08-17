import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Loader2, Calendar, ShoppingBag, Receipt, RotateCcw, FileText } from 'lucide-react';
import { motion } from 'framer-motion';
import { getTransactionsByCustomer } from '../api/transactions';
import { getCustomerDetail } from '../api/customers';
import { generateBillApi } from '../api/bill';
import BillModal from '../components/BillModal';

// Map transaction type to human readable label
const getActionLabel = (txType) => {
  switch (txType) {
    case 'udhaar_add':
      return { gu: 'ઉધાર ઉમેર્યા', en: 'Udhaar Added', badgeClass: 'udhaar_add' };
    case 'udhaar_paid':
      return { gu: 'ઉધાર જમા કર્યા', en: 'Paid Back', badgeClass: 'udhaar_paid' };
    case 'sale':
      return { gu: 'રોકડ વેચાણ', en: 'Cash Sale', badgeClass: 'sale' };
    default:
      return { gu: 'ટ્રાન્ઝેક્શન', en: 'Transaction', badgeClass: 'sale' };
  }
};

export default function CustomerHistoryScreen() {
  const { customerId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  // Customer state initialized from navigation state or loaded from API
  const [customer, setCustomer] = useState(location.state?.customer || null);

  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [billModalData, setBillModalData] = useState(null);
  const [loadingBillTxId, setLoadingBillTxId] = useState(null);

  const fetchCustomer = async () => {
    if (!customerId) return;
    try {
      const custData = await getCustomerDetail(customerId);
      if (custData) {
        setCustomer(custData);
      }
    } catch (err) {
      console.error('Error fetching customer detail:', err);
    }
  };

  const fetchHistory = async () => {
    if (!customerId) return;
    setLoading(true);
    setError('');

    try {
      const data = await getTransactionsByCustomer(customerId);
      // Sort chronologically (most recent first)
      const sorted = [...data].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      setTransactions(sorted);
    } catch (err) {
      console.error('Error fetching transaction history:', err);
      setError(err.message || 'ટ્રાન્ઝેક્શન હિસ્ટ્રી લોડ કરવામાં ભૂલ આવી / Failed to fetch transaction history');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomer();
    fetchHistory();
  }, [customerId]);

  const handleRefresh = () => {
    fetchCustomer();
    fetchHistory();
  };

  const handleViewBill = async (tx) => {
    const shopkeeperId = localStorage.getItem('voice_udhar_shopkeeper_id');
    setLoadingBillTxId(tx.transactionId);

    try {
      const bill = await generateBillApi({
        shopkeeperId,
        customerId: tx.customerId,
        customerName: customer?.name || 'Valued Customer',
        customerPhone: customer?.phone || '',
        items: tx.items || [],
        totalAmount: tx.amount,
      });

      setBillModalData(bill);
    } catch (err) {
      console.error('Failed to view bill:', err);
      alert('બિલ બનાવવામાં સમસ્યા આવી. / Error generating bill preview.');
    } finally {
      setLoadingBillTxId(null);
    }
  };

  const formatDate = (isoString) => {
    if (!isoString) return '';
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString('gu-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="main-content">
      {/* BILL MODAL PREVIEW */}
      {billModalData && (
        <BillModal billData={billModalData} onClose={() => setBillModalData(null)} />
      )}

      {/* Back Button & Title Header */}
      <div className="history-header">
        <motion.button whileTap={{ scale: 0.95 }} className="back-button" onClick={() => navigate('/customers')}>
          <ArrowLeft size={20} color="#F0C674" />
          <span>પાછા જાઓ / Back</span>
        </motion.button>
        <motion.button
          whileTap={{ scale: 0.92 }}
          className="btn-icon"
          onClick={handleRefresh}
          title="Refresh"
          style={{
            marginLeft: 'auto',
            backgroundColor: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            borderRadius: '10px'
          }}
        >
          <RotateCcw size={20} color="#F0C674" />
        </motion.button>
      </div>

      {/* Customer Summary Card */}
      {customer && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="customer-summary-card">
          <div>
            <h2 style={{ fontSize: '1.4rem', color: '#F8FAFC', letterSpacing: '-0.01em', fontFamily: "'Outfit', sans-serif" }}>
              {customer.name}
            </h2>
            {customer.phone && customer.phone !== '0000000000' ? (
              <p style={{ color: '#94A3B8', fontSize: '0.95rem', marginTop: '0.2rem', fontWeight: '500' }}>
                {customer.phone}
              </p>
            ) : (
              <p style={{ color: '#F43F5E', fontSize: '0.825rem', marginTop: '0.2rem', fontWeight: '500' }}>
                ⚠️ ફોન નંબર મળ્યો નથી / Phone number not captured
              </p>
            )}
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.825rem', color: '#94A3B8', fontWeight: '700' }}>કુલ બાકી / Total Udhaar</div>
            <div
              className="number-font"
              style={{
                fontSize: '1.7rem',
                fontWeight: '900',
                color: Number(customer.totalUdhaar) > 0 ? '#F97316' : '#10B981'
              }}
            >
              ₹{Number(customer.totalUdhaar) || 0}
            </div>
          </div>
        </motion.div>
      )}

      {error && <div className="error-banner">{error}</div>}

      {/* Loading State */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4rem 0' }}>
          <Loader2 className="animate-spin" size={44} color="#C026D3" />
          <p style={{ marginTop: '1rem', color: '#94A3B8', fontSize: '1.1rem', fontWeight: '600' }}>
            હિસ્ટ્રી લોડ થઈ રહી છે... / Loading history...
          </p>
        </div>
      ) : transactions.length === 0 ? (
        /* Empty State */
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="placeholder-card">
          <div style={{
            width: '72px',
            height: '72px',
            background: 'linear-gradient(135deg, rgba(124, 58, 237, 0.25) 0%, rgba(192, 38, 211, 0.25) 100%)',
            color: '#F0C674',
            borderRadius: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 8px 20px rgba(124, 58, 237, 0.2)',
            border: '1px solid rgba(240, 198, 116, 0.3)'
          }}>
            <Receipt size={36} />
          </div>
          <h2 className="placeholder-title">કોઈ ટ્રાન્ઝેક્શન મળ્યું નથી</h2>
          <p className="placeholder-text">
            આ ગ્રાહક માટે હજી કોઈ ટ્રાન્ઝેક્શન સેવ થયું નથી.
            <br />
            No transaction history found for this customer.
          </p>
        </motion.div>
      ) : (
        /* Transaction History List */
        <div>
          <h3 style={{ fontSize: '1.15rem', marginBottom: '1rem', color: '#F8FAFC', fontFamily: "'Outfit', sans-serif" }}>
            ટ્રાન્ઝેક્શન હિસ્ટ્રી / Transaction History
          </h3>
          {transactions.map((tx, index) => {
            const actionInfo = getActionLabel(tx.type);
            const isUdhaarAdd = tx.type === 'udhaar_add';

            return (
              <motion.div
                key={tx.transactionId}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: index * 0.04 }}
                className="transaction-card"
              >
                <div className="transaction-top">
                  <span className={`action-badge ${actionInfo.badgeClass}`}>
                    {actionInfo.gu} / {actionInfo.en}
                  </span>
                  <div className="transaction-amount number-font" style={{ color: isUdhaarAdd ? '#F97316' : '#10B981' }}>
                    {isUdhaarAdd ? '+' : '-'}₹{tx.amount}
                  </div>
                </div>

                <div className="transaction-date" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Calendar size={14} color="#94A3B8" />
                  {formatDate(tx.timestamp)}
                </div>

                {tx.items && tx.items.length > 0 && (
                  <div className="transaction-items">
                    <span style={{ fontWeight: '700', display: 'inline-flex', alignItems: 'center', gap: '0.3rem', color: '#F0C674' }}>
                      <ShoppingBag size={14} /> વસ્તૂઓ / Items:
                    </span>{' '}
                    {tx.items.join(', ')}
                  </div>
                )}

                {tx.rawVoiceText && (
                  <div style={{ fontSize: '0.825rem', color: '#64748B', fontStyle: 'italic', marginTop: '0.2rem' }}>
                    "{tx.rawVoiceText}"
                  </div>
                )}

                <div style={{ marginTop: '0.5rem', display: 'flex', justifyContent: 'flex-end' }}>
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    className="btn-secondary"
                    style={{
                      padding: '0.4rem 0.9rem',
                      fontSize: '0.875rem',
                      minHeight: '38px',
                      width: 'auto',
                      fontWeight: '700',
                      borderColor: 'rgba(240, 198, 116, 0.3)',
                      color: '#F0C674',
                      background: 'rgba(240, 198, 116, 0.08)'
                    }}
                    onClick={() => handleViewBill(tx)}
                    disabled={loadingBillTxId === tx.transactionId}
                  >
                    {loadingBillTxId === tx.transactionId ? (
                      <Loader2 className="animate-spin" size={16} />
                    ) : (
                      <FileText size={16} color="#F0C674" />
                    )}
                    બીલ જુઓ / Bill Dekho
                  </motion.button>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
