import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mic, Square, Loader2, CheckCircle2, Edit2, RotateCcw, Save, AlertCircle, Sparkles, Check, Phone, AlertTriangle, HelpCircle, Volume2, VolumeX, MessageSquare, X, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { processVoiceAudio, processVoiceQuery } from '../api/voice';
import { getCustomers, createCustomer, getCustomerAlerts, getCustomerReminders, markReminderSent, getRemindersToday } from '../api/customers';
import { logTransaction } from '../api/transactions';
import { generateBillApi } from '../api/bill';
import { getInventoryApi, addOrUpdateInventoryApi } from '../api/inventory';
import BillModal from '../components/BillModal';
import { Package } from 'lucide-react';

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
  QUERY_RESPONSE: 'QUERY_RESPONSE',
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
  const navigate = useNavigate();
  const [screenState, setScreenState] = useState(SCREEN_STATE.IDLE);
  const [errorMessage, setErrorMessage] = useState('');
  const [parsedData, setParsedData] = useState(null);
  const [generatedBill, setGeneratedBill] = useState(null);
  const [showBillModal, setShowBillModal] = useState(false);

  // Pending udhaar alerts state & low stock alerts state for Home screen banner
  const [pendingAlertCount, setPendingAlertCount] = useState(0);
  const [lowStockCount, setLowStockCount] = useState(0);
  const [isAlertBannerDismissed, setIsAlertBannerDismissed] = useState(false);
  const [isStockAlertDismissed, setIsStockAlertDismissed] = useState(false);

  // Smart Reminders state
  const [reminders, setReminders] = useState([]);
  const [currentReminderIndex, setCurrentReminderIndex] = useState(0);
  const [isReminderDismissed, setIsReminderDismissed] = useState(false);

  // Today Reminders Queue banner state
  const [todayRemindersCount, setTodayRemindersCount] = useState(0);
  const [isTodayRemindersDismissed, setIsTodayRemindersDismissed] = useState(false);

  const fetchPendingAlertsAndReminders = async () => {
    const shopkeeperId = localStorage.getItem('voice_udhar_shopkeeper_id');
    if (!shopkeeperId) return;
    try {
      const alertsData = await getCustomerAlerts(shopkeeperId, 15);
      const count = (alertsData.longPending && alertsData.longPending.length) || 0;
      setPendingAlertCount(count);

      const remindersData = await getCustomerReminders(shopkeeperId, 30);
      if (remindersData && remindersData.remindersNeeded) {
        setReminders(remindersData.remindersNeeded);
      }

      const todayRes = await getRemindersToday(shopkeeperId);
      if (todayRes && todayRes.remindersToday) {
        setTodayRemindersCount(todayRes.remindersToday.length);
      }

      const inventoryData = await getInventoryApi(shopkeeperId);
      const lowStockItems = (inventoryData || []).filter(
        (item) => item.isLowStock || Number(item.quantity) <= Number(item.lowStockThreshold || 5)
      );
      setLowStockCount(lowStockItems.length);
    } catch (err) {
      console.error('Failed to fetch alerts/reminders/inventory for home screen:', err);
    }
  };

  useEffect(() => {
    fetchPendingAlertsAndReminders();

    const handleShopChanged = () => {
      resetToIdle();
      fetchPendingAlertsAndReminders();
    };

    window.addEventListener('voice_udhar_shop_changed', handleShopChanged);
    return () => {
      window.removeEventListener('voice_udhar_shop_changed', handleShopChanged);
    };
  }, []);

  const handleSendReminder = async (reminder) => {
    if (!reminder) return;
    if (reminder.phone && reminder.phone !== '0000000000') {
      const cleanPhone = reminder.phone.replace(/\D/g, '');
      const formattedPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
      const waUrl = `https://wa.me/${formattedPhone}?text=${encodeURIComponent(reminder.suggestedMessage)}`;
      window.open(waUrl, '_blank', 'noopener,noreferrer');
    } else {
      alert(`મોબાઇલ નંબર મળ્યો નથી. મેસેજ: "${reminder.suggestedMessage}"`);
    }

    try {
      await markReminderSent(reminder.customerId);
    } catch (err) {
      console.error('Failed to mark reminder sent:', err);
    }

    // Move to next reminder in queue if available
    if (currentReminderIndex < reminders.length - 1) {
      setCurrentReminderIndex((prev) => prev + 1);
    } else {
      setIsReminderDismissed(true);
    }
  };

  const handleLaterReminder = () => {
    if (currentReminderIndex < reminders.length - 1) {
      setCurrentReminderIndex((prev) => prev + 1);
    } else {
      setIsReminderDismissed(true);
    }
  };

  // Query mode state
  const [isQueryMode, setIsQueryMode] = useState(false);
  const [queryResult, setQueryResult] = useState(null);
  const [isSpeakingQuery, setIsSpeakingQuery] = useState(false);

  // Form state for Editing
  const [editCustomerName, setEditCustomerName] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editTxType, setEditTxType] = useState('udhaar_add');

  // Form state for Stock Editing
  const [editStockItemName, setEditStockItemName] = useState('');
  const [editStockQuantity, setEditStockQuantity] = useState('');
  const [editStockUnit, setEditStockUnit] = useState('packet');

  // Success note for sale stock update
  const [stockSuccessNote, setStockSuccessNote] = useState('');

  // Ref for auto-focusing name input in EDITING mode
  const editCustomerNameInputRef = useRef(null);

  // Auto-focus & select name input text when entering EDITING mode
  useEffect(() => {
    if (screenState === SCREEN_STATE.EDITING && editCustomerNameInputRef.current) {
      editCustomerNameInputRef.current.focus();
      editCustomerNameInputRef.current.select();
    }
  }, [screenState]);

  // Quick consonant swap helper function for commonly confused Gujarati pairs
  const handleSwapConsonantPair = (charA, charB) => {
    if (!editCustomerName) {
      setEditCustomerName(charA);
      return;
    }

    const hasA = editCustomerName.includes(charA);
    const hasB = editCustomerName.includes(charB);

    if (hasA) {
      // Replace all occurrences of charA with charB
      const updated = editCustomerName.replaceAll(charA, charB);
      setEditCustomerName(updated);
    } else if (hasB) {
      // Replace all occurrences of charB with charA
      const updated = editCustomerName.replaceAll(charB, charA);
      setEditCustomerName(updated);
    } else {
      // If neither character is present, append charB
      setEditCustomerName(editCustomerName + charB);
    }
  };

  // Media recorder refs & recording start time
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordingStartTimeRef = useRef(null);

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
    recordingStartTimeRef.current = Date.now();

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

        // Check minimum recording duration (500ms)
        const duration = Date.now() - (recordingStartTimeRef.current || 0);
        if (duration < 500) {
          setErrorMessage('ખૂબ ટૂંકું રેકોર્ડિંગ (0.5 સેકન્ડથી ઓછું). / Recording too short (under 500ms).');
          setScreenState(SCREEN_STATE.ERROR);
          return;
        }

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

          if (isQueryMode) {
            const queryRes = await processVoiceQuery(base64Audio, mimeType);
            if (!queryRes || queryRes.isQuery === false) {
              setErrorMessage(queryRes?.message || 'આ ટ્રાન્ઝેક્શન છે. સામાન્ય નોંધણી મોડનો ઉપયોગ કરો. / This is a transaction, please use standard recording mode.');
              setScreenState(SCREEN_STATE.ERROR);
              return;
            }

            setQueryResult(queryRes);
            setScreenState(SCREEN_STATE.QUERY_RESPONSE);
            return;
          }

          const result = await processVoiceAudio(base64Audio, mimeType);

          if (!result || result.intent === 'unclear' || (result.confidence === 'low' && !result.customer_name && !result.amount)) {
            setErrorMessage('સંભળાયું નથી, ફરી બોલો / Sunai nahi diya, phir se bolo');
            setScreenState(SCREEN_STATE.ERROR);
            return;
          }

          const isStockIntent = result.intent === 'add_stock' || result.intent === 'reduce_stock';

          if (isStockIntent) {
            const stockItemName = result.stock_item_name || (result.items && result.items[0]) || 'વસ્તુ (Item)';
            const quantity = result.quantity || 1;
            const unit = result.unit || 'packet';

            setParsedData({
              isStock: true,
              intent: result.intent,
              stockItemName,
              quantity,
              unit,
              transcription: result.transcription_gujarati || '',
              detectedLanguage: result.detectedLanguage || 'gujarati',
            });

            setEditStockItemName(stockItemName);
            setEditStockQuantity(quantity.toString());
            setEditStockUnit(unit);

            setScreenState(SCREEN_STATE.CONFIRMATION);
            return;
          }

          const txType = mapIntentToTxType(result.intent);
          const customerName = result.customer_name || 'ગ્રાહક (Unknown)';
          const amount = result.amount || 0;
          const phone = result.customer_phone || '';
          const suggestedName = result.suggested_customer_name || null;
          const nameConfidence = result.name_confidence || result.confidence || 'high';
          const detectedLanguage = result.detectedLanguage || 'gujarati';

          setParsedData({
            isStock: false,
            customerName,
            suggestedName,
            nameConfidence,
            amount,
            txType,
            phone,
            items: result.items || [],
            transcription: result.transcription_gujarati || '',
            detectedLanguage,
          });

          // Pre-fill edit fields
          setEditCustomerName(customerName);
          setEditAmount(amount.toString());
          setEditPhone(phone);
          setEditTxType(txType);

          setScreenState(SCREEN_STATE.CONFIRMATION);
        } catch (apiErr) {
          console.error('Voice processing API error:', apiErr);
          setErrorMessage(apiErr.message || 'સંભળાયું નથી, ફરી બોલો / Sunai nahi diya, phir se bolo');
          setScreenState(SCREEN_STATE.ERROR);
        }
      };
    } catch (err) {
      console.error('Audio encoding error:', err);
      setErrorMessage('સંભળાયું નથી, ફરી બોલો / Sunai nahi diya, phir se bolo');
      setScreenState(SCREEN_STATE.ERROR);
    }
  };

  // 4. Save Stock or Transaction
  const executeSaveStock = async (finalItemName, finalQty, finalUnit, isReduce = false) => {
    setScreenState(SCREEN_STATE.SAVING);
    setErrorMessage('');

    const shopkeeperId = localStorage.getItem('voice_udhar_shopkeeper_id');
    if (!shopkeeperId) {
      setErrorMessage('દુકાનદાર આઈડી મળ્યો નથી. ફરી લોગીન કરો. / Shopkeeper ID missing.');
      setScreenState(SCREEN_STATE.ERROR);
      return;
    }

    try {
      const cleanItemName = finalItemName.trim();
      const numQty = Number(finalQty);

      if (!cleanItemName) {
        setErrorMessage('મહેરબાની કરીને વસ્તુનું નામ દાખલ કરો. / Please enter item name.');
        setScreenState(SCREEN_STATE.EDITING);
        return;
      }

      if (isNaN(numQty) || numQty < 0) {
        setErrorMessage('મહેરબાની કરીને સાચો જથ્થો દાખલ કરો. / Please enter valid quantity.');
        setScreenState(SCREEN_STATE.EDITING);
        return;
      }

      await addOrUpdateInventoryApi({
        itemName: cleanItemName,
        quantity: isReduce ? -numQty : numQty,
        unit: finalUnit || 'packet',
        mode: 'add',
      });

      setStockSuccessNote(`સ્ટોક અપડેટ થયો: ${cleanItemName} ${isReduce ? '-' : '+'}${numQty} ${finalUnit || 'packet'}`);
      setScreenState(SCREEN_STATE.SUCCESS);

      setTimeout(() => {
        resetToIdle();
      }, 2500);
    } catch (err) {
      console.error('Error saving stock:', err);
      setErrorMessage(err.message || 'સ્ટોક સેવ કરવામાં ભૂલ આવી / Failed to save stock');
      setScreenState(SCREEN_STATE.ERROR);
    }
  };

  const executeSave = async (finalName, finalAmount, finalTxType, finalPhone = '') => {
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
      const cleanPhone = finalPhone.trim();
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

      // Check if customer exists using fuzzy matching
      const existingCustomers = await getCustomers(shopkeeperId);
      const normClean = cleanName.toLowerCase();

      let customer = existingCustomers.find((c) => {
        if (!c.name) return false;
        const normC = c.name.trim().toLowerCase();
        if (normC === normClean) return true;
        if (normClean.length >= 2 && normC.length >= 2) {
          return normC.includes(normClean) || normClean.includes(normC);
        }
        return false;
      });

      // Create customer if not found, or update phone if user provided a real phone
      if (!customer) {
        customer = await createCustomer({
          shopkeeperId,
          name: cleanName,
          phone: cleanPhone || '0000000000',
        });
      } else if (cleanPhone && cleanPhone !== '0000000000' && (!customer.phone || customer.phone === '0000000000')) {
        customer = await createCustomer({
          shopkeeperId,
          customerId: customer.customerId,
          name: customer.name,
          phone: cleanPhone,
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
        detectedLanguage: parsedData?.detectedLanguage || 'gujarati',
      });

      if (finalTxType === 'sale' && parsedData?.items && parsedData.items.length > 0) {
        const itemsStr = Array.isArray(parsedData.items) ? parsedData.items.join(', ') : parsedData.items;
        setStockSuccessNote(`સ્ટોક અપડેટ થયો: ${itemsStr}`);
      } else {
        setStockSuccessNote('');
      }

      // Automatically generate bill preview
      try {
        const billResult = await generateBillApi({
          shopkeeperId,
          customerId: customer.customerId,
          customerName: customer.name || cleanName,
          customerPhone: customer.phone || cleanPhone || '0000000000',
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
    if (parsedData.isStock) {
      executeSaveStock(parsedData.stockItemName, parsedData.quantity, parsedData.unit, parsedData.intent === 'reduce_stock');
    } else {
      executeSave(parsedData.customerName, parsedData.amount, parsedData.txType, parsedData.phone);
    }
  };

  const handleSaveEdit = (e) => {
    e.preventDefault();
    if (parsedData?.isStock) {
      executeSaveStock(editStockItemName, editStockQuantity, editStockUnit, parsedData.intent === 'reduce_stock');
    } else {
      executeSave(editCustomerName, editAmount, editTxType, editPhone);
    }
  };

  // SpeechSynthesis TTS helper logic
  const speakText = async (text) => {
    if (!('speechSynthesis' in window) || !text) return;
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    const getVoices = () => new Promise((resolve) => {
      let voices = window.speechSynthesis.getVoices();
      if (voices && voices.length > 0) return resolve(voices);
      const handleVoices = () => {
        voices = window.speechSynthesis.getVoices();
        window.speechSynthesis.removeEventListener('voiceschanged', handleVoices);
        resolve(voices || []);
      };
      window.speechSynthesis.addEventListener('voiceschanged', handleVoices);
      setTimeout(() => resolve(window.speechSynthesis.getVoices() || []), 800);
    });

    const voices = await getVoices();
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

    utterance.rate = 0.9;
    utterance.onend = () => setIsSpeakingQuery(false);
    utterance.onerror = () => setIsSpeakingQuery(false);

    setIsSpeakingQuery(true);
    window.speechSynthesis.speak(utterance);
  };

  // Automatically trigger TTS when QUERY_RESPONSE state is reached
  useEffect(() => {
    if (screenState === SCREEN_STATE.QUERY_RESPONSE && queryResult?.answerText) {
      speakText(queryResult.answerText);
    }
    return () => {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, [screenState, queryResult]);

  const toggleQuerySpeech = () => {
    if (isSpeakingQuery) {
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
      setIsSpeakingQuery(false);
    } else if (queryResult?.answerText) {
      speakText(queryResult.answerText);
    }
  };

  const resetToIdle = () => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setIsSpeakingQuery(false);
    setScreenState(SCREEN_STATE.IDLE);
    setErrorMessage('');
    setParsedData(null);
    setQueryResult(null);
    setGeneratedBill(null);
    setShowBillModal(false);
    setStockSuccessNote('');
  };

  const handleCloseBillModal = () => {
    setShowBillModal(false);
    resetToIdle();
  };

  return (
    <div className="main-content">
      {/* TODAY REMINDERS QUEUE BANNER / CARD */}
      {!isTodayRemindersDismissed && todayRemindersCount > 0 && screenState === SCREEN_STATE.IDLE && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95 }}
          onClick={() => navigate('/reminders/today')}
          style={{
            backgroundColor: 'rgba(124, 58, 237, 0.15)',
            border: '1px solid rgba(240, 198, 116, 0.5)',
            borderRadius: 'var(--radius-md)',
            padding: '0.85rem 1rem',
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: 'pointer',
            boxShadow: '0 4px 15px rgba(124, 58, 237, 0.2)',
            backdropFilter: 'blur(10px)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', flex: 1 }}>
            <Sparkles size={22} color="#F0C674" style={{ flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: '0.95rem', color: '#F8FAFC', fontWeight: '800' }}>
                📋 આજે {todayRemindersCount} રિમાઇન્ડર મોકલવાના છે
              </div>
              <div style={{ fontSize: '0.75rem', color: '#CBD5E1', fontWeight: '500' }}>
                {todayRemindersCount} {todayRemindersCount === 1 ? 'reminder' : 'reminders'} to send today — ટેપ કરીને જુઓ / Tap to view
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <ChevronRight size={18} color="#F0C674" />
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsTodayRemindersDismissed(true);
              }}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#94A3B8',
                padding: '0.3rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '6px',
              }}
              title="Dismiss card"
              aria-label="Dismiss card"
            >
              <X size={16} />
            </button>
          </div>
        </motion.div>
      )}

      {/* LOW STOCK ALERT BANNER */}
      {!isStockAlertDismissed && lowStockCount > 0 && screenState === SCREEN_STATE.IDLE && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95 }}
          onClick={() => navigate('/inventory')}
          style={{
            backgroundColor: 'rgba(245, 158, 11, 0.15)',
            border: '1px solid rgba(245, 158, 11, 0.4)',
            borderRadius: 'var(--radius-md)',
            padding: '0.75rem 0.9rem',
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: 'pointer',
            boxShadow: '0 4px 15px rgba(245, 158, 11, 0.15)',
            backdropFilter: 'blur(10px)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flex: 1 }}>
            <Package size={20} color="#FDE68A" style={{ flexShrink: 0 }} />
            <div style={{ fontSize: '0.9rem', color: '#F8FAFC', fontWeight: '700' }}>
              ⚠️ {lowStockCount} વસ્તુઓ ખતમ થવાની છે
              <span style={{ display: 'block', fontSize: '0.75rem', color: '#FDE68A', fontWeight: '500' }}>
                {lowStockCount} {lowStockCount === 1 ? 'item is' : 'items are'} running low on stock
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <ChevronRight size={18} color="#FDE68A" />
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsStockAlertDismissed(true);
              }}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#94A3B8',
                padding: '0.3rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '6px',
              }}
              title="Dismiss banner"
              aria-label="Dismiss banner"
            >
              <X size={16} />
            </button>
          </div>
        </motion.div>
      )}

      {/* URGENT PENDING UDHAAR ALERT BANNER */}
      {!isAlertBannerDismissed && pendingAlertCount > 0 && screenState === SCREEN_STATE.IDLE && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95 }}
          onClick={() => navigate('/alerts')}
          style={{
            backgroundColor: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(239, 68, 68, 0.4)',
            borderRadius: 'var(--radius-md)',
            padding: '0.75rem 0.9rem',
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: 'pointer',
            boxShadow: '0 4px 15px rgba(239, 68, 68, 0.15)',
            backdropFilter: 'blur(10px)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flex: 1 }}>
            <AlertTriangle size={20} color="#FCA5A5" style={{ flexShrink: 0 }} />
            <div style={{ fontSize: '0.9rem', color: '#F8FAFC', fontWeight: '700' }}>
              ⚠️ {pendingAlertCount} ગ્રાહકોનું ઉધાર 15 દિવસથી બાકી છે
              <span style={{ display: 'block', fontSize: '0.75rem', color: '#FDA4AF', fontWeight: '500' }}>
                {pendingAlertCount} {pendingAlertCount === 1 ? 'customer has' : 'customers have'} udhaar pending for 15+ days
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <ChevronRight size={18} color="#FCA5A5" />
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsAlertBannerDismissed(true);
              }}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#94A3B8',
                padding: '0.3rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '6px',
              }}
              title="Dismiss banner"
              aria-label="Dismiss banner"
            >
              <X size={16} />
            </button>
          </div>
        </motion.div>
      )}

      {/* SMART PROACTIVE REMINDER SUGGESTION CARD */}
      {!isReminderDismissed && reminders.length > 0 && currentReminderIndex < reminders.length && screenState === SCREEN_STATE.IDLE && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            backgroundColor: 'rgba(124, 58, 237, 0.15)',
            border: '1px solid rgba(240, 198, 116, 0.4)',
            borderRadius: 'var(--radius-md)',
            padding: '1rem',
            marginBottom: '1rem',
            backdropFilter: 'blur(10px)',
            boxShadow: '0 4px 15px rgba(124, 58, 237, 0.2)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem', marginBottom: '0.75rem' }}>
            <Sparkles size={22} color="#F0C674" style={{ flexShrink: 0, marginTop: '2px' }} />
            <div>
              <div style={{ fontSize: '0.95rem', color: '#F8FAFC', fontWeight: '800', lineHeight: '1.3' }}>
                💡 {reminders[currentReminderIndex].name}ને {reminders[currentReminderIndex].daysSinceLastTransaction} દિવસથી યાદ નથી અપાવ્યું. Reminder મોકલવો છે?
              </div>
              <div style={{ fontSize: '0.8rem', color: '#94A3B8', marginTop: '0.2rem', fontStyle: 'italic' }}>
                "{reminders[currentReminderIndex].suggestedMessage}"
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.6rem' }}>
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => handleSendReminder(reminders[currentReminderIndex])}
              style={{
                flex: 1,
                padding: '0.55rem 0.8rem',
                borderRadius: '8px',
                border: '1px solid rgba(34, 197, 94, 0.5)',
                backgroundColor: 'rgba(34, 197, 94, 0.2)',
                color: '#4ADE80',
                fontWeight: '700',
                fontSize: '0.875rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.35rem',
              }}
            >
              <MessageSquare size={16} />
              હા, મોકલો / Yes, Send
            </motion.button>

            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={handleLaterReminder}
              style={{
                padding: '0.55rem 0.9rem',
                borderRadius: '8px',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                color: '#94A3B8',
                fontWeight: '600',
                fontSize: '0.875rem',
                cursor: 'pointer',
              }}
            >
              પછી / Later
            </motion.button>
          </div>
        </motion.div>
      )}

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

      {/* Mode Toggle Button */}
      {(screenState === SCREEN_STATE.IDLE || screenState === SCREEN_STATE.RECORDING) && (
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.25rem' }}>
          <button
            type="button"
            onClick={() => setIsQueryMode(!isQueryMode)}
            disabled={screenState === SCREEN_STATE.RECORDING}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.6rem 1.2rem',
              borderRadius: '24px',
              border: isQueryMode ? '1px solid rgba(240, 198, 116, 0.6)' : '1px solid rgba(255, 255, 255, 0.15)',
              backgroundColor: isQueryMode ? 'rgba(240, 198, 116, 0.2)' : 'rgba(255, 255, 255, 0.05)',
              color: isQueryMode ? '#F0C674' : '#94A3B8',
              fontSize: '0.95rem',
              fontWeight: '700',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              backdropFilter: 'blur(8px)',
              boxShadow: isQueryMode ? '0 4px 15px rgba(240, 198, 116, 0.2)' : 'none'
            }}
          >
            <HelpCircle size={18} color={isQueryMode ? '#F0C674' : '#94A3B8'} />
            <span>{isQueryMode ? 'પ્રશ્ન મોડ (Active) / Question Mode' : 'પ્રશ્ન પૂછો / Ask a Question'}</span>
          </button>
        </div>
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

          {parsedData.isStock ? (
            <div className="parsed-result-box">
              <div className="parsed-main-text" style={{ fontSize: '1.3rem', color: '#F0C674' }}>
                {parsedData.stockItemName}, {parsedData.quantity} {parsedData.unit} {parsedData.intent === 'reduce_stock' ? 'ઘટાડ્યું (Sold)' : 'ઉમેર્યું (Added)'}
              </div>
              <div style={{ marginTop: '0.5rem' }}>
                <span
                  style={{
                    fontSize: '0.8rem',
                    padding: '0.25rem 0.65rem',
                    borderRadius: '12px',
                    backgroundColor: 'rgba(124, 58, 237, 0.25)',
                    color: '#C084FC',
                    border: '1px solid rgba(192, 132, 252, 0.4)',
                    fontWeight: '700',
                  }}
                >
                  📦 સ્ટોક અપડેટ / Inventory Update
                </span>
              </div>
              {parsedData.transcription && (
                <div style={{ marginTop: '0.85rem', fontSize: '0.9rem', color: '#94A3B8', fontStyle: 'italic', background: 'rgba(255, 255, 255, 0.04)', padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px dashed rgba(255, 255, 255, 0.12)' }}>
                  "{parsedData.transcription}"
                </div>
              )}
            </div>
          ) : (
            <div className="parsed-result-box">
              <div className="parsed-main-text" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span>{parsedData.customerName}, ₹{parsedData.amount}</span>
                {!parsedData.suggestedName && (
                  <span
                    style={{
                      fontSize: '0.75rem',
                      padding: '0.2rem 0.5rem',
                      borderRadius: '12px',
                      backgroundColor: 'rgba(124, 58, 237, 0.25)',
                      color: '#C084FC',
                      border: '1px solid rgba(192, 132, 252, 0.4)',
                      fontWeight: '600',
                    }}
                  >
                    ✨ નવો ગ્રાહક / New Customer
                  </span>
                )}
                {parsedData.detectedLanguage && parsedData.detectedLanguage !== 'gujarati' && (
                  <span
                    style={{
                      fontSize: '0.75rem',
                      padding: '0.2rem 0.55rem',
                      borderRadius: '12px',
                      backgroundColor: 'rgba(240, 198, 116, 0.15)',
                      color: '#F0C674',
                      border: '1px solid rgba(240, 198, 116, 0.35)',
                      fontWeight: '700',
                    }}
                  >
                    🌐 {parsedData.detectedLanguage === 'hindi' ? 'હિન્દી' : parsedData.detectedLanguage === 'english' ? 'English' : 'મિક્સ'}
                  </span>
                )}
              </div>

              {/* Quick-select tap options if a suggested match or low name confidence */}
              {(parsedData.suggestedName || parsedData.nameConfidence === 'low' || parsedData.nameConfidence === 'medium') && (
                <div style={{ marginTop: '0.75rem', padding: '0.6rem 0.75rem', backgroundColor: 'rgba(240, 198, 116, 0.08)', borderRadius: '8px', border: '1px solid rgba(240, 198, 116, 0.25)' }}>
                  <div style={{ fontSize: '0.8rem', color: '#F0C674', marginBottom: '0.4rem', fontWeight: '500' }}>
                    🎯 ગ્રાહકનું નામ પસંદ કરો / Select Customer Name:
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => {
                        setParsedData({ ...parsedData, customerName: parsedData.customerName });
                        setEditCustomerName(parsedData.customerName);
                      }}
                      style={{
                        padding: '0.35rem 0.75rem',
                        borderRadius: '6px',
                        fontSize: '0.85rem',
                        border: editCustomerName === parsedData.customerName ? '1px solid #F0C674' : '1px solid rgba(255,255,255,0.2)',
                        backgroundColor: editCustomerName === parsedData.customerName ? 'rgba(240, 198, 116, 0.25)' : 'rgba(255,255,255,0.05)',
                        color: '#F8FAFC',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.3rem'
                      }}
                    >
                      {editCustomerName === parsedData.customerName && <Check size={14} color="#F0C674" />}
                      <span>{parsedData.customerName}</span>
                    </button>

                    {parsedData.suggestedName && parsedData.suggestedName !== parsedData.customerName && (
                      <button
                        type="button"
                        onClick={() => {
                          setParsedData({ ...parsedData, customerName: parsedData.suggestedName });
                          setEditCustomerName(parsedData.suggestedName);
                        }}
                        style={{
                          padding: '0.35rem 0.75rem',
                          borderRadius: '6px',
                          fontSize: '0.85rem',
                          border: editCustomerName === parsedData.suggestedName ? '1px solid #F0C674' : '1px solid rgba(255,255,255,0.2)',
                          backgroundColor: editCustomerName === parsedData.suggestedName ? 'rgba(240, 198, 116, 0.25)' : 'rgba(255,255,255,0.05)',
                          color: '#F8FAFC',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.3rem'
                        }}
                      >
                        {editCustomerName === parsedData.suggestedName && <Check size={14} color="#F0C674" />}
                        <span>{parsedData.suggestedName} (Existing)</span>
                      </button>
                    )}
                  </div>
                </div>
              )}

              {(!parsedData.phone || parsedData.phone === '0000000000') ? (
                <div
                  onClick={() => setScreenState(SCREEN_STATE.EDITING)}
                  style={{
                    marginTop: '0.5rem',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    fontSize: '0.8rem',
                    color: '#FDA4AF',
                    backgroundColor: 'rgba(244, 63, 94, 0.12)',
                    padding: '0.25rem 0.6rem',
                    borderRadius: '6px',
                    border: '1px solid rgba(244, 63, 94, 0.3)',
                    cursor: 'pointer'
                  }}
                >
                  <AlertTriangle size={14} color="#F43F5E" />
                  <span>ફોન નંબર મળ્યો નથી (ઉમેરવા ટેપ કરો) / Phone number not captured, tap to add</span>
                </div>
              ) : (
                <div style={{ marginTop: '0.4rem', fontSize: '0.85rem', color: '#94A3B8' }}>
                  📞 {parsedData.phone}
                </div>
              )}

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
          )}

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

          {parsedData?.isStock ? (
            <form onSubmit={handleSaveEdit}>
              <div className="form-group">
                <label className="form-label" htmlFor="editStockItem">
                  વસ્તુનું નામ
                  <span className="form-sublabel"> Item Name</span>
                </label>
                <input
                  id="editStockItem"
                  type="text"
                  className="form-input"
                  value={editStockItemName}
                  onChange={(e) => setEditStockItemName(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div className="form-group">
                  <label className="form-label" htmlFor="editStockQty">
                    જથ્થો
                    <span className="form-sublabel"> Quantity</span>
                  </label>
                  <input
                    id="editStockQty"
                    type="number"
                    min="0"
                    step="any"
                    className="form-input"
                    value={editStockQuantity}
                    onChange={(e) => setEditStockQuantity(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="editStockUnit">
                    એકમ
                    <span className="form-sublabel"> Unit</span>
                  </label>
                  <select
                    id="editStockUnit"
                    className="form-select"
                    value={editStockUnit}
                    onChange={(e) => setEditStockUnit(e.target.value)}
                  >
                    <option value="packet">પેકેટ (packet)</option>
                    <option value="piece">પીસ (piece)</option>
                    <option value="kg">કિલો (kg)</option>
                    <option value="gram">ગ્રામ (gram)</option>
                    <option value="liter">લીટર (liter)</option>
                    <option value="box">બોક્સ (box)</option>
                  </select>
                </div>
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
          ) : (
            <form onSubmit={handleSaveEdit}>
              <div className="form-group">
                <label className="form-label" htmlFor="editCustomer">
                  ગ્રાહકનું નામ
                  <span className="form-sublabel"> Customer Name</span>
                </label>
                <input
                  ref={editCustomerNameInputRef}
                  id="editCustomer"
                  type="text"
                  className="form-input"
                  value={editCustomerName}
                  onChange={(e) => setEditCustomerName(e.target.value)}
                  required
                />

                {/* Quick consonant swap shortcut buttons */}
                <div style={{ marginTop: '0.6rem' }}>
                  <div style={{ fontSize: '0.75rem', color: '#94A3B8', marginBottom: '0.3rem', fontWeight: '500' }}>
                    ⚡ ઝડપી અક્ષર બદલો (Quick Swap):
                  </div>
                  <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                    {[
                      ['બ', 'ભ'],
                      ['ક', 'ખ'],
                      ['ગ', 'ઘ'],
                      ['ડ', 'ઢ'],
                      ['પ', 'ફ'],
                      ['ત', 'થ'],
                    ].map(([a, b]) => (
                      <button
                        key={`${a}-${b}`}
                        type="button"
                        onClick={() => handleSwapConsonantPair(a, b)}
                        style={{
                          padding: '0.25rem 0.55rem',
                          fontSize: '0.8rem',
                          borderRadius: '6px',
                          border: '1px solid rgba(240, 198, 116, 0.3)',
                          backgroundColor: 'rgba(240, 198, 116, 0.1)',
                          color: '#F0C674',
                          cursor: 'pointer',
                          fontWeight: '600',
                        }}
                        title={`Swap ${a} ↔ ${b}`}
                      >
                        {a} ↔ {b}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="editPhone">
                  મોબાઇલ નંબર
                  <span className="form-sublabel"> Phone Number (Optional)</span>
                </label>
                <input
                  id="editPhone"
                  type="tel"
                  className="form-input"
                  placeholder="9876543210"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
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
          )}
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
          {stockSuccessNote && (
            <div
              style={{
                marginTop: '0.5rem',
                fontSize: '0.95rem',
                color: '#34D399',
                backgroundColor: 'rgba(16, 185, 129, 0.15)',
                border: '1px solid rgba(52, 211, 153, 0.3)',
                padding: '0.4rem 0.8rem',
                borderRadius: '8px',
                fontWeight: '700',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
              }}
            >
              <Package size={16} color="#34D399" />
              <span>{stockSuccessNote}</span>
            </div>
          )}
          <p style={{ color: '#94A3B8', fontSize: '1rem', textAlign: 'center', fontWeight: '500' }}>
            {parsedData?.isStock ? 'સ્ટોક સફળતાપૂર્વક અપડેટ થયો છે.' : 'ટ્રાન્ઝેક્શન સફળતાપૂર્વક ઉમેરાઈ ગયું છે.'}
          </p>
        </motion.div>
      )}

      {/* 9. QUERY RESPONSE CARD STATE */}
      {screenState === SCREEN_STATE.QUERY_RESPONSE && queryResult && (
        <motion.div
          initial={{ opacity: 0, y: 25 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 350, damping: 25 }}
          className="confirmation-card"
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', marginBottom: '1rem', color: '#F0C674', fontWeight: '800', fontSize: '1.15rem' }}>
            <MessageSquare size={24} />
            <span>જવાબ / Answer</span>
          </div>

          <div style={{ backgroundColor: 'rgba(255, 255, 255, 0.04)', borderRadius: '12px', padding: '1.25rem', border: '1px solid rgba(240, 198, 116, 0.25)', marginBottom: '1.25rem', textAlign: 'center', maxHeight: '300px', overflowY: 'auto' }}>
            <div style={{ fontSize: '1.25rem', fontWeight: '800', color: '#F8FAFC', marginBottom: '0.5rem', lineHeight: '1.4', wordBreak: 'break-word', whiteSpace: 'pre-line' }}>
              {queryResult.answerText}
            </div>
            {queryResult.answerTextEnglish && (
              <div style={{ fontSize: '0.95rem', color: '#94A3B8', fontWeight: '500', wordBreak: 'break-word', whiteSpace: 'pre-line' }}>
                {queryResult.answerTextEnglish}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={toggleQuerySpeech}
              style={{
                width: '100%',
                padding: '0.85rem',
                borderRadius: 'var(--radius-md)',
                border: '1px solid rgba(240, 198, 116, 0.3)',
                background: isSpeakingQuery
                  ? 'linear-gradient(135deg, #F43F5E 0%, #E11D48 100%)'
                  : 'linear-gradient(135deg, #7C3AED 0%, #C026D3 100%)',
                color: '#ffffff',
                fontSize: '1.1rem',
                fontWeight: '700',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                cursor: 'pointer',
              }}
            >
              {isSpeakingQuery ? (
                <>
                  <VolumeX size={22} />
                  <span>અવાજ બંધ કરો / Stop Voice</span>
                </>
              ) : (
                <>
                  <Volume2 size={22} color="#F0C674" />
                  <span>ફરી સાંભળો / Read Answer</span>
                </>
              )}
            </motion.button>

            <motion.button
              whileTap={{ scale: 0.97 }}
              className="btn-primary"
              onClick={resetToIdle}
            >
              <RotateCcw size={20} />
              <span>પાછા બોલો / Ask Again</span>
            </motion.button>
          </div>
        </motion.div>
      )}
    </div>
  );
}
