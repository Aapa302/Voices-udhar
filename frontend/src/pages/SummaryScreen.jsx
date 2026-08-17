import React, { useState, useEffect, useRef } from 'react';
import { getDailySummaryApi } from '../api/summary';
import { Volume2, VolumeX, RefreshCw, ShoppingBag, ArrowUpRight, ArrowDownLeft, Receipt, AlertCircle } from 'lucide-react';

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

  const handleReadAloud = () => {
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

    // Try to get Gujarati or Hindi voice if available
    const voices = window.speechSynthesis.getVoices();
    const guVoice = voices.find((v) => v.lang.includes('gu'));
    const hiVoice = voices.find((v) => v.lang.includes('hi'));

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
    <div style={{ padding: '1.25rem', paddingBottom: '6rem', maxWidth: '500px', margin: '0 auto' }}>
      {/* Title & Refresh */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#1e293b', margin: 0 }}>
            આજનું તારણ
          </h2>
          <span style={{ fontSize: '0.9rem', color: '#64748b' }}>Daily Summary</span>
        </div>
        <button
          onClick={fetchSummary}
          disabled={loading}
          style={{
            padding: '0.6rem 0.9rem',
            borderRadius: '0.5rem',
            border: '1px solid #cbd5e1',
            backgroundColor: '#ffffff',
            color: '#334155',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            cursor: 'pointer',
            fontSize: '0.9rem',
            fontWeight: '600'
          }}
        >
          <RefreshCw size={18} className={loading ? 'spin' : ''} />
          <span>રીફ્રેશ</span>
        </button>
      </div>

      {/* Loading State */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
          <div className="spinner" style={{ margin: '0 auto 1rem' }}></div>
          <p style={{ color: '#64748b', fontSize: '1.1rem', margin: 0 }}>
            તારણ લોડ થઈ રહ્યું છે... / Loading summary...
          </p>
        </div>
      )}

      {/* Error State */}
      {error && !loading && (
        <div style={{
          backgroundColor: '#fef2f2',
          border: '1px solid #fecaca',
          borderRadius: '0.75rem',
          padding: '1.25rem',
          textAlign: 'center',
          color: '#991b1b',
          marginBottom: '1rem'
        }}>
          <AlertCircle size={32} style={{ marginBottom: '0.5rem' }} />
          <p style={{ margin: 0, fontWeight: 'bold' }}>{error}</p>
        </div>
      )}

      {/* Main Content */}
      {!loading && !error && (
        <>
          {/* Read Aloud Button */}
          <button
            onClick={handleReadAloud}
            style={{
              width: '100%',
              padding: '1.1rem',
              borderRadius: '1rem',
              border: 'none',
              backgroundColor: isSpeaking ? '#dc2626' : '#2563eb',
              color: '#ffffff',
              fontSize: '1.25rem',
              fontWeight: 'bold',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.75rem',
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)',
              marginBottom: '1.5rem',
              transition: 'all 0.2s ease'
            }}
          >
            {isSpeaking ? (
              <>
                <VolumeX size={28} />
                <span>બોલી રહ્યું છે... (બંધ કરો) / Speaking... (Stop)</span>
              </>
            ) : (
              <>
                <Volume2 size={28} />
                <span>બોલકે સુણો / Read Aloud</span>
              </>
            )}
          </button>

          {/* Empty State */}
          {isAllZero ? (
            <div style={{
              backgroundColor: '#f8fafc',
              border: '2px dashed #cbd5e1',
              borderRadius: '1rem',
              padding: '2.5rem 1rem',
              textAlign: 'center',
              color: '#64748b'
            }}>
              <Receipt size={48} style={{ color: '#94a3b8', marginBottom: '0.75rem' }} />
              <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', margin: '0 0 0.25rem 0', color: '#334155' }}>
                આજે કોઈ ટ્રાન્ઝેક્શન નથી થયું
              </h3>
              <p style={{ margin: 0, fontSize: '1rem', color: '#64748b' }}>
                Aaj koi transaction nahi hua
              </p>
            </div>
          ) : (
            /* Summary Cards Grid */
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem' }}>
              {/* Total Sales */}
              <div style={{
                backgroundColor: '#ffffff',
                border: '1px solid #e2e8f0',
                borderLeft: '6px solid #2563eb',
                borderRadius: '0.75rem',
                padding: '1.25rem',
                boxShadow: '0 2px 4px rgba(0,0,0,0.04)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#2563eb', fontWeight: 'bold', marginBottom: '0.25rem' }}>
                    <ShoppingBag size={20} />
                    <span>આજનું વેચાણ / Total Sale</span>
                  </div>
                  <div style={{ fontSize: '0.85rem', color: '#64748b' }}>Aaj ka Total Sale</div>
                </div>
                <div style={{ fontSize: '1.75rem', fontWeight: 'bold', color: '#1e293b' }}>
                  ₹{summary?.totalSales || 0}
                </div>
              </div>

              {/* New Udhaar */}
              <div style={{
                backgroundColor: '#ffffff',
                border: '1px solid #e2e8f0',
                borderLeft: '6px solid #dc2626',
                borderRadius: '0.75rem',
                padding: '1.25rem',
                boxShadow: '0 2px 4px rgba(0,0,0,0.04)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#dc2626', fontWeight: 'bold', marginBottom: '0.25rem' }}>
                    <ArrowUpRight size={20} />
                    <span>નવું ઉધાર / New Udhaar</span>
                  </div>
                  <div style={{ fontSize: '0.85rem', color: '#64748b' }}>Naya Udhaar Given</div>
                </div>
                <div style={{ fontSize: '1.75rem', fontWeight: 'bold', color: '#dc2626' }}>
                  ₹{summary?.totalNewUdhaar || 0}
                </div>
              </div>

              {/* Udhaar Collected */}
              <div style={{
                backgroundColor: '#ffffff',
                border: '1px solid #e2e8f0',
                borderLeft: '6px solid #059669',
                borderRadius: '0.75rem',
                padding: '1.25rem',
                boxShadow: '0 2px 4px rgba(0,0,0,0.04)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#059669', fontWeight: 'bold', marginBottom: '0.25rem' }}>
                    <ArrowDownLeft size={20} />
                    <span>ઉધાર વસૂલ / Udhaar Vasool</span>
                  </div>
                  <div style={{ fontSize: '0.85rem', color: '#64748b' }}>Credit Collected</div>
                </div>
                <div style={{ fontSize: '1.75rem', fontWeight: 'bold', color: '#059669' }}>
                  ₹{summary?.totalUdhaarCollected || 0}
                </div>
              </div>

              {/* Total Transactions */}
              <div style={{
                backgroundColor: '#ffffff',
                border: '1px solid #e2e8f0',
                borderLeft: '6px solid #6366f1',
                borderRadius: '0.75rem',
                padding: '1.25rem',
                boxShadow: '0 2px 4px rgba(0,0,0,0.04)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#6366f1', fontWeight: 'bold', marginBottom: '0.25rem' }}>
                    <Receipt size={20} />
                    <span>કુલ ટ્રાન્ઝેક્શન / Total Transactions</span>
                  </div>
                  <div style={{ fontSize: '0.85rem', color: '#64748b' }}>Kul Transactions</div>
                </div>
                <div style={{ fontSize: '1.75rem', fontWeight: 'bold', color: '#1e293b' }}>
                  {summary?.transactionCount || 0}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
