import React, { useState, useEffect } from 'react';
import { getDailySummaryApi } from '../api/summary';
import { Volume2, VolumeX, RefreshCw, ShoppingBag, ArrowUpRight, ArrowDownLeft, Receipt, AlertCircle, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';

function AnimatedNumber({ value }) {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    let start = 0;
    const end = Number(value) || 0;
    if (start === end) {
      setDisplayValue(end);
      return;
    }

    const duration = 800; // ms
    const steps = 30;
    const stepTime = duration / steps;
    const increment = (end - start) / steps;
    let currentStep = 0;

    const timer = setInterval(() => {
      currentStep++;
      if (currentStep >= steps) {
        setDisplayValue(end);
        clearInterval(timer);
      } else {
        setDisplayValue(Math.floor(start + increment * currentStep));
      }
    }, stepTime);

    return () => clearInterval(timer);
  }, [value]);

  return <span>{displayValue.toLocaleString('en-IN')}</span>;
}

const getAvailableVoices = () => {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window)) {
      resolve([]);
      return;
    }

    let voices = window.speechSynthesis.getVoices();
    if (voices && voices.length > 0) {
      resolve(voices);
      return;
    }

    const handleVoicesChanged = () => {
      voices = window.speechSynthesis.getVoices();
      window.speechSynthesis.removeEventListener('voiceschanged', handleVoicesChanged);
      resolve(voices || []);
    };

    window.speechSynthesis.addEventListener('voiceschanged', handleVoicesChanged);

    // Safety fallback timeout after 1 second
    setTimeout(() => {
      window.speechSynthesis.removeEventListener('voiceschanged', handleVoicesChanged);
      resolve(window.speechSynthesis.getVoices() || []);
    }, 1000);
  });
};

export default function SummaryScreen() {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isSpeaking, setIsSpeaking] = useState(false);

  const shopkeeperId = localStorage.getItem('voice_udhar_shopkeeper_id');

  const fetchSummary = async () => {
    if (!shopkeeperId) return;
    setLoading(true);
    setError('');
    try {
      const data = await getDailySummaryApi(shopkeeperId);
      setSummary(data);
    } catch (err) {
      console.error('Error loading daily summary:', err);
      setError(err.message || 'તારણ લોડ કરવામાં નિષ્ફળ / Failed to load summary');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSummary();

    return () => {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const handleReadAloud = async () => {
    if (!('speechSynthesis' in window)) {
      alert('તમારા બ્રાઉઝરમાં અવાજ ફીચર ઉપલબ્ધ નથી / Text to speech not supported');
      return;
    }

    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }

    const sales = summary?.totalSales || 0;
    const newUdhaar = summary?.totalNewUdhaar || 0;
    const udhaarCollected = summary?.totalUdhaarCollected || 0;
    const count = summary?.transactionCount || 0;

    // Spoken sentence in Gujarati / Hindi phonetic mix
    const textToSpeak = `આજનો કુલ વેચાણ ${sales} રૂપિયા છે. નવું ઉધાર ${newUdhaar} રૂપિયા. ઉધાર વસૂલ ${udhaarCollected} રૂપિયા. કુલ ${count} ટ્રાન્ઝેક્શન.`;

    const utterance = new SpeechSynthesisUtterance(textToSpeak);

    // Wait for voices to load asynchronously
    const voices = await getAvailableVoices();
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

    utterance.rate = 0.9; // Slightly slower for clarity

    utterance.onend = () => {
      setIsSpeaking(false);
    };

    utterance.onerror = (e) => {
      console.error('Speech synthesis error:', e);
      setIsSpeaking(false);
    };

    setIsSpeaking(true);
    window.speechSynthesis.speak(utterance);
  };

  const isAllZero =
    summary &&
    summary.totalSales === 0 &&
    summary.totalNewUdhaar === 0 &&
    summary.totalUdhaarCollected === 0 &&
    summary.transactionCount === 0;

  return (
    <div className="main-content" style={{ maxWidth: '520px', margin: '0 auto', width: '100%' }}>
      {/* Title & Refresh */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
        <div>
          <h2 style={{ fontSize: '1.6rem', fontWeight: '800', color: '#F8FAFC', margin: 0, letterSpacing: '-0.02em', fontFamily: "'Outfit', sans-serif" }}>
            આજનો ડેશબોર્ડ / Summary
          </h2>
          <span style={{ fontSize: '0.875rem', color: '#94A3B8', fontWeight: '600' }}>Daily Financial Summary</span>
        </div>
        <motion.button
          whileTap={{ scale: 0.92 }}
          onClick={fetchSummary}
          disabled={loading}
          style={{
            padding: '0.65rem 1rem',
            borderRadius: 'var(--radius-md)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            backgroundColor: 'rgba(255, 255, 255, 0.05)',
            color: '#F0C674',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            cursor: 'pointer',
            fontSize: '0.9rem',
            fontWeight: '700',
            backdropFilter: 'blur(8px)'
          }}
        >
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} color="#F0C674" />
          <span>રીફ્રેશ</span>
        </motion.button>
      </div>

      {/* Loading State */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '4rem 1rem' }}>
          <RefreshCw className="animate-spin" size={40} color="#C026D3" style={{ margin: '0 auto 1rem' }} />
          <p style={{ color: '#94A3B8', fontSize: '1.1rem', margin: 0, fontWeight: '600' }}>
            તારણ લોડ થઈ રહ્યું છે... / Loading summary...
          </p>
        </div>
      )}

      {/* Error State */}
      {error && !loading && (
        <div className="error-banner">
          <AlertCircle size={32} style={{ marginBottom: '0.5rem' }} />
          <p style={{ margin: 0, fontWeight: 'bold' }}>{error}</p>
        </div>
      )}

      {/* Main Content */}
      {!loading && !error && (
        <>
          {/* Read Aloud Button */}
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={handleReadAloud}
            style={{
              width: '100%',
              padding: '1.15rem',
              borderRadius: 'var(--radius-md)',
              border: '1px solid rgba(240, 198, 116, 0.3)',
              background: isSpeaking
                ? 'linear-gradient(135deg, #F43F5E 0%, #E11D48 100%)'
                : 'linear-gradient(135deg, #7C3AED 0%, #C026D3 100%)',
              color: '#ffffff',
              fontSize: '1.25rem',
              fontWeight: '800',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.75rem',
              cursor: 'pointer',
              boxShadow: isSpeaking
                ? '0 8px 24px rgba(244, 63, 94, 0.4)'
                : '0 8px 24px rgba(124, 58, 237, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.3)',
              marginBottom: '1.5rem',
              transition: 'all 0.2s ease',
              fontFamily: "'Outfit', sans-serif"
            }}
          >
            {isSpeaking ? (
              <>
                <VolumeX size={28} />
                <span>બોલી રહ્યું છે... (બંધ કરો) / Speaking... (Stop)</span>
              </>
            ) : (
              <>
                <Volume2 size={28} color="#F0C674" />
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  બોલકે સુણો / Read Aloud <Sparkles size={18} color="#F0C674" fill="#F0C674" />
                </span>
              </>
            )}
          </motion.button>

          {/* Empty State */}
          {isAllZero ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="placeholder-card"
            >
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
                border: '1px solid rgba(240, 198, 116, 0.3)',
                marginBottom: '1rem'
              }}>
                <Receipt size={36} />
              </div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: '800', margin: '0 0 0.25rem 0', color: '#F8FAFC' }}>
                આજે કોઈ ટ્રાન્ઝેક્શન નથી થયું
              </h3>
              <p style={{ margin: 0, fontSize: '0.95rem', color: '#94A3B8', fontWeight: '500' }}>
                Aaj koi transaction nahi hua
              </p>
            </motion.div>
          ) : (
            /* Summary Cards Grid */
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem' }}>
              {/* Total Sales */}
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: 0.05 }}
                className="glass-card"
                style={{
                  borderLeft: '5px solid #C026D3',
                  padding: '1.25rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#E9D5FF', fontWeight: '800', marginBottom: '0.25rem' }}>
                    <ShoppingBag size={20} color="#C026D3" />
                    <span>આજનું વેચાણ / Total Sale</span>
                  </div>
                  <div style={{ fontSize: '0.85rem', color: '#94A3B8', fontWeight: '500' }}>Aaj ka Total Sale</div>
                </div>
                <div className="number-font gold-gradient-text" style={{ fontSize: '2rem', fontWeight: '900' }}>
                  ₹<AnimatedNumber value={summary?.totalSales || 0} />
                </div>
              </motion.div>

              {/* New Udhaar */}
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: 0.1 }}
                className="glass-card"
                style={{
                  borderLeft: '5px solid #F97316',
                  padding: '1.25rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#F97316', fontWeight: '800', marginBottom: '0.25rem' }}>
                    <ArrowUpRight size={20} />
                    <span>નવું ઉધાર / New Udhaar</span>
                  </div>
                  <div style={{ fontSize: '0.85rem', color: '#94A3B8', fontWeight: '500' }}>Naya Udhaar Given</div>
                </div>
                <div className="number-font" style={{ fontSize: '2rem', fontWeight: '900', color: '#F97316' }}>
                  ₹<AnimatedNumber value={summary?.totalNewUdhaar || 0} />
                </div>
              </motion.div>

              {/* Udhaar Collected */}
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: 0.15 }}
                className="glass-card"
                style={{
                  borderLeft: '5px solid #10B981',
                  padding: '1.25rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#10B981', fontWeight: '800', marginBottom: '0.25rem' }}>
                    <ArrowDownLeft size={20} />
                    <span>ઉધાર વસૂલ / Udhaar Vasool</span>
                  </div>
                  <div style={{ fontSize: '0.85rem', color: '#94A3B8', fontWeight: '500' }}>Credit Collected</div>
                </div>
                <div className="number-font" style={{ fontSize: '2rem', fontWeight: '900', color: '#10B981' }}>
                  ₹<AnimatedNumber value={summary?.totalUdhaarCollected || 0} />
                </div>
              </motion.div>

              {/* Total Transactions */}
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: 0.2 }}
                className="glass-card"
                style={{
                  borderLeft: '5px solid #F0C674',
                  padding: '1.25rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#F0C674', fontWeight: '800', marginBottom: '0.25rem' }}>
                    <Receipt size={20} />
                    <span>કુલ ટ્રાન્ઝેક્શન / Total Transactions</span>
                  </div>
                  <div style={{ fontSize: '0.85rem', color: '#94A3B8', fontWeight: '500' }}>Kul Transactions</div>
                </div>
                <div className="number-font" style={{ fontSize: '2rem', fontWeight: '900', color: '#F8FAFC' }}>
                  <AnimatedNumber value={summary?.transactionCount || 0} />
                </div>
              </motion.div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
