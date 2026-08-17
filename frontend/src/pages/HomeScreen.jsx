import React, { useState, useRef, useEffect } from 'react';
import { Mic, Square, Loader2, CheckCircle2, Edit2, RotateCcw, Save, AlertCircle, Sparkles, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { processVoiceAudio } from '../api/voice';
import { getCustomers, createCustomer } from '../api/customers';
import { logTransaction } from '../api/transactions';
import { generateBillApi } from '../api/bill';
import BillModal from '../components/BillModal';

// State Enum
const SCREEN_STATE = {
  IDLE: 'IDLE',
  RECORDING: 'RECORDING',
  PROCESSING: 'PROCESSING',
  ERROR: 'ERROR',
  CONFIRMATION: 'CONFIRMATION',
  EDITING: 'EDITING',
  SAVING: 'SAVING',
  SUCCESS: 'SUCCESS',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
};

// Map raw intent to system transaction type
const mapIntentToTxType = (intent) => {
  if (intent === 'mark_paid') return 'udhaar_paid';
  if (intent === 'record_sale') return 'sale';
  return 'udhaar_add'; // default intent: add_udhaar
};

// Map transaction type to human readable label
const getActionLabel = (txType) => {
  switch (txType) {
    case 'udhaar_add':
      return { gu: 'ઉધાર ઉમેર્યા', en: 'Udhaar Added' };
    case 'udhaar_paid':
      return { gu: 'ઉધાર જમા કર્યા', en: 'Paid Back' };
    case 'sale':
      return { gu: 'રોકડ વેચાણ', en: 'Cash Sale' };
    default:
      return { gu: 'ઉધાર ઉમેર્યા', en: 'Udhaar Added' };
  }
};

export default function HomeScreen() {
  const [screenState, setScreenState] = useState(SCREEN_STATE.IDLE);
  const [errorMessage, setErrorMessage] = useState('');
  const [parsedData, setParsedData] = useState(null);
  const [generatedBill, setGeneratedBill] = useState(null);
  const [showBillModal, setShowBillModal] = useState(false);

  // Form state for Editing
  const [editCustomerName, setEditCustomerName] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editTxType, setEditTxType] = useState('udhaar_add');

  // Media recorder refs
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  // Cleanup media recorder stream on unmount
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.stream) {
        mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  // 1. Start Recording
  const startRecording = async () => {
    setErrorMessage('');
    audioChunksRef.current = [];

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setErrorMessage('તમારા બ્રાઉઝરમાં માઇક્રોફોન સુવિધા ઉપલબ્ધ નથી. / Microphone not supported in browser.');
      setScreenState(SCREEN_STATE.ERROR);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Determine mime type supported by browser
      let mimeType = 'audio/webm';
      if (!MediaRecorder.isTypeSupported('audio/webm')) {
        if (MediaRecorder.isTypeSupported('audio/mp4')) {
          mimeType = 'audio/mp4';
        } else if (MediaRecorder.isTypeSupported('audio/aac')) {
          mimeType = 'audio/aac';
        } else {
          mimeType = ''; // Let browser choose default
        }
      }

      const options = mimeType ? { mimeType } : undefined;
      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        // Stop audio tracks
        stream.getTracks().forEach((track) => track.stop());
        const audioBlob = new Blob(audioChunksRef.current, { type: mediaRecorder.mimeType || 'audio/webm' });
        await handleAudioRecorded(audioBlob, mediaRecorder.mimeType || 'audio/webm');
      };

      mediaRecorder.start();
      setScreenState(SCREEN_STATE.RECORDING);
    } catch (err) {
      console.error('Microphone permission error:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setScreenState(SCREEN_STATE.PERMISSION_DENIED);
      } else {
        setErrorMessage('માઇક્રોફોન શરુ કરવામાં સમસ્યા આવી. / Microphone error.');
        setScreenState(SCREEN_STATE.ERROR);
      }
    }
  };

  // 2. Stop Recording
  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  };

  // 3. Convert recorded audio blob to base64 & call API
  const handleAudioRecorded = async (blob, mimeType) => {
    setScreenState(SCREEN_STATE.PROCESSING);

    try {
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onloadend = async () => {
        try {
          const base64AudioWithHeader = reader.result;
          // Extract plain base64 string
          const base64Audio = base64AudioWithHeader.split(',')[1] || base64AudioWithHeader;

          const result = await processVoiceAudio(base64Audio, mimeType);

          if (!result || result.intent === 'unclear' || (result.confidence === 'low' && !result.customer_name && !result.amount)) {
            setErrorMessage('સંભળાયું નથી, ફરી બોલો / Sunai nahi diya, phir se bolo');
            setScreenState(SCREEN_STATE.ERROR);
            return;
          }

          const txType = mapIntentToTxType(result.intent);
          const customerName = result.customer_name || 'ગ્રાહક (Unknown)';
          const amount = result.amount || 0;

          setParsedData({
            customerName,
            amount,
            txType,
            items: result.items || [],
            transcription: result.transcription_gujarati || '',
          });

          // Pre-fill edit fields
          setEditCustomerName(customerName);
          setEditAmount(amount.toString());
          setEditTxType(txType);

          setScreenState(SCREEN_STATE.CONFIRMATION);
        } catch (apiErr) {
          console.error('Voice processing API error:', apiErr);
          setErrorMessage('સંભળાયું નથી, ફરી બોલો / Sunai nahi diya, phir se bolo');
          setScreenState(SCREEN_STATE.ERROR);
        }
      };
    } catch (err) {
      console.error('Audio encoding error:', err);
      setErrorMessage('સંભળાયું નથી, ફરી બોલો / Sunai nahi diya, phir se bolo');
      setScreenState(SCREEN_STATE.ERROR);
    }
  };

  // 4. Save Transaction
  const executeSave = async (finalName, finalAmount, finalTxType) => {
    setScreenState(SCREEN_STATE.SAVING);
    setErrorMessage('');

    const shopkeeperId = localStorage.getItem('voice_udhar_shopkeeper_id');
    if (!shopkeeperId) {
      setErrorMessage('દુકાનદાર આઈડી મળ્યો નથી. ફરી લોગીન કરો. / Shopkeeper ID missing.');
      setScreenState(SCREEN_STATE.ERROR);
      return;
    }

    try {
      const cleanName = finalName.trim();
      const numAmount = Number(finalAmount);

      if (!cleanName) {
        setErrorMessage('મહેરબાની કરીને ગ્રાહકનું નામ દાખલ કરો. / Please enter customer name.');
        setScreenState(SCREEN_STATE.EDITING);
        return;
      }

      if (isNaN(numAmount) || numAmount < 0) {
        setErrorMessage('મહેરબાની કરીને સાચી રકમ દાખલ કરો. / Please enter valid amount.');
        setScreenState(SCREEN_STATE.EDITING);
        return;
      }

      // Check if customer exists
      const existingCustomers = await getCustomers(shopkeeperId);
      let customer = existingCustomers.find(
        (c) => c.name && c.name.trim().toLowerCase() === cleanName.toLowerCase()
      );

      // Create customer if not found
      if (!customer) {
        customer = await createCustomer({
          shopkeeperId,
          name: cleanName,
          phone: '0000000000',
        });
      }

      // Log transaction
      await logTransaction({
        shopkeeperId,
        customerId: customer.customerId,
        type: finalTxType,
        amount: numAmount,
        items: parsedData?.items || [],
        rawVoiceText: parsedData?.transcription || '',
      });

      // Automatically generate bill preview
      try {
        const billResult = await generateBillApi({
          shopkeeperId,
          customerId: customer.customerId,
          customerName: cleanName,
          customerPhone: customer.phone,
          items: parsedData?.items || [],
          totalAmount: numAmount,
        });

        setGeneratedBill(billResult);
        setShowBillModal(true);
      } catch (billErr) {
        console.error('Bill generation error:', billErr);
      }

      setScreenState(SCREEN_STATE.SUCCESS);

      // Auto reset after 2.5 seconds if modal is not open
      setTimeout(() => {
        if (!showBillModal) {
          resetToIdle();
        }
      }, 2500);
    } catch (err) {
      console.error('Error saving transaction:', err);
      setErrorMessage(err.message || 'ટ્રાન્ઝેક્શન સેવ કરવામાં ભૂલ આવી / Failed to save transaction');
      setScreenState(SCREEN_STATE.ERROR);
    }
  };

  const handleConfirmDirect = () => {
    if (!parsedData) return;
    executeSave(parsedData.customerName, parsedData.amount, parsedData.txType);
  };

  const handleSaveEdit = (e) => {
    e.preventDefault();
    executeSave(editCustomerName, editAmount, editTxType);
  };

  const resetToIdle = () => {
    setScreenState(SCREEN_STATE.IDLE);
    setErrorMessage('');
    setParsedData(null);
    setGeneratedBill(null);
    setShowBillModal(false);
  };

  const handleCloseBillModal = () => {
    setShowBillModal(false);
    resetToIdle();
  };

  return (
    <div className="main-content">
      {/* BILL PREVIEW MODAL */}
      {showBillModal && generatedBill && (
        <BillModal billData={generatedBill} onClose={handleCloseBillModal} />
      )}

      {/* 1. PERMISSION DENIED STATE */}
      {screenState === SCREEN_STATE.PERMISSION_DENIED && (
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="confirmation-card" style={{ textAlign: 'center', borderColor: 'rgba(244, 63, 94, 0.4)' }}>
          <div style={{ color: '#f43f5e', marginBottom: '1rem', display: 'flex', justifyContent: 'center' }}>
            <AlertCircle size={52} />
          </div>
          <h2 style={{ fontSize: '1.35rem', marginBottom: '0.5rem', color: '#F8FAFC', textAlign: 'center' }}>
            માઇક્રોફોન મંજૂરી નકારી / Mic Permission Denied
          </h2>
          <p style={{ color: '#94A3B8', fontSize: '1rem', marginBottom: '1.5rem', textAlign: 'center' }}>
            અવાજ રેકોર્ડ કરવા માટે બ્રાઉઝર સેટિંગ્સમાંથી માઇક્રોફોન પરમિશન આપો.
            <br />
            Please allow microphone access in your browser settings to record voice.
          </p>
          <button className="btn-primary" onClick={startRecording}>
            <RotateCcw size={20} />
            ફરી પ્રયાસ કરો / Try Again
          </button>
        </motion.div>
      )}

      {/* 2. ERROR STATE ("Sunai nahi diya, phir se bolo") */}
      {screenState === SCREEN_STATE.ERROR && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="confirmation-card" style={{ textAlign: 'center' }}>
          <div className="error-banner">
            {errorMessage || 'સંભળાયું નથી, ફરી બોલો / Sunai nahi diya, phir se bolo'}
          </div>
          <button className="btn-primary" onClick={resetToIdle} style={{ marginTop: '1rem' }}>
            <RotateCcw size={22} />
            ફરી બોલો / Try Again
          </button>
        </motion.div>
      )}

      {/* 3. IDLE or RECORDING STATE */}
      {(screenState === SCREEN_STATE.IDLE || screenState === SCREEN_STATE.RECORDING) && (
        <div className="mic-container">
          <div className="mic-hero-wrapper">
            {screenState === SCREEN_STATE.RECORDING && (
              <>
                <motion.div
                  className="mic-pulse-ring"
                  animate={{ scale: [1, 1.55, 1], opacity: [0.8, 0, 0.8] }}
                  transition={{ repeat: Infinity, duration: 1.6, ease: 'easeInOut' }}
                  style={{ background: 'radial-gradient(circle, rgba(244, 63, 94, 0.5) 0%, rgba(244, 63, 94, 0) 70%)' }}
                />
                <motion.div
                  className="mic-pulse-ring"
                  animate={{ scale: [1, 1.35, 1], opacity: [0.9, 0.1, 0.9] }}
                  transition={{ repeat: Infinity, duration: 1.6, ease: 'easeInOut', delay: 0.3 }}
                  style={{ background: 'radial-gradient(circle, rgba(192, 38, 211, 0.6) 0%, rgba(192, 38, 211, 0) 70%)' }}
                />
              </>
            )}

            {screenState === SCREEN_STATE.IDLE && (
              <motion.div
                className="mic-pulse-ring"
                animate={{ scale: [1, 1.2, 1], opacity: [0.6, 0.15, 0.6] }}
                transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
                style={{ background: 'radial-gradient(circle, rgba(124, 58, 237, 0.4) 0%, rgba(124, 58, 237, 0) 70%)' }}
              />
            )}

            <motion.button
              whileTap={{ scale: 0.92 }}
              whileHover={{ scale: 1.05 }}
              className={`mic-button ${screenState === SCREEN_STATE.RECORDING ? 'recording' : ''}`}
              onClick={screenState === SCREEN_STATE.RECORDING ? stopRecording : startRecording}
              aria-label={screenState === SCREEN_STATE.RECORDING ? 'Stop recording' : 'Start recording'}
            >
              {screenState === SCREEN_STATE.RECORDING ? (
                <Square size={48} fill="currentColor" />
              ) : (
                <Mic size={56} color="#ffffff" />
              )}
            </motion.button>
          </div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mic-status-label"
          >
            {screenState === SCREEN_STATE.RECORDING ? (
              <span style={{ color: '#F43F5E' }}>રેકોર્ડિંગ ચાલુ છે... (Recording...)</span>
            ) : (
              <span>બોલવા માટે માઇક પર દબાવો</span>
            )}
          </motion.div>
          <div className="mic-status-sub">
            {screenState === SCREEN_STATE.RECORDING
              ? 'બંધ કરવા ફરી દબાવો (Tap again to stop)'
              : 'Tap mic once to start recording'}
          </div>
        </div>
      )}

      {/* 4. PROCESSING STATE ("Samajh raha hu...") */}
      {screenState === SCREEN_STATE.PROCESSING && (
        <div className="mic-container">
          <motion.div
            animate={{ scale: [1, 1.1, 1], rotate: [0, 180, 360] }}
            transition={{ repeat: Infinity, duration: 2.5, ease: 'easeInOut' }}
            style={{
              width: '110px',
              height: '110px',
              borderRadius: '50%',
              background: 'radial-gradient(circle at 35% 35%, #C026D3 0%, #7C3AED 100%)',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '1rem',
              boxShadow: '0 12px 30px rgba(124, 58, 237, 0.4)',
              border: '2px solid rgba(240, 198, 116, 0.4)'
            }}
          >
            <Loader2 className="animate-spin" size={52} color="#F0C674" />
          </motion.div>
          <div className="mic-status-label">સમજી રહ્યા છીએ...</div>
          <div className="mic-status-sub">Samajh raha hu...</div>
        </div>
      )}

      {/* 5. CONFIRMATION CARD STATE */}
      {screenState === SCREEN_STATE.CONFIRMATION && parsedData && (
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 350, damping: 25 }}
          className="confirmation-card"
        >
          <div className="confirmation-header">
            મેં સમજ્યું / Maine samjha:
          </div>

          <div className="parsed-result-box">
            <div className="parsed-main-text">
              {parsedData.customerName}, ₹{parsedData.amount}
            </div>
            <div style={{ marginTop: '0.5rem' }}>
              <span className={`action-badge ${parsedData.txType}`}>
                {getActionLabel(parsedData.txType).gu} / {getActionLabel(parsedData.txType).en}
              </span>
            </div>
            {parsedData.transcription && (
              <div style={{ marginTop: '0.85rem', fontSize: '0.9rem', color: '#94A3B8', fontStyle: 'italic', background: 'rgba(255, 255, 255, 0.04)', padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px dashed rgba(255, 255, 255, 0.12)' }}>
                "{parsedData.transcription}"
              </div>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <motion.button whileTap={{ scale: 0.98 }} className="btn-success" onClick={handleConfirmDirect}>
              <CheckCircle2 size={24} />
              સાચું છે / Sahi Hai (Confirm)
            </motion.button>
            <motion.button whileTap={{ scale: 0.98 }} className="btn-secondary" onClick={() => setScreenState(SCREEN_STATE.EDITING)}>
              <Edit2 size={20} />
              સુધારો / Sudharo (Edit)
            </motion.button>
          </div>
        </motion.div>
      )}

      {/* 6. EDITING STATE */}
      {screenState === SCREEN_STATE.EDITING && (
        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="confirmation-card">
          <h2 style={{ fontSize: '1.3rem', marginBottom: '1.25rem', color: '#F8FAFC', textAlign: 'center' }}>
            વિગતો સુધારો / Edit Details
          </h2>

          {errorMessage && <div className="error-banner">{errorMessage}</div>}

          <form onSubmit={handleSaveEdit}>
            <div className="form-group">
              <label className="form-label" htmlFor="editCustomer">
                ગ્રાહકનું નામ
                <span className="form-sublabel"> Customer Name</span>
              </label>
              <input
                id="editCustomer"
                type="text"
                className="form-input"
                value={editCustomerName}
                onChange={(e) => setEditCustomerName(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="editAmount">
                રકમ (₹)
                <span className="form-sublabel"> Amount in Rupees</span>
              </label>
              <input
                id="editAmount"
                type="number"
                min="0"
                step="any"
                className="form-input"
                value={editAmount}
                onChange={(e) => setEditAmount(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="editTxType">
                પ્રકાર
                <span className="form-sublabel"> Action Type</span>
              </label>
              <select
                id="editTxType"
                className="form-select"
                value={editTxType}
                onChange={(e) => setEditTxType(e.target.value)}
              >
                <option value="udhaar_add">ઉધાર ઉમેરો (Udhaar Add)</option>
                <option value="udhaar_paid">ઉધાર જમા (Paid Back)</option>
                <option value="sale">રોકડ વેચાણ (Cash Sale)</option>
              </select>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
              <button
                type="button"
                className="btn-secondary"
                style={{ flex: 1 }}
                onClick={() => setScreenState(SCREEN_STATE.CONFIRMATION)}
              >
                રદ કરો / Cancel
              </button>
              <button type="submit" className="btn-primary" style={{ flex: 1 }}>
                <Save size={20} />
                સેવ કરો / Save
              </button>
            </div>
          </form>
        </motion.div>
      )}

      {/* 7. SAVING STATE */}
      {screenState === SCREEN_STATE.SAVING && (
        <div className="mic-container">
          <Loader2 className="animate-spin" size={52} color="#C026D3" />
          <div className="mic-status-label" style={{ marginTop: '1rem' }}>
            સેવ થઈ રહ્યું છે...
          </div>
          <div className="mic-status-sub">Saving transaction...</div>
        </div>
      )}

      {/* 8. SUCCESS STATE ("Save ho gaya!") */}
      {screenState === SCREEN_STATE.SUCCESS && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
          className="mic-container"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', delay: 0.1, stiffness: 500, damping: 20 }}
            style={{
              width: '84px',
              height: '84px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '1rem',
              boxShadow: '0 12px 30px rgba(16, 185, 129, 0.4)',
              border: '2px solid rgba(255, 255, 255, 0.3)'
            }}
          >
            <Check size={48} strokeWidth={3} />
          </motion.div>
          <div className="success-banner" style={{ width: '100%' }}>
            Save ho gaya! / સેવ થઈ ગયું!
          </div>
          <p style={{ color: '#94A3B8', fontSize: '1rem', textAlign: 'center', fontWeight: '500' }}>
            ટ્રાન્ઝેક્શન સફળતાપૂર્વક ઉમેરાઈ ગયું છે.
          </p>
        </motion.div>
      )}
    </div>
  );
}
