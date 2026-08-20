import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, MessageSquare, Check, Loader2, Send, CheckCircle2, AlertTriangle, RefreshCw } from 'lucide-react';
import { getRemindersToday, markBatchRemindersSent } from '../api/customers';

export default function TodayRemindersScreen() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reminders, setReminders] = useState([]);

  // Map of customerId -> boolean (checked state)
  const [selectedMap, setSelectedMap] = useState({});

  // Map of customerId -> string (custom edited message)
  const [messagesMap, setMessagesMap] = useState({});

  // Batch flow states
  const [isSendingFlow, setIsSendingFlow] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [sentCustomerIds, setSentCustomerIds] = useState([]);
  const [skippedCount, setSkippedCount] = useState(0);
  const [flowComplete, setFlowComplete] = useState(false);
  const [waitingForReturn, setWaitingForReturn] = useState(false);

  // Keep ref to state for visibility change listener
  const flowStateRef = useRef({
    isSendingFlow: false,
    currentIndex: 0,
    queue: [],
    sentCustomerIds: [],
    waitingForReturn: false,
  });

  const [queue, setQueue] = useState([]);

  useEffect(() => {
    flowStateRef.current = {
      isSendingFlow,
      currentIndex,
      queue,
      sentCustomerIds,
      waitingForReturn,
    };
  }, [isSendingFlow, currentIndex, queue, sentCustomerIds, waitingForReturn]);

  const fetchQueue = async () => {
    setLoading(true);
    setError('');
    const shopkeeperId = localStorage.getItem('voice_udhar_shopkeeper_id');
    if (!shopkeeperId) {
      setError('દુકાનદાર આઈડી મળ્યો નથી. / Shopkeeper ID not found.');
      setLoading(false);
      return;
    }

    try {
      const res = await getRemindersToday(shopkeeperId);
      const items = res.remindersToday || [];
      setReminders(items);

      const initialSelected = {};
      const initialMessages = {};
      items.forEach((item) => {
        initialSelected[item.customerId] = true;
        initialMessages[item.customerId] = item.suggestedMessage || `નમસ્તે ${item.name}, તમારું ₹${item.totalUdhaar} બાકી છે. કૃપા કરી જલ્દી ચૂકવો. આભાર! 🙏`;
      });
      setSelectedMap(initialSelected);
      setMessagesMap(initialMessages);
    } catch (err) {
      console.error('Failed to fetch today reminders:', err);
      setError(err.message || 'રીમાઇન્ડર ક્યૂ મેળવવામાં નિષ્ફળ / Failed to fetch reminder queue');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQueue();

    const handleShopChanged = () => {
      fetchQueue();
    };

    window.addEventListener('voice_udhar_shop_changed', handleShopChanged);
    return () => {
      window.removeEventListener('voice_udhar_shop_changed', handleShopChanged);
    };
  }, []);

  // Listen for window/tab focus / visibility change when returning from WhatsApp
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const { isSendingFlow: sending, waitingForReturn: waiting } = flowStateRef.current;
        if (sending && waiting) {
          setWaitingForReturn(false);
        }
      }
    };

    const handleFocus = () => {
      const { isSendingFlow: sending, waitingForReturn: waiting } = flowStateRef.current;
      if (sending && waiting) {
        setWaitingForReturn(false);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  const toggleSelect = (customerId) => {
    if (isSendingFlow) return;
    setSelectedMap((prev) => ({
      ...prev,
      [customerId]: !prev[customerId],
    }));
  };

  const handleMessageChange = (customerId, text) => {
    if (isSendingFlow) return;
    setMessagesMap((prev) => ({
      ...prev,
      [customerId]: text,
    }));
  };

  const openWhatsAppForCustomer = (customer) => {
    const msgText = messagesMap[customer.customerId] || customer.suggestedMessage;
    const rawPhone = customer.phone ? customer.phone.replace(/\D/g, '') : '';

    if (!rawPhone || rawPhone === '0000000000' || rawPhone.length < 10) {
      alert(`ગ્રાહક ${customer.name} માટે માન્ય ફોન નંબર નથી. સ્કીપ કરાયું. / No valid phone number for ${customer.name}. Skipped.`);
      setSkippedCount((prev) => prev + 1);
      advanceQueueAfterSend(customer.customerId, false);
      return;
    }

    const formattedPhone = rawPhone.length === 10 ? `91${rawPhone}` : rawPhone;
    const waUrl = `https://wa.me/${formattedPhone}?text=${encodeURIComponent(msgText)}`;

    setWaitingForReturn(true);
    window.open(waUrl, '_blank', 'noopener,noreferrer');
  };

  const advanceQueueAfterSend = async (customerId, wasSent = true) => {
    let newSentList = sentCustomerIds;
    if (wasSent) {
      newSentList = [...sentCustomerIds, customerId];
      setSentCustomerIds(newSentList);
    }

    const nextIdx = currentIndex + 1;
    if (nextIdx < queue.length) {
      setCurrentIndex(nextIdx);
    } else {
      // Completed full queue
      finishBatchFlow(newSentList);
    }
  };

  const handleProceedNext = () => {
    if (currentIndex >= queue.length) return;
    const currentCustomer = queue[currentIndex];
    openWhatsAppForCustomer(currentCustomer);
    advanceQueueAfterSend(currentCustomer.customerId, true);
  };

  const startBatchSend = () => {
    const selectedCustomers = reminders.filter((item) => selectedMap[item.customerId]);
    if (selectedCustomers.length === 0) {
      alert('કૃપા કરીને ઓછામાં ઓછો એક ગ્રાહક પસંદ કરો. / Please select at least one customer.');
      return;
    }

    setQueue(selectedCustomers);
    setIsSendingFlow(true);
    setCurrentIndex(0);
    setSentCustomerIds([]);
    setSkippedCount(0);
    setFlowComplete(false);
    setWaitingForReturn(false);

    // Immediately trigger open for first customer
    const firstCustomer = selectedCustomers[0];
    openWhatsAppForCustomer(firstCustomer);
    advanceQueueAfterSend(firstCustomer.customerId, true);
  };

  const finishBatchFlow = async (finalSentIds = sentCustomerIds) => {
    setIsSendingFlow(false);
    setFlowComplete(true);
    setWaitingForReturn(false);

    if (finalSentIds.length > 0) {
      try {
        await markBatchRemindersSent(finalSentIds);
      } catch (err) {
        console.error('Failed to record batch sent reminders:', err);
      }
    }
  };

  const selectedCount = Object.values(selectedMap).filter(Boolean).length;

  return (
    <div className="main-content">
      {/* Header Bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
        <button
          type="button"
          onClick={() => navigate('/')}
          style={{
            background: 'rgba(255, 255, 255, 0.08)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            borderRadius: '12px',
            padding: '0.5rem',
            color: '#F8FAFC',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          aria-label="Go back to Home"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 style={{ fontSize: '1.3rem', fontWeight: '800', color: '#F8FAFC', margin: 0 }}>
            આજનાં રીમાઇન્ડર્સ / Today's Reminders
          </h1>
          <p style={{ fontSize: '0.8rem', color: '#94A3B8', margin: 0 }}>
            {reminders.length} ગ્રાહકો બાકી છે ({selectedCount} પસંદ કરેલ)
          </p>
        </div>
      </div>

      {loading && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '3rem 1rem' }}>
          <Loader2 className="animate-spin" size={36} color="#F0C674" />
          <p style={{ marginTop: '1rem', color: '#94A3B8', fontWeight: '600' }}>
            ક્યૂ લોડ થઈ રહી છે... / Loading queue...
          </p>
        </div>
      )}

      {error && (
        <div className="error-banner" style={{ marginBottom: '1rem' }}>
          {error}
        </div>
      )}

      {!loading && !error && reminders.length === 0 && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="confirmation-card"
          style={{ textAlign: 'center', padding: '2.5rem 1.5rem' }}
        >
          <div style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            backgroundColor: 'rgba(34, 197, 94, 0.15)',
            border: '1px solid rgba(34, 197, 94, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 1rem auto',
            color: '#4ADE80'
          }}>
            <CheckCircle2 size={36} />
          </div>
          <h2 style={{ color: '#F8FAFC', fontSize: '1.25rem', marginBottom: '0.5rem' }}>
            આજે કોઈ રીમાઇન્ડર નથી!
          </h2>
          <p style={{ color: '#94A3B8', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
            બધા ગ્રાહકોનું ઉધાર સમયસર છે. / No overdue reminders for today!
          </p>
          <button className="btn-primary" onClick={() => navigate('/')}>
            હોમ પેજ પર જાઓ / Go Home
          </button>
        </motion.div>
      )}

      {/* COMPLETED FLOW CARD */}
      {flowComplete && (
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="confirmation-card"
          style={{ textAlign: 'center', marginBottom: '1.5rem', borderColor: 'rgba(34, 197, 94, 0.5)' }}
        >
          <div style={{ color: '#4ADE80', marginBottom: '0.75rem', display: 'flex', justifyContent: 'center' }}>
            <CheckCircle2 size={48} />
          </div>
          <h2 style={{ fontSize: '1.3rem', color: '#F8FAFC', marginBottom: '0.5rem' }}>
            બધા રિમાઇન્ડર મોકલાયા! / All reminders sent!
          </h2>
          <p style={{ color: '#94A3B8', fontSize: '0.9rem', marginBottom: '1.25rem' }}>
            {sentCustomerIds.length} ગ્રાહકોને સફળતાપૂર્વક મેસેજ મોકલાયો.
          </p>
          <button className="btn-primary" onClick={fetchQueue}>
            <RefreshCw size={18} />
            યાદી અપડેટ કરો / Refresh Queue
          </button>
        </motion.div>
      )}

      {/* ACTIVE BATCH SENDING PROGRESS PANEL */}
      {isSendingFlow && !flowComplete && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            backgroundColor: 'rgba(124, 58, 237, 0.2)',
            border: '1px solid rgba(240, 198, 116, 0.5)',
            borderRadius: 'var(--radius-md)',
            padding: '1rem',
            marginBottom: '1.25rem',
            backdropFilter: 'blur(10px)',
            boxShadow: '0 8px 25px rgba(124, 58, 237, 0.3)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <div style={{ fontSize: '1rem', fontWeight: '800', color: '#F0C674' }}>
              📲 મોકલવાની પ્રક્રિયા ચાલુ છે... ({sentCustomerIds.length} / {queue.length} મોકલાયું)
            </div>
            <button
              type="button"
              onClick={() => finishBatchFlow()}
              style={{
                fontSize: '0.75rem',
                color: '#FDA4AF',
                background: 'rgba(244, 63, 94, 0.2)',
                border: '1px solid rgba(244, 63, 94, 0.4)',
                padding: '0.25rem 0.6rem',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: '600'
              }}
            >
              પૂર્ણ કરો / Finish Early
            </button>
          </div>

          {/* Progress Bar */}
          <div style={{ width: '100%', height: '8px', backgroundColor: 'rgba(255, 255, 255, 0.1)', borderRadius: '4px', overflow: 'hidden', marginBottom: '1rem' }}>
            <div
              style={{
                width: `${Math.round((sentCustomerIds.length / queue.length) * 100)}%`,
                height: '100%',
                backgroundColor: '#F0C674',
                transition: 'width 0.3s ease',
              }}
            />
          </div>

          {currentIndex < queue.length ? (
            <div>
              <div style={{ fontSize: '0.9rem', color: '#F8FAFC', fontWeight: '700', marginBottom: '0.5rem' }}>
                👉 {queue[currentIndex].name} તૈયાર છે, ટેપ કરો / {queue[currentIndex].name} ready, tap to open WhatsApp
              </div>
              <button
                type="button"
                className="btn-success"
                onClick={handleProceedNext}
                style={{ width: '100%', padding: '0.75rem', fontSize: '1rem' }}
              >
                <Send size={18} />
                {queue[currentIndex].name} ને મોકલો / Send to {queue[currentIndex].name}
              </button>
            </div>
          ) : (
            <div style={{ textAlign: 'center', color: '#4ADE80', fontWeight: '700' }}>
              સંપૂર્ણ પ્રક્રિયા પૂરી થઈ છે.
            </div>
          )}
        </motion.div>
      )}

      {/* QUEUE CARDS LIST */}
      {!loading && !error && reminders.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '5rem' }}>
          {reminders.map((customer) => {
            const isSelected = !!selectedMap[customer.customerId];
            const currentMsg = messagesMap[customer.customerId] || '';
            const isCurrentActive = isSendingFlow && queue[currentIndex]?.customerId === customer.customerId;

            return (
              <motion.div
                key={customer.customerId}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                style={{
                  backgroundColor: isCurrentActive
                    ? 'rgba(240, 198, 116, 0.12)'
                    : isSelected
                    ? 'rgba(255, 255, 255, 0.05)'
                    : 'rgba(255, 255, 255, 0.02)',
                  border: isCurrentActive
                    ? '2px solid #F0C674'
                    : isSelected
                    ? '1px solid rgba(240, 198, 116, 0.3)'
                    : '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: 'var(--radius-md)',
                  padding: '1rem',
                  opacity: isSendingFlow && !isCurrentActive ? 0.6 : 1,
                  transition: 'all 0.2s ease',
                  boxShadow: isCurrentActive ? '0 0 20px rgba(240, 198, 116, 0.2)' : 'none',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      disabled={isSendingFlow}
                      onChange={() => toggleSelect(customer.customerId)}
                      style={{
                        width: '20px',
                        height: '20px',
                        accentColor: '#F0C674',
                        cursor: isSendingFlow ? 'default' : 'pointer',
                      }}
                    />
                    <div>
                      <div style={{ fontSize: '1.1rem', fontWeight: '800', color: '#F8FAFC' }}>
                        {customer.name}
                      </div>
                      <div style={{ fontSize: '0.8rem', color: '#94A3B8' }}>
                        📞 {customer.phone || 'નંબર નથી'}
                      </div>
                    </div>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '1.15rem', fontWeight: '900', color: '#F0C674' }}>
                      ₹{customer.totalUdhaar}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#FDA4AF', fontWeight: '600' }}>
                      {customer.daysSinceLastTransaction} દિવસથી બાકી
                    </div>
                  </div>
                </div>

                {/* Editable WhatsApp Suggested Message */}
                <div style={{ marginTop: '0.5rem' }}>
                  <label style={{ fontSize: '0.75rem', color: '#94A3B8', fontWeight: '600', display: 'block', marginBottom: '0.25rem' }}>
                    💬 WhatsApp મેસેજ (Editable):
                  </label>
                  <textarea
                    rows={2}
                    value={currentMsg}
                    disabled={isSendingFlow}
                    onChange={(e) => handleMessageChange(customer.customerId, e.target.value)}
                    style={{
                      width: '100%',
                      backgroundColor: 'rgba(0, 0, 0, 0.3)',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      borderRadius: '8px',
                      padding: '0.5rem 0.75rem',
                      color: '#F8FAFC',
                      fontSize: '0.85rem',
                      resize: 'none',
                      fontFamily: 'inherit',
                      lineHeight: '1.4',
                    }}
                  />
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* BOTTOM FIXED BAR - "બધા મોકલો / Send All" */}
      {!loading && !error && reminders.length > 0 && !isSendingFlow && !flowComplete && (
        <div style={{
          position: 'fixed',
          bottom: '72px',
          left: 0,
          right: 0,
          padding: '0.75rem 1rem',
          backgroundColor: '#0A0A0F',
          borderTop: '1px solid rgba(255, 255, 255, 0.1)',
          zIndex: 10,
          backdropFilter: 'blur(10px)',
        }}>
          <motion.button
            whileTap={{ scale: 0.97 }}
            className="btn-success"
            onClick={startBatchSend}
            disabled={selectedCount === 0}
            style={{
              width: '100%',
              padding: '0.85rem',
              fontSize: '1.1rem',
              opacity: selectedCount === 0 ? 0.5 : 1,
            }}
          >
            <Send size={20} />
            બધા મોકલો ({selectedCount}) / Send All ({selectedCount})
          </motion.button>
        </div>
      )}
    </div>
  );
}
