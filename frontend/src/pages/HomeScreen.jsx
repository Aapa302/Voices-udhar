import React, { useState, useRef, useEffect } from 'react';
import { Mic, Square, Loader2, CheckCircle2, Edit2, RotateCcw, Save, AlertCircle, Sparkles, Check, Phone, AlertTriangle, HelpCircle, Volume2, VolumeX, MessageSquare, X, ChevronRight, WifiOff, CloudOff, Package } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { processVoiceAudio, processVoiceQuery } from '../api/voice';
import { getCustomers, createCustomer } from '../api/customers';
import { logTransaction } from '../api/transactions';
import { generateBillApi } from '../api/bill';
import { addOrUpdateInventoryApi } from '../api/inventory';
import { savePendingRecording, getPendingRecordingsCount, getAllPendingRecordings, deletePendingRecording } from '../utils/offlineQueue';
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
  QUERY_RESPONSE: 'QUERY_RESPONSE',
  OFFLINE_RECORDED: 'OFFLINE_RECORDED',
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

  // Voice Query State
  const [isQueryMode, setIsQueryMode] = useState(false);
  const [queryResult, setQueryResult] = useState(null);
  const [isSpeakingQuery, setIsSpeakingQuery] = useState(false);

  // Network online/offline state & offline queue state
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [pendingOfflineCount, setPendingOfflineCount] = useState(0);

  // Sync state
  const [syncQueue, setSyncQueue] = useState([]);
  const [currentSyncIndex, setCurrentSyncIndex] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [currentSyncItem, setCurrentSyncItem] = useState(null);

  const updateOfflineCount = async () => {
    const shopId = localStorage.getItem('voice_udhar_shop_id');
    const count = await getPendingRecordingsCount(shopId);
    setPendingOfflineCount(count);
  };

  // Start Sync Process
  const startOfflineSync = async (specificQueue = null) => {
    if (isSyncing || !navigator.onLine) return;

    let itemsToSync = specificQueue;
    if (!itemsToSync) {
      const activeShopId = localStorage.getItem('voice_udhar_shop_id');
      const allPending = await getAllPendingRecordings();
      itemsToSync = allPending.filter((item) => !item.shopId || !activeShopId || item.shopId === activeShopId);
    }

    if (!itemsToSync || itemsToSync.length === 0) {
      setIsSyncing(false);
      setSyncQueue([]);
      setCurrentSyncIndex(0);
      setCurrentSyncItem(null);
      await updateOfflineCount();
      return;
    }

    // Sort oldest first
    itemsToSync.sort((a, b) => {
      const timeA = new Date(a.timestamp || a.createdAt || a.id).getTime();
      const timeB = new Date(b.timestamp || b.createdAt || b.id).getTime();
      return timeA - timeB;
    });

    setSyncQueue(itemsToSync);
    setCurrentSyncIndex(0);
    setIsSyncing(true);
    processNextSyncItem(itemsToSync, 0);
  };

  // Process item at index
  const processNextSyncItem = async (queue, index) => {
    if (index >= queue.length) {
      setIsSyncing(false);
      setSyncQueue([]);
      setCurrentSyncIndex(0);
      setCurrentSyncItem(null);
      await updateOfflineCount();
      resetToIdle();
      return;
    }

    const item = queue[index];
    setCurrentSyncItem(item);
    setCurrentSyncIndex(index);
    setScreenState(SCREEN_STATE.PROCESSING);
    setErrorMessage('');

    try {
      if (item.isQueryMode) {
        const queryRes = await processVoiceQuery(item.audioBase64, item.mimeType || 'audio/webm');
        if (!queryRes || queryRes.isQuery === false) {
          setErrorMessage(queryRes?.message || 'આ ટ્રાન્ઝેક્શન છે. / This is a transaction.');
          setScreenState(SCREEN_STATE.ERROR);
          return;
        }
        setQueryResult(queryRes);
        setScreenState(SCREEN_STATE.QUERY_RESPONSE);
        return;
      }

      const result = await processVoiceAudio(item.audioBase64, item.mimeType || 'audio/webm');

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
          originalTimestamp: item.timestamp || item.createdAt,
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
        originalTimestamp: item.timestamp || item.createdAt,
      });

      setEditCustomerName(customerName);
      setEditAmount(amount.toString());
      setEditPhone(phone);
      setEditTxType(txType);

      setScreenState(SCREEN_STATE.CONFIRMATION);
    } catch (apiErr) {
      console.error('Error processing queued offline voice note:', apiErr);
      setErrorMessage(apiErr.message || 'સિંક પ્રોસેસ કરવામાં ભૂલ આવી / Sync processing error');
      setScreenState(SCREEN_STATE.ERROR);
    }
  };

  useEffect(() => {
    updateOfflineCount();

    const checkAndAutoSync = async () => {
      if (navigator.onLine) {
        const count = await getPendingRecordingsCount(localStorage.getItem('voice_udhar_shop_id'));
        if (count > 0 && !isSyncing) {
          startOfflineSync();
        }
      }
    };

    checkAndAutoSync();

    const handleOnline = () => {
      setIsOnline(true);
      startOfflineSync();
    };

    const handleOffline = () => setIsOnline(false);

    const handleShopChanged = () => {
      resetToIdle();
      updateOfflineCount();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('voice_udhar_shop_changed', handleShopChanged);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('voice_udhar_shop_changed', handleShopChanged);
    };
  }, []);

  // SpeechSynthesis TTS helper logic for query mode
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

  // Quick consonant swap helper function for Gujarati pairs
  const handleSwapConsonantPair = (charA, charB) => {
    if (!editCustomerName) {
      setEditCustomerName(charA);
      return;
    }

    const hasA = editCustomerName.includes(charA);
    const hasB = editCustomerName.includes(charB);

    if (hasA) {
      setEditCustomerName(editCustomerName.replaceAll(charA, charB));
    } else if (hasB) {
      setEditCustomerName(editCustomerName.replaceAll(charB, charA));
    } else {
      setEditCustomerName(editCustomerName + charB);
    }
  };

  // Media recorder refs & recording start time
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordingStartTimeRef = useRef(null);

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

      let mimeType = 'audio/webm';
      if (!MediaRecorder.isTypeSupported('audio/webm')) {
        if (MediaRecorder.isTypeSupported('audio/mp4')) {
          mimeType = 'audio/mp4';
        } else if (MediaRecorder.isTypeSupported('audio/aac')) {
          mimeType = 'audio/aac';
        } else {
          mimeType = '';
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
        stream.getTracks().forEach((track) => track.stop());

        const duration = Date.now() - (recordingStartTimeRef.current || 0);
        if (duration < 500) {
          setErrorMessage('ખૂબ ટૂંકું રેકોર્ડિંગ (0.5 સેકન્ડથી ઓછું). / Recording too short.');
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
          const base64Audio = base64AudioWithHeader.split(',')[1] || base64AudioWithHeader;

          if (!navigator.onLine) {
            const shopId = localStorage.getItem('voice_udhar_shop_id') || '';
            const shopkeeperId = localStorage.getItem('voice_udhar_shopkeeper_id') || '';

            await savePendingRecording({
              audioBase64: base64Audio,
              mimeType,
              timestamp: new Date().toISOString(),
              shopId,
              shopkeeperId,
              isQueryMode,
            });

            await updateOfflineCount();
            setScreenState(SCREEN_STATE.OFFLINE_RECORDED);
            return;
          }

          if (isQueryMode) {
            const queryRes = await processVoiceQuery(base64Audio, mimeType);
            if (!queryRes || queryRes.isQuery === false) {
              setErrorMessage(queryRes?.message || 'આ ટ્રાન્ઝેક્શન છે. / This is a transaction.');
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
          const transcribedName = result.customer_name || 'ગ્રાહક (Unknown)';
          const amount = result.amount || 0;
          const phone = result.customer_phone || '';
          const suggestedName = result.suggested_customer_name || null;
          const nameConfidence = result.name_confidence || result.confidence || 'high';
          const detectedLanguage = result.detectedLanguage || 'gujarati';

          setParsedData({
            isStock: false,
            transcribedName,
            customerName: transcribedName,
            suggestedName,
            selectedNameChoice: 'transcribed',
            nameConfidence,
            amount,
            txType,
            phone,
            items: result.items || [],
            transcription: result.transcription_gujarati || '',
            detectedLanguage,
          });

          setEditCustomerName(transcribedName);
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
      setErrorMessage('દુકાનદાર આઈડી મળ્યો નથી. ફરી લોગીન કરો.');
      setScreenState(SCREEN_STATE.ERROR);
      return;
    }

    try {
      const cleanItemName = finalItemName.trim();
      const numQty = Number(finalQty);

      if (!cleanItemName) {
        setErrorMessage('મહેરબાની કરીને વસ્તુનું નામ દાખલ કરો.');
        setScreenState(SCREEN_STATE.EDITING);
        return;
      }

      if (isNaN(numQty) || numQty < 0) {
        setErrorMessage('મહેરબાની કરીને સાચો જથ્થો દાખલ કરો.');
        setScreenState(SCREEN_STATE.EDITING);
        return;
      }

      await addOrUpdateInventoryApi({
        itemName: cleanItemName,
        quantity: isReduce ? -numQty : numQty,
        unit: finalUnit || 'packet',
        mode: 'add',
      });

      if (isSyncing && currentSyncItem) {
        await deletePendingRecording(currentSyncItem.id);
        await updateOfflineCount();
      }

      setStockSuccessNote(`સ્ટોક અપડેટ થયો: ${cleanItemName} ${isReduce ? '-' : '+'}${numQty} ${finalUnit || 'packet'}`);
      setScreenState(SCREEN_STATE.SUCCESS);

      setTimeout(() => {
        if (isSyncing) {
          processNextSyncItem(syncQueue, currentSyncIndex + 1);
        } else {
          resetToIdle();
        }
      }, 2000);
    } catch (err) {
      console.error('Error saving stock:', err);
      setErrorMessage(err.message || 'સ્ટોક સેવ કરવામાં ભૂલ આવી');
      setScreenState(SCREEN_STATE.ERROR);
    }
  };

  const executeSave = async (finalName, finalAmount, finalTxType, finalPhone = '') => {
    setScreenState(SCREEN_STATE.SAVING);
    setErrorMessage('');

    const shopkeeperId = localStorage.getItem('voice_udhar_shopkeeper_id');
    if (!shopkeeperId) {
      setErrorMessage('દુકાનદાર આઈડી મળ્યો નથી. ફરી લોગીન કરો.');
      setScreenState(SCREEN_STATE.ERROR);
      return;
    }

    try {
      const cleanName = finalName.trim();
      const cleanPhone = finalPhone.trim();
      const numAmount = Number(finalAmount);

      if (!cleanName) {
        setErrorMessage('મહેરબાની કરીને ગ્રાહકનું નામ દાખલ કરો.');
        setScreenState(SCREEN_STATE.EDITING);
        return;
      }

      if (isNaN(numAmount) || numAmount < 0) {
        setErrorMessage('મહેરબાની કરીને સાચી રકમ દાખલ કરો.');
        setScreenState(SCREEN_STATE.EDITING);
        return;
      }

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

      await logTransaction({
        shopkeeperId,
        customerId: customer.customerId,
        type: finalTxType,
        amount: numAmount,
        items: parsedData?.items || [],
        rawVoiceText: parsedData?.transcription || '',
        detectedLanguage: parsedData?.detectedLanguage || 'gujarati',
        timestamp: parsedData?.originalTimestamp || undefined,
      });

      if (isSyncing && currentSyncItem) {
        await deletePendingRecording(currentSyncItem.id);
        await updateOfflineCount();
      }

      if (finalTxType === 'sale' && parsedData?.items && parsedData.items.length > 0) {
        const itemsStr = Array.isArray(parsedData.items) ? parsedData.items.join(', ') : parsedData.items;
        setStockSuccessNote(`સ્ટોક અપડેટ થયો: ${itemsStr}`);
      } else {
        setStockSuccessNote('');
      }

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

      setTimeout(() => {
        if (isSyncing) {
          processNextSyncItem(syncQueue, currentSyncIndex + 1);
        } else if (!showBillModal) {
          resetToIdle();
        }
      }, 2000);
    } catch (err) {
      console.error('Error saving transaction:', err);
      setErrorMessage(err.message || 'ટ્રાન્ઝેક્શન સેવ કરવામાં ભૂલ આવી');
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

  const resetToIdle = () => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setIsSpeakingQuery(false);
    setIsSyncing(false);
    setSyncQueue([]);
    setCurrentSyncIndex(0);
    setCurrentSyncItem(null);
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
    <div className="main-content" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: 'calc(100vh - 140px)', paddingBottom: '5rem' }}>
      {/* PERSISTENT OFFLINE BANNER */}
      {!isOnline && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            backgroundColor: 'rgba(244, 63, 94, 0.18)',
            border: '1px solid rgba(244, 63, 94, 0.45)',
            borderRadius: 'var(--radius-md)',
            padding: '0.75rem 1rem',
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
            color: '#FDA4AF',
            fontSize: '0.9rem',
            fontWeight: '700',
            backdropFilter: 'blur(10px)',
          }}
        >
          <WifiOff size={20} color="#F43F5E" style={{ flexShrink: 0 }} />
          <div>
            <div>ઑફલાઇન / Offline - રેકોર્ડિંગ પછી સેવ થશે</div>
            <div style={{ fontSize: '0.75rem', color: '#CBD5E1', fontWeight: '500' }}>
              Recording will save locally and process when internet returns
            </div>
          </div>
        </motion.div>
      )}

      {/* PENDING OFFLINE QUEUE INDICATOR */}
      {pendingOfflineCount > 0 && screenState === SCREEN_STATE.IDLE && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            backgroundColor: 'rgba(240, 198, 116, 0.15)',
            border: '1px solid rgba(240, 198, 116, 0.4)',
            borderRadius: 'var(--radius-md)',
            padding: '0.75rem 0.9rem',
            marginBottom: '1.25rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.6rem',
            color: '#F0C674',
            fontSize: '0.9rem',
            fontWeight: '700',
            backdropFilter: 'blur(10px)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <CloudOff size={20} color="#F0C674" style={{ flexShrink: 0 }} />
            <div>
              <div>⏳ {pendingOfflineCount} રેકોર્ડિંગ પ્રોસેસ થવાના બાકી છે</div>
              <div style={{ fontSize: '0.75rem', color: '#CBD5E1', fontWeight: '500' }}>
                {pendingOfflineCount} {pendingOfflineCount === 1 ? 'recording' : 'recordings'} pending processing
              </div>
            </div>
          </div>

          {isOnline && (
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => startOfflineSync()}
              style={{
                backgroundColor: 'rgba(240, 198, 116, 0.25)',
                border: '1px solid rgba(240, 198, 116, 0.6)',
                color: '#F8FAFC',
                padding: '0.45rem 0.85rem',
                borderRadius: '8px',
                fontSize: '0.85rem',
                fontWeight: '700',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                flexShrink: 0,
              }}
            >
              <RotateCcw size={15} />
              હવે સિંક કરો / Sync Now
            </motion.button>
          )}
        </motion.div>
      )}

      {/* BILL PREVIEW MODAL */}
      {showBillModal && generatedBill && (
        <BillModal billData={generatedBill} onClose={handleCloseBillModal} />
      )}

      {/* OFFLINE RECORDED CONFIRMATION */}
      {screenState === SCREEN_STATE.OFFLINE_RECORDED && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', stiffness: 350, damping: 25 }}
          className="confirmation-card"
          style={{ textAlign: 'center', borderColor: 'rgba(240, 198, 116, 0.4)' }}
        >
          <div style={{ color: '#F0C674', marginBottom: '1rem', display: 'flex', justifyContent: 'center' }}>
            <CloudOff size={52} />
          </div>
          <h2 style={{ fontSize: '1.25rem', marginBottom: '0.5rem', color: '#F8FAFC', textAlign: 'center', lineHeight: '1.3' }}>
            રેકોર્ડ થયું, ઇન્ટરનેટ આવે ત્યારે પ્રોસેસ થશે
          </h2>
          <p style={{ color: '#94A3B8', fontSize: '0.95rem', marginBottom: '1.5rem', textAlign: 'center' }}>
            Recorded, will process when internet returns.
          </p>
          <button className="btn-primary" onClick={resetToIdle}>
            <CheckCircle2 size={20} />
            ઠીક છે / Done
          </button>
        </motion.div>
      )}

      {/* PERMISSION DENIED STATE */}
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
          </p>
          <button className="btn-primary" onClick={startRecording}>
            <RotateCcw size={20} />
            ફરી પ્રયાસ કરો / Try Again
          </button>
        </motion.div>
      )}

      {/* SYNC PROGRESS INDICATOR */}
      {isSyncing && syncQueue.length > 0 && (
        <div style={{
          backgroundColor: 'rgba(124, 58, 237, 0.2)',
          border: '1px solid rgba(240, 198, 116, 0.5)',
          borderRadius: 'var(--radius-md)',
          padding: '0.6rem 1rem',
          marginBottom: '1rem',
          textAlign: 'center',
          color: '#F0C674',
          fontWeight: '800',
          fontSize: '1rem',
          backdropFilter: 'blur(10px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.5rem',
        }}>
          <Sparkles size={18} color="#F0C674" />
          <span>સિંક થઈ રહ્યું છે... {currentSyncIndex + 1}/{syncQueue.length}</span>
        </div>
      )}

      {/* ERROR STATE */}
      {screenState === SCREEN_STATE.ERROR && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="confirmation-card" style={{ textAlign: 'center' }}>
          <div className="error-banner">
            {errorMessage || 'સંભળાયું નથી, ફરી બોલો / Sunai nahi diya, phir se bolo'}
          </div>
          {isSyncing ? (
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
              <button
                type="button"
                className="btn-primary"
                style={{ flex: 1 }}
                onClick={() => processNextSyncItem(syncQueue, currentSyncIndex)}
              >
                <RotateCcw size={20} />
                ફરી પ્રયાસ કરો / Retry
              </button>
              <button
                type="button"
                className="btn-secondary"
                style={{ flex: 1 }}
                onClick={() => processNextSyncItem(syncQueue, currentSyncIndex + 1)}
              >
                આ આગળ વધો / Skip
              </button>
            </div>
          ) : (
            <button className="btn-primary" onClick={resetToIdle} style={{ marginTop: '1rem' }}>
              <RotateCcw size={22} />
              ફરી બોલો / Try Again
            </button>
          )}
        </motion.div>
      )}

      {/* ASK A QUESTION TOGGLE BUTTON ABOVE MIC */}
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

      {/* MAIN MIC HERO VIEW (IDLE or RECORDING) */}
      {(screenState === SCREEN_STATE.IDLE || screenState === SCREEN_STATE.RECORDING) && (
        <div className="mic-container" style={{ margin: 'auto 0' }}>
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
              style={{ width: '130px', height: '130px' }}
            >
              {screenState === SCREEN_STATE.RECORDING ? (
                <Square size={52} fill="currentColor" />
              ) : (
                <Mic size={64} color="#ffffff" />
              )}
            </motion.button>
          </div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mic-status-label"
            style={{ fontSize: '1.3rem', marginTop: '1.25rem', fontWeight: '800' }}
          >
            {screenState === SCREEN_STATE.RECORDING ? (
              <span style={{ color: '#F43F5E' }}>રેકોર્ડિંગ ચાલુ છે... (Recording...)</span>
            ) : (
              <span>બોલવા માટે દબાવો</span>
            )}
          </motion.div>
          <div className="mic-status-sub" style={{ fontSize: '0.9rem', marginTop: '0.25rem', color: '#94A3B8' }}>
            {screenState === SCREEN_STATE.RECORDING
              ? 'બંધ કરવા ફરી દબાવો (Tap again to stop)'
              : 'Tap mic once to speak'}
          </div>
        </div>
      )}

      {/* PROCESSING STATE */}
      {screenState === SCREEN_STATE.PROCESSING && (
        <div className="mic-container" style={{ margin: 'auto 0' }}>
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

      {/* CONFIRMATION CARD STATE */}
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
              </div>

              {parsedData.suggestedName && parsedData.suggestedName !== (parsedData.transcribedName || parsedData.customerName) && (
                <div style={{ marginTop: '0.85rem', padding: '0.85rem', backgroundColor: 'rgba(240, 198, 116, 0.12)', borderRadius: '10px', border: '1px solid rgba(240, 198, 116, 0.35)', textAlign: 'left' }}>
                  <div style={{ fontSize: '0.9rem', color: '#F0C674', marginBottom: '0.6rem', fontWeight: '700', lineHeight: '1.3' }}>
                    Maine સાંભળ્યું: <span style={{ color: '#F8FAFC', textDecoration: 'underline' }}>{parsedData.transcribedName || parsedData.customerName}</span>. શું આ '<span style={{ color: '#4ADE80' }}>{parsedData.suggestedName}</span>' છે?
                  </div>
                  <div style={{ display: 'flex', gap: '0.6rem', flexDirection: 'column' }}>
                    <button
                      type="button"
                      onClick={() => {
                        const target = parsedData.transcribedName || parsedData.customerName;
                        setParsedData({ ...parsedData, customerName: target, selectedNameChoice: 'transcribed' });
                        setEditCustomerName(target);
                      }}
                      style={{
                        padding: '0.55rem 0.85rem',
                        borderRadius: '8px',
                        fontSize: '0.85rem',
                        fontWeight: '700',
                        textAlign: 'left',
                        border: parsedData.selectedNameChoice === 'transcribed' ? '1.5px solid #F0C674' : '1px solid rgba(255,255,255,0.2)',
                        backgroundColor: parsedData.selectedNameChoice === 'transcribed' ? 'rgba(240, 198, 116, 0.25)' : 'rgba(255,255,255,0.05)',
                        color: '#F8FAFC',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <span>ના, {parsedData.transcribedName || parsedData.customerName} જ છે</span>
                      {parsedData.selectedNameChoice === 'transcribed' && <Check size={16} color="#F0C674" />}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setParsedData({ ...parsedData, customerName: parsedData.suggestedName, selectedNameChoice: 'suggested' });
                        setEditCustomerName(parsedData.suggestedName);
                      }}
                      style={{
                        padding: '0.55rem 0.85rem',
                        borderRadius: '8px',
                        fontSize: '0.85rem',
                        fontWeight: '700',
                        textAlign: 'left',
                        border: parsedData.selectedNameChoice === 'suggested' ? '1.5px solid #4ADE80' : '1px solid rgba(255,255,255,0.2)',
                        backgroundColor: parsedData.selectedNameChoice === 'suggested' ? 'rgba(74, 222, 128, 0.2)' : 'rgba(255,255,255,0.05)',
                        color: '#F8FAFC',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <span>હા, {parsedData.suggestedName} છે</span>
                      {parsedData.selectedNameChoice === 'suggested' && <Check size={16} color="#4ADE80" />}
                    </button>
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
                  <span>ફોન નંબર ઉમેરવા ટેપ કરો / Tap to add phone</span>
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

      {/* EDITING STATE */}
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
                  વસ્તુનું નામ / Item Name
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
                    જથ્થો / Quantity
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
                    એકમ / Unit
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
                  ગ્રાહકનું નામ / Customer Name
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
                      >
                        {a} ↔ {b}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="editPhone">
                  મોબાઇલ નંબર / Phone Number
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
                  રકમ (₹) / Amount
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
                  પ્રકાર / Type
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

      {/* SAVING STATE */}
      {screenState === SCREEN_STATE.SAVING && (
        <div className="mic-container" style={{ margin: 'auto 0' }}>
          <Loader2 className="animate-spin" size={52} color="#C026D3" />
          <div className="mic-status-label" style={{ marginTop: '1rem' }}>
            સેવ થઈ રહ્યું છે...
          </div>
          <div className="mic-status-sub">Saving transaction...</div>
        </div>
      )}

      {/* SUCCESS STATE */}
      {screenState === SCREEN_STATE.SUCCESS && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
          className="mic-container"
          style={{ margin: 'auto 0' }}
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

      {/* QUERY RESPONSE CARD STATE */}
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
