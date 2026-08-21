import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { PieChart, Package, Bell, HelpCircle, Settings, ChevronRight, Mic, Volume2, VolumeX, Loader2, RotateCcw } from 'lucide-react';
import { processVoiceQuery } from '../api/voice';
import { getCustomerAlerts, getCustomerReminders } from '../api/customers';
import { getInventoryApi } from '../api/inventory';

export default function MoreScreen() {
  const navigate = useNavigate();

  // Urgent alerts state
  const [hasUrgentAlerts, setHasUrgentAlerts] = useState(false);
  const [alertDetails, setAlertDetails] = useState('');

  // Voice Query Modal State
  const [showVoiceQueryModal, setShowVoiceQueryModal] = useState(false);
  const [isRecordingQuery, setIsRecordingQuery] = useState(false);
  const [isProcessingQuery, setIsProcessingQuery] = useState(false);
  const [queryResult, setQueryResult] = useState(null);
  const [queryError, setQueryError] = useState('');
  const [isSpeakingQuery, setIsSpeakingQuery] = useState(false);

  // Check urgent items for badge & subtext
  useEffect(() => {
    const checkUrgentItems = async () => {
      const shopkeeperId = localStorage.getItem('voice_udhar_shopkeeper_id');
      if (!shopkeeperId) return;

      try {
        const [alertsRes, remindersRes, inventoryRes] = await Promise.all([
          getCustomerAlerts(shopkeeperId, 15).catch(() => ({ longPending: [] })),
          getCustomerReminders(shopkeeperId, 30).catch(() => ({ remindersNeeded: [] })),
          getInventoryApi(shopkeeperId).catch(() => []),
        ]);

        const longPendingCount = (alertsRes && alertsRes.longPending && alertsRes.longPending.length) || 0;
        const remindersCount = (remindersRes && remindersRes.remindersNeeded && remindersRes.remindersNeeded.length) || 0;
        const lowStockCount = (inventoryRes || []).filter(
          (item) => item.isLowStock || Number(item.quantity) <= Number(item.lowStockThreshold || 5)
        ).length;

        const totalUrgent = longPendingCount + remindersCount + lowStockCount;
        if (totalUrgent > 0) {
          setHasUrgentAlerts(true);
          const parts = [];
          if (longPendingCount > 0) parts.push(`${longPendingCount} બાકી ઉધાર`);
          if (remindersCount > 0) parts.push(`${remindersCount} રિમાઇન્ડર`);
          if (lowStockCount > 0) parts.push(`${lowStockCount} ઓછો સ્ટોક`);
          setAlertDetails(parts.join(' • '));
        } else {
          setHasUrgentAlerts(false);
          setAlertDetails('');
        }
      } catch (err) {
        console.warn('Failed to check alerts on More screen:', err);
      }
    };

    checkUrgentItems();
  }, []);

  // Menu items list
  const menuItems = [
    {
      id: 'summary',
      title: 'તારણ / Summary',
      subtitle: 'દૈનિક, સાપ્તાહિક અને માસિક રિપોર્ટ / Sales & balance reports',
      icon: PieChart,
      iconBg: 'linear-gradient(135deg, rgba(124, 58, 237, 0.3) 0%, rgba(192, 38, 211, 0.3) 100%)',
      iconColor: '#C084FC',
      borderAccent: 'rgba(192, 132, 252, 0.3)',
      onClick: () => navigate('/summary'),
    },
    {
      id: 'stock',
      title: 'સ્ટોક / Stock',
      subtitle: 'વસ્તુઓની યાદી અને જથ્થો / Inventory management',
      icon: Package,
      iconBg: 'linear-gradient(135deg, rgba(245, 158, 11, 0.25) 0%, rgba(217, 119, 6, 0.25) 100%)',
      iconColor: '#FBBF24',
      borderAccent: 'rgba(251, 191, 36, 0.3)',
      onClick: () => navigate('/inventory'),
    },
    {
      id: 'alerts',
      title: 'અલર્ટ્સ / Alerts',
      subtitle: alertDetails || 'બાકી રિમાઇન્ડર્સ અને ઓછો સ્ટોક / Pending alerts & low stock',
      icon: Bell,
      iconBg: 'linear-gradient(135deg, rgba(239, 68, 68, 0.25) 0%, rgba(225, 29, 72, 0.25) 100%)',
      iconColor: '#FCA5A5',
      borderAccent: 'rgba(252, 165, 165, 0.3)',
      badge: hasUrgentAlerts ? '!' : null,
      onClick: () => navigate('/alerts'),
    },
    {
      id: 'ask',
      title: 'પ્રશ્ન પૂછો / Ask a Question',
      subtitle: 'બોલીને હિસાબ અથવા સ્ટોક પૂછો / Ask questions via voice',
      icon: HelpCircle,
      iconBg: 'linear-gradient(135deg, rgba(59, 130, 246, 0.25) 0%, rgba(14, 165, 233, 0.25) 100%)',
      iconColor: '#60A5FA',
      borderAccent: 'rgba(96, 165, 250, 0.3)',
      onClick: () => setShowVoiceQueryModal(true),
    },
    {
      id: 'settings',
      title: 'સેટિંગ્સ / Settings',
      subtitle: 'UPI ID, દુકાન મેનેજમેન્ટ, ડેટા એક્સપોર્ટ / Settings & Data export',
      icon: Settings,
      iconBg: 'linear-gradient(135deg, rgba(240, 198, 116, 0.25) 0%, rgba(217, 119, 6, 0.25) 100%)',
      iconColor: '#F0C674',
      borderAccent: 'rgba(240, 198, 116, 0.3)',
      onClick: () => {
        // Trigger settings modal via custom event or header trigger
        const settingsBtn = document.querySelector('button[title="સેટિંગ્સ / Settings"]');
        if (settingsBtn) {
          settingsBtn.click();
        } else {
          alert('Header settings button clicked');
        }
      },
    },
  ];

  // Voice Query Handling
  const mediaRecorderRef = React.useRef(null);
  const audioChunksRef = React.useRef([]);

  const startQueryRecording = async () => {
    setQueryError('');
    setQueryResult(null);
    audioChunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      let mimeType = 'audio/webm';
      if (!MediaRecorder.isTypeSupported('audio/webm')) {
        mimeType = MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : '';
      }

      const mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const audioBlob = new Blob(audioChunksRef.current, { type: mediaRecorder.mimeType || 'audio/webm' });

        setIsProcessingQuery(true);
        try {
          const reader = new FileReader();
          reader.readAsDataURL(audioBlob);
          reader.onloadend = async () => {
            const base64Audio = (reader.result || '').split(',')[1] || reader.result;
            const res = await processVoiceQuery(base64Audio, mediaRecorder.mimeType || 'audio/webm');
            if (res && res.answerText) {
              setQueryResult(res);
            } else {
              setQueryError('જવાબ મળ્યો નથી, ફરી પૂછો / Could not understand query');
            }
            setIsProcessingQuery(false);
          };
        } catch (err) {
          console.error('Error handling query audio:', err);
          setQueryError(err.message || 'પ્રશ્ન પ્રોસેસ કરવામાં ભૂલ આવી');
          setIsProcessingQuery(false);
        }
      };

      mediaRecorder.start();
      setIsRecordingQuery(true);
    } catch (err) {
      console.error('Mic error in query modal:', err);
      setQueryError('માઇક્રોફોન મંજૂરી મેળવવામાં ભૂલ આવી');
    }
  };

  const stopQueryRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      setIsRecordingQuery(false);
    }
  };

  const speakText = (text) => {
    if (!('speechSynthesis' in window) || !text) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'gu-IN';
    utterance.rate = 0.9;
    utterance.onend = () => setIsSpeakingQuery(false);
    utterance.onerror = () => setIsSpeakingQuery(false);
    setIsSpeakingQuery(true);
    window.speechSynthesis.speak(utterance);
  };

  const toggleQuerySpeech = () => {
    if (isSpeakingQuery) {
      window.speechSynthesis.cancel();
      setIsSpeakingQuery(false);
    } else if (queryResult?.answerText) {
      speakText(queryResult.answerText);
    }
  };

  return (
    <div className="main-content" style={{ paddingBottom: '6rem' }}>
      {/* Screen Title */}
      <div style={{ marginBottom: '1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: '800', color: '#F8FAFC', margin: 0 }}>
            વધુ સુવિધાઓ / More
          </h1>
          <p style={{ fontSize: '0.85rem', color: '#94A3B8', marginTop: '0.2rem', margin: 0 }}>
            બધી વધારાની સુવિધાઓ / Additional tools & settings
          </p>
        </div>
      </div>

      {/* Menu Options List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
        {menuItems.map((item, index) => {
          const Icon = item.icon;

          return (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: index * 0.05 }}
              whileTap={{ scale: 0.98 }}
              onClick={item.onClick}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '1.15rem 1.1rem',
                borderRadius: '16px',
                backgroundColor: 'rgba(255, 255, 255, 0.03)',
                border: `1px solid ${item.borderAccent}`,
                boxShadow: '0 4px 20px rgba(0, 0, 0, 0.25)',
                cursor: 'pointer',
                backdropFilter: 'blur(12px)',
                minHeight: '72px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: 1 }}>
                <div style={{
                  width: '52px',
                  height: '52px',
                  borderRadius: '14px',
                  background: item.iconBg,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
                  border: `1px solid ${item.borderAccent}`,
                }}>
                  <Icon size={26} color={item.iconColor} />
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: '1.1rem',
                    fontWeight: '800',
                    color: '#F8FAFC',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                  }}>
                    <span>{item.title}</span>
                    {item.badge && (
                      <span style={{
                        width: '20px',
                        height: '20px',
                        borderRadius: '50%',
                        backgroundColor: '#EF4444',
                        color: '#FFFFFF',
                        fontSize: '0.75rem',
                        fontWeight: '900',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 0 8px rgba(239, 68, 68, 0.6)',
                      }}>
                        {item.badge}
                      </span>
                    )}
                  </div>
                  <div style={{
                    fontSize: '0.825rem',
                    color: '#94A3B8',
                    marginTop: '0.2rem',
                    fontWeight: '500',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {item.subtitle}
                  </div>
                </div>
              </div>

              <ChevronRight size={22} color="#64748B" style={{ flexShrink: 0, marginLeft: '0.5rem' }} />
            </motion.div>
          );
        })}
      </div>

      {/* Voice Query Modal */}
      <AnimatePresence>
        {showVoiceQueryModal && (
          <div className="modal-overlay" role="dialog" aria-modal="true" style={{ zIndex: 10000 }}>
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ type: 'spring', stiffness: 350, damping: 25 }}
              className="confirmation-card"
              style={{ maxWidth: '440px', width: '92%', textAlign: 'center' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.2rem', fontWeight: '800', color: '#60A5FA' }}>
                  <HelpCircle size={24} color="#60A5FA" />
                  <span>પ્રશ્ન પૂછો / Ask a Question</span>
                </div>
                <button
                  type="button"
                  className="btn-icon"
                  onClick={() => {
                    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
                    setShowVoiceQueryModal(false);
                  }}
                  aria-label="Close modal"
                >
                  ✕
                </button>
              </div>

              {queryError && <div className="error-banner" style={{ marginBottom: '1rem' }}>{queryError}</div>}

              {/* Recording / Query Active View */}
              {isProcessingQuery ? (
                <div style={{ padding: '2rem 0' }}>
                  <Loader2 className="animate-spin" size={48} color="#60A5FA" style={{ margin: '0 auto 1rem' }} />
                  <div style={{ fontSize: '1.1rem', fontWeight: '700', color: '#F8FAFC' }}>
                    સમજી રહ્યા છીએ... / Thinking...
                  </div>
                </div>
              ) : queryResult ? (
                /* Answer Result View */
                <div>
                  <div style={{ backgroundColor: 'rgba(255, 255, 255, 0.04)', borderRadius: '12px', padding: '1.25rem', border: '1px solid rgba(96, 165, 250, 0.3)', marginBottom: '1.25rem', textAlign: 'center' }}>
                    <div style={{ fontSize: '1.2rem', fontWeight: '800', color: '#F8FAFC', marginBottom: '0.5rem', lineHeight: '1.4' }}>
                      {queryResult.answerText}
                    </div>
                    {queryResult.answerTextEnglish && (
                      <div style={{ fontSize: '0.9rem', color: '#94A3B8', fontWeight: '500' }}>
                        {queryResult.answerTextEnglish}
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <motion.button
                      whileTap={{ scale: 0.97 }}
                      onClick={toggleQuerySpeech}
                      style={{
                        padding: '0.8rem',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid rgba(96, 165, 250, 0.4)',
                        background: 'rgba(96, 165, 250, 0.2)',
                        color: '#60A5FA',
                        fontSize: '1rem',
                        fontWeight: '700',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.5rem',
                        cursor: 'pointer',
                      }}
                    >
                      {isSpeakingQuery ? <VolumeX size={20} /> : <Volume2 size={20} />}
                      <span>{isSpeakingQuery ? 'અવાજ બંધ કરો' : 'ફરી સાંભળો / Listen'}</span>
                    </motion.button>

                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => {
                        setQueryResult(null);
                        startQueryRecording();
                      }}
                    >
                      <RotateCcw size={18} />
                      <span>બીજો પ્રશ્ન પૂછો / Ask Another Question</span>
                    </button>
                  </div>
                </div>
              ) : (
                /* Mic Button Prompt */
                <div>
                  <p style={{ color: '#94A3B8', fontSize: '0.95rem', marginBottom: '1.5rem', lineHeight: '1.4' }}>
                    દા.ત. "આજે કેટલું વેચાણ થયું?", "રમેશભાઈનું બાકી ઉધાર કેટલું છે?" અથવા "ચોખાનો સ્ટોક કેટલો છે?"
                  </p>

                  <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.5rem' }}>
                    <motion.button
                      whileTap={{ scale: 0.92 }}
                      whileHover={{ scale: 1.05 }}
                      onClick={isRecordingQuery ? stopQueryRecording : startQueryRecording}
                      style={{
                        width: '90px',
                        height: '90px',
                        borderRadius: '50%',
                        backgroundColor: isRecordingQuery ? '#EF4444' : '#2563EB',
                        border: '3px solid rgba(255, 255, 255, 0.3)',
                        boxShadow: isRecordingQuery ? '0 0 25px rgba(239, 68, 68, 0.6)' : '0 8px 25px rgba(37, 99, 235, 0.4)',
                        color: '#FFFFFF',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                      }}
                    >
                      <Mic size={42} color="#FFFFFF" />
                    </motion.button>
                  </div>

                  <div style={{ fontSize: '1rem', fontWeight: '700', color: isRecordingQuery ? '#EF4444' : '#F8FAFC' }}>
                    {isRecordingQuery ? 'રેકોર્ડિંગ ચાલુ છે... (દબાવો બંધ કરવા)' : 'બોલવા માટે માઇક પર દબાવો / Tap to Ask'}
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
