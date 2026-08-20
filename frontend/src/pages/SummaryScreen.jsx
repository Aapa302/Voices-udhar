import React, { useState, useEffect } from 'react';
import { getDailySummaryApi, getSummaryTrendsApi } from '../api/summary';
import { downloadDataExportApi } from '../api/export';
import { Volume2, VolumeX, RefreshCw, ShoppingBag, ArrowUpRight, ArrowDownLeft, Receipt, AlertCircle, Sparkles, TrendingUp, Calendar, Trophy, Download, FileSpreadsheet, FileText, Loader2 } from 'lucide-react';
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
  const [activeTab, setActiveTab] = useState('today'); // 'today' | 'week' | 'month'
  const [summary, setSummary] = useState(null);
  const [trendData, setTrendData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isSpeaking, setIsSpeaking] = useState(false);

  const [exportLoading, setExportLoading] = useState(null); // 'excel' | 'pdf' | null
  const [exportError, setExportError] = useState('');

  const handleExportData = async (format) => {
    if (!shopkeeperId) return;
    setExportError('');
    try {
      setExportLoading(format);
      await downloadDataExportApi(shopkeeperId, format);
    } catch (err) {
      console.error('Export failed:', err);
      setExportError(err.message || 'ડેટા ડાઉનલોડ કરવામાં નિષ્ફળ / Failed to download data');
    } finally {
      setExportLoading(null);
    }
  };

  const shopkeeperId = localStorage.getItem('voice_udhar_shopkeeper_id');

  const fetchData = async () => {
    if (!shopkeeperId) return;
    setLoading(true);
    setError('');
    try {
      if (activeTab === 'today') {
        const data = await getDailySummaryApi(shopkeeperId);
        setSummary(data);
      } else {
        const data = await getSummaryTrendsApi(shopkeeperId, activeTab);
        setTrendData(data);
      }
    } catch (err) {
      console.error('Error loading summary data:', err);
      setError(err.message || 'તારણ લોડ કરવામાં નિષ્ફળ / Failed to load summary');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
    fetchData();
  }, [activeTab]);

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

    let textToSpeak = '';

    if (activeTab === 'today') {
      const sales = summary?.totalSales || 0;
      const newUdhaar = summary?.totalNewUdhaar || 0;
      const udhaarCollected = summary?.totalUdhaarCollected || 0;
      const count = summary?.transactionCount || 0;
      textToSpeak = `આજનો કુલ વેચાણ ${sales} રૂપિયા છે. નવું ઉધાર ${newUdhaar} રૂપિયા. ઉધાર વસૂલ ${udhaarCollected} રૂપિયા. કુલ ${count} ટ્રાન્ઝેક્શન.`;
    } else {
      const totalPeriodSales = trendData?.dataPoints?.reduce((acc, curr) => acc + (curr.totalSales || 0), 0) || 0;
      const periodLabelGu = activeTab === 'week' ? 'આ સપ્તાહમાં' : 'આ મહિનામાં';
      textToSpeak = `${periodLabelGu} કુલ વેચાણ ${totalPeriodSales} રૂપિયા છે.`;
    }

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

  // Trend computations
  const totalPeriodSales = trendData?.dataPoints?.reduce((acc, curr) => acc + (curr.totalSales || 0), 0) || 0;
  const totalPeriodNewUdhaar = trendData?.dataPoints?.reduce((acc, curr) => acc + (curr.totalNewUdhaar || 0), 0) || 0;
  const totalPeriodCollected = trendData?.dataPoints?.reduce((acc, curr) => acc + (curr.totalUdhaarCollected || 0), 0) || 0;

  // Find best sales day
  let bestDay = null;
  if (trendData?.dataPoints && trendData.dataPoints.length > 0) {
    bestDay = trendData.dataPoints.reduce((max, dp) => (dp.totalSales > (max?.totalSales || 0) ? dp : max), trendData.dataPoints[0]);
  }

  // Maximum value for bar scaling
  const maxSales = Math.max(...(trendData?.dataPoints?.map((dp) => dp.totalSales) || [1]), 1);

  return (
    <div className="main-content" style={{ maxWidth: '520px', margin: '0 auto', width: '100%' }}>
      {/* Title & Refresh */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
        <div>
          <h2 style={{ fontSize: '1.6rem', fontWeight: '800', color: '#F8FAFC', margin: 0, letterSpacing: '-0.02em', fontFamily: "'Outfit', sans-serif" }}>
            ડેશબોર્ડ / Summary
          </h2>
          <span style={{ fontSize: '0.875rem', color: '#94A3B8', fontWeight: '600' }}>Financial Dashboard & Trends</span>
        </div>
        <motion.button
          whileTap={{ scale: 0.92 }}
          onClick={fetchData}
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

      {/* View Period Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', backgroundColor: 'rgba(255, 255, 255, 0.04)', padding: '0.35rem', borderRadius: '14px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
        {[
          { id: 'today', gu: 'આજે', en: 'Today' },
          { id: 'week', gu: 'સપ્તાહ', en: 'Week' },
          { id: 'month', gu: 'મહિનો', en: 'Month' },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            style={{
              flex: 1,
              padding: '0.6rem 0.5rem',
              borderRadius: '10px',
              border: activeTab === tab.id ? '1px solid rgba(240, 198, 116, 0.5)' : 'none',
              backgroundColor: activeTab === tab.id ? 'rgba(240, 198, 116, 0.18)' : 'transparent',
              color: activeTab === tab.id ? '#F0C674' : '#94A3B8',
              fontWeight: '800',
              fontSize: '0.9rem',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              textAlign: 'center'
            }}
          >
            {tab.gu} / {tab.en}
          </button>
        ))}
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

          {/* TODAY VIEW */}
          {activeTab === 'today' && (
            <>
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

          {/* WEEK / MONTH TREND VIEW */}
          {(activeTab === 'week' || activeTab === 'month') && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* Custom Mobile SVG/CSS Gradient Bar Chart */}
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                className="glass-card"
                style={{ padding: '1.25rem' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#F0C674', fontWeight: '800', fontSize: '1.05rem' }}>
                    <TrendingUp size={20} />
                    <span>વેચાણ ટ્રેન્ડ / Sales Trend ({activeTab === 'week' ? '7 Days' : '30 Days'})</span>
                  </div>
                </div>

                {/* Bar Chart Container */}
                <div style={{
                  display: 'flex',
                  alignItems: 'flex-end',
                  gap: activeTab === 'week' ? '0.5rem' : '0.15rem',
                  height: '160px',
                  paddingTop: '1.5rem',
                  borderBottom: '1px solid rgba(255,255,255,0.15)',
                  overflowX: 'auto',
                  justifyContent: 'space-between'
                }}>
                  {trendData?.dataPoints?.map((dp, idx) => {
                    const heightPct = Math.max((dp.totalSales / maxSales) * 100, 6);
                    const dayLabel = new Date(dp.date).toLocaleDateString('en-US', {
                      weekday: activeTab === 'week' ? 'short' : undefined,
                      day: 'numeric',
                      month: activeTab === 'month' ? 'numeric' : undefined
                    });

                    return (
                      <div
                        key={dp.date}
                        style={{
                          flex: 1,
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          height: '100%',
                          justifyContent: 'flex-end',
                          minWidth: activeTab === 'week' ? '32px' : '8px'
                        }}
                        title={`${dp.date}: ₹${dp.totalSales}`}
                      >
                        {dp.totalSales > 0 && activeTab === 'week' && (
                          <span style={{ fontSize: '0.65rem', color: '#F0C674', marginBottom: '2px', fontWeight: '700' }}>
                            ₹{dp.totalSales}
                          </span>
                        )}
                        <motion.div
                          initial={{ height: 0 }}
                          animate={{ height: `${heightPct}%` }}
                          transition={{ duration: 0.4, delay: idx * 0.02 }}
                          style={{
                            width: '100%',
                            borderRadius: '4px 4px 0 0',
                            background: dp.totalSales === maxSales && dp.totalSales > 0
                              ? 'linear-gradient(180deg, #F0C674 0%, #D97706 100%)'
                              : 'linear-gradient(180deg, #C026D3 0%, #7C3AED 100%)',
                            boxShadow: dp.totalSales > 0 ? '0 2px 8px rgba(192, 38, 211, 0.3)' : 'none'
                          }}
                        />
                      </div>
                    );
                  })}
                </div>

                {/* X-Axis Labels for Week view */}
                {activeTab === 'week' && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem', gap: '0.5rem' }}>
                    {trendData?.dataPoints?.map((dp) => (
                      <span key={dp.date} style={{ flex: 1, textAlign: 'center', fontSize: '0.75rem', color: '#94A3B8', fontWeight: '600' }}>
                        {new Date(dp.date).toLocaleDateString('en-US', { weekday: 'short' })}
                      </span>
                    ))}
                  </div>
                )}
              </motion.div>

              {/* Total Summary Card */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div className="glass-card" style={{ padding: '1rem' }}>
                  <div style={{ fontSize: '0.8rem', color: '#94A3B8', fontWeight: '600' }}>
                    {activeTab === 'week' ? 'આ સપ્તાહમાં કુલ વેચાણ' : 'આ મહિનામાં કુલ વેચાણ'}
                  </div>
                  <div className="number-font gold-gradient-text" style={{ fontSize: '1.4rem', fontWeight: '900', marginTop: '0.25rem' }}>
                    ₹<AnimatedNumber value={totalPeriodSales} />
                  </div>
                </div>

                <div className="glass-card" style={{ padding: '1rem' }}>
                  <div style={{ fontSize: '0.8rem', color: '#94A3B8', fontWeight: '600' }}>
                    {activeTab === 'week' ? 'સપ્તાહનું નવું ઉધાર' : 'મહિનાનું નવું ઉધાર'}
                  </div>
                  <div className="number-font" style={{ fontSize: '1.4rem', fontWeight: '900', color: '#F97316', marginTop: '0.25rem' }}>
                    ₹<AnimatedNumber value={totalPeriodNewUdhaar} />
                  </div>
                </div>
              </div>

              {/* Best Sales Day Highlight Card */}
              {bestDay && bestDay.totalSales > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="glass-card"
                  style={{
                    padding: '1rem 1.25rem',
                    border: '1px solid rgba(240, 198, 116, 0.4)',
                    background: 'linear-gradient(135deg, rgba(240, 198, 116, 0.1) 0%, rgba(192, 38, 211, 0.1) 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '1rem'
                  }}
                >
                  <div style={{
                    width: '42px',
                    height: '42px',
                    borderRadius: '12px',
                    backgroundColor: 'rgba(240, 198, 116, 0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <Trophy size={24} color="#F0C674" />
                  </div>
                  <div>
                    <div style={{ fontSize: '0.85rem', color: '#F0C674', fontWeight: '700' }}>
                      સૌથી વધુ વેચાણ વાળો દિવસ / Best Sales Day
                    </div>
                    <div style={{ fontSize: '1rem', color: '#F8FAFC', fontWeight: '800' }}>
                      {bestDay.date} — ₹{bestDay.totalSales.toLocaleString('en-IN')}
                    </div>
                  </div>
                </motion.div>
              )}
            </div>
          )}

          {/* DATA EXPORT CARD */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-card"
            style={{ marginTop: '1.5rem', padding: '1.25rem' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.1rem', fontWeight: '800', color: '#F8FAFC', marginBottom: '0.4rem' }}>
              <Download size={22} color="#F0C674" />
              <span>ડેટા ડાઉનલોડ કરો / Export Data</span>
            </div>
            <div style={{ fontSize: '0.85rem', color: '#94A3B8', marginBottom: '1rem', fontWeight: '500' }}>
              તમારો સંપૂર્ણ ગ્રાહક અને વ્યવહાર ડેટા Excel અથવા PDF માં ડાઉનલોડ કરો.
            </div>

            {exportError && <div className="error-banner" style={{ marginBottom: '0.85rem' }}>{exportError}</div>}

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <motion.button
                whileTap={{ scale: 0.96 }}
                type="button"
                onClick={() => handleExportData('excel')}
                disabled={exportLoading !== null}
                style={{
                  flex: 1,
                  padding: '0.8rem 0.6rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid rgba(34, 197, 94, 0.4)',
                  backgroundColor: 'rgba(34, 197, 94, 0.18)',
                  color: '#4ADE80',
                  fontWeight: '800',
                  fontSize: '0.9rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.4rem',
                  boxShadow: '0 4px 15px rgba(34, 197, 94, 0.15)'
                }}
              >
                {exportLoading === 'excel' ? <Loader2 className="animate-spin" size={18} /> : <FileSpreadsheet size={18} />}
                <span>Excel ડાઉનલોડ કરો</span>
              </motion.button>

              <motion.button
                whileTap={{ scale: 0.96 }}
                type="button"
                onClick={() => handleExportData('pdf')}
                disabled={exportLoading !== null}
                style={{
                  flex: 1,
                  padding: '0.8rem 0.6rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid rgba(244, 63, 94, 0.4)',
                  backgroundColor: 'rgba(244, 63, 94, 0.18)',
                  color: '#FDA4AF',
                  fontWeight: '800',
                  fontSize: '0.9rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.4rem',
                  boxShadow: '0 4px 15px rgba(244, 63, 94, 0.15)'
                }}
              >
                {exportLoading === 'pdf' ? <Loader2 className="animate-spin" size={18} /> : <FileText size={18} />}
                <span>PDF ડાઉનલોડ કરો</span>
              </motion.button>
            </div>
          </motion.div>
        </>
      )}
    </div>
  );
}
