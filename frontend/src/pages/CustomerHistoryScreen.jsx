import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Loader2, Calendar, ShoppingBag, Receipt, RotateCcw, FileText } from 'lucide-react';
import { motion } from 'framer-motion';
import { getTransactionsByCustomer } from '../api/transactions';
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

  // Customer state passed from navigation state or loaded
  const customerFromState = location.state?.customer;

  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [billModalData, setBillModalData] = useState(null);
  const [loadingBillTxId, setLoadingBillTxId] = useState(null);

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
    fetchHistory();
  }, [customerId]);

  const handleViewBill = async (tx) => {
    const shopkeeperId = localStorage.getItem('voice_udhar_shopkeeper_id');
    setLoadingBillTxId(tx.transactionId);

    try {
      const bill = await generateBillApi({
        shopkeeperId,
        customerId: tx.customerId,
        customerName: customerFromState?.name || 'Valued Customer',
        customerPhone: customerFromState?.phone || '',
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
          <ArrowLeft size={20} color="#4C1D95" />
          પાછા જાઓ / Back
        </motion.button>
        <motion.button whileTap={{ scale: 0.92 }} className="btn-icon" onClick={fetchHistory} title="Refresh" style={{ marginLeft: 'auto', backgroundColor: '#ffffff', border: '1px solid var(--border-color)', borderRadius: '10px' }}>
          <RotateCcw size={20} color="#6D28D9" />
        </motion.button>
      </div>

      {/* Customer Summary Card */}
      {customerFromState && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="customer-summary-card">
          <div>
            <h2 style={{ fontSize: '1.4rem', color: '#0F172A', letterSpacing: '-0.01em' }}>{customerFromState.name}</h2>
            {customerFromState.phone && customerFromState.phone !== '0000000000' && (
              <p style={{ color: '#64748B', fontSize: '0.95rem', marginTop: '0.2rem', fontWeight: '500' }}>
                {customerFromState.phone}
              </p>
            )}
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.825rem', color: '#64748B', fontWeight: '700' }}>કુલ બાકી / Total Udhaar</div>
            <div style={{
              fontSize: '1.6rem',
              fontWeight: '800',
              color: Number(customerFromState.totalUdhaar) > 0 ? '#F97316' : '#10B981'
            }}>
              ₹{Number(customerFromState.totalUdhaar) || 0}
            </div>
          </div>
        </motion.div>
      )}

      {error && <div className="error-banner">{error}</div>}

      {/* Loading State */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '3rem 0' }}>
          <Loader2 className="animate-spin" size={44} color="#6D28D9" />
          <p style={{ marginTop: '1rem', color: '#64748B', fontSize: '1.1rem', fontWeight: '600' }}>
            હિસ્ટ્રી લોડ થઈ રહી છે... / Loading history...
          </p>
        </div>
      ) : transactions.length === 0 ? (
        /* Empty State */
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="placeholder-card">
          <div style={{
            width: '72px',
            height: '72px',
            background: 'linear-gradient(135deg, #F3E8FF 0%, #EDE9FE 100%)',
            color: '#6D28D9',
            borderRadius: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 8px 20px rgba(109, 40, 217, 0.12)'
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
          <h3 style={{ fontSize: '1.15rem', marginBottom: '1rem', color: '#0F172A' }}>
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
                  <div className="transaction-amount" style={{ color: isUdhaarAdd ? '#F97316' : '#10B981' }}>
                    {isUdhaarAdd ? '+' : '-'}₹{tx.amount}
                  </div>
                </div>

                <div className="transaction-date" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Calendar size={14} color="#64748B" />
                  {formatDate(tx.timestamp)}
                </div>

                {tx.items && tx.items.length > 0 && (
                  <div className="transaction-items">
                    <span style={{ fontWeight: '700', display: 'inline-flex', alignItems: 'center', gap: '0.3rem', color: '#4C1D95' }}>
                      <ShoppingBag size={14} /> વસ્તૂઓ / Items:
                    </span>{' '}
                    {tx.items.join(', ')}
                  </div>
                )}

                {tx.rawVoiceText && (
                  <div style={{ fontSize: '0.825rem', color: '#94A3B8', fontStyle: 'italic', marginTop: '0.2rem' }}>
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
                      borderColor: '#DDD6FE',
                      color: '#6D28D9'
                    }}
                    onClick={() => handleViewBill(tx)}
                    disabled={loadingBillTxId === tx.transactionId}
                  >
                    {loadingBillTxId === tx.transactionId ? (
                      <Loader2 className="animate-spin" size={16} />
                    ) : (
                      <FileText size={16} color="#6D28D9" />
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
