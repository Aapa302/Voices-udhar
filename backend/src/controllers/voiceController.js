const { GoogleGenerativeAI } = require('@google/generative-ai');
const { generateWithFallback } = require('../config/geminiModelResolver');
const { db } = require('../config/firebase');
const { getEffectiveShopId, isDocInShop } = require('../utils/shopHelper');
const {
  isKnownFirstName,
  isKnownSurname,
  findClosestFirstName,
  findClosestSurname,
  getSuggestedNameCorrection,
} = require('../utils/nameReference');

/**
 * Calculates Levenshtein distance between two strings.
 */
function levenshteinDistance(a, b) {
  if (!a || !b) return (a || b || '').length;
  const matrix = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Normalizes Gujarati consonant confusion pairs and common variations to a canonical form for phonetic matching.
 * Commonly confused pairs/groups:
 * - બ (ba) / ભ (bha) -> બ
 * - ક (ka) / ખ (kha) -> ક
 * - ગ (ga) / ઘ (gha) -> ગ
 * - ડ (da) / ઢ (dha) / દ (da) / ધ (dha) -> ડ
 * - પ (pa) / ફ (fa/pha) -> પ
 * - ત (ta) / થ (tha) / ટ (Ta) / ઠ (Tha) -> ત
 * - ચ (cha) / છ (chha) -> ચ
 * - જ (ja) / ઝ (zha) -> જ
 * - શ (sha) / ષ (sha) / સ (sa) -> સ
 */
function normalizeGujaratiPhonetics(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .toLowerCase()
    .trim()
    .replace(/ભ/g, 'બ')
    .replace(/ખ/g, 'ક')
    .replace(/ઘ/g, 'ગ')
    .replace(/[ઢદધ]/g, 'ડ')
    .replace(/ફ/g, 'પ')
    .replace(/[થટઠ]/g, 'ત')
    .replace(/છ/g, 'ચ')
    .replace(/ઝ/g, 'જ')
    .replace(/[શષ]/g, 'સ')
    .replace(/ઈ/g, 'ઇ')
    .replace(/ઊ/g, 'ઉ')
    .replace(/ભાઈ|ભઈ|બાઇ|બાઈ/g, ''); // strip common honorific suffixes for name core comparison
}

/**
 * Finds a suggested customer match from an array of existing customer names using strict phonetic + edit distance similarity.
 * Matching rules:
 * 1. Exact match (case insensitive): return null (no suggestion needed as it is already identical).
 * 2. Exact phonetic match (after removing honorifics/consonant pairs): return existingName.
 * 3. Strict edit distance threshold:
 *    - For normalized/raw strings, edit distance must be <= 1 character for short names (len <= 5),
 *      or <= 2 characters for long names (len > 5) provided similarity is at least 85% (dist / maxLen <= 0.15).
 *    - Clearly different names (such as "Bhagubhai" vs "Valkubhai") will NOT match.
 */
function findSuggestedCustomerName(extractedName, existingCustomerNames) {
  if (!extractedName || !Array.isArray(existingCustomerNames) || existingCustomerNames.length === 0) {
    return null;
  }

  const cleanExtracted = extractedName.trim();
  const rawLowerExtracted = cleanExtracted.toLowerCase();
  const normExtracted = normalizeGujaratiPhonetics(cleanExtracted);

  let bestMatch = null;
  let minDistance = Infinity;

  for (const existingName of existingCustomerNames) {
    if (!existingName) continue;
    const cleanExisting = existingName.trim();
    const rawLowerExisting = cleanExisting.toLowerCase();

    // Exact match
    if (rawLowerExtracted === rawLowerExisting) {
      return null; // Already an exact match
    }

    const normExisting = normalizeGujaratiPhonetics(cleanExisting);

    // Phonetic normalized exact match
    if (normExtracted.length >= 2 && normExtracted === normExisting) {
      return cleanExisting;
    }

    // Compare both raw and phonetically normalized strings
    const rawDist = levenshteinDistance(rawLowerExtracted, rawLowerExisting);
    const rawMaxLen = Math.max(rawLowerExtracted.length, rawLowerExisting.length);

    const normDist = levenshteinDistance(normExtracted, normExisting);
    const normMaxLen = Math.max(normExtracted.length, normExisting.length);

    // Check strict threshold on raw or normalized distance
    const isValidRawMatch = rawDist <= 1 || (rawMaxLen >= 6 && rawDist <= 2 && (rawDist / rawMaxLen) <= 0.15);
    const isValidNormMatch = normMaxLen >= 2 && (normDist <= 1 || (normMaxLen >= 6 && normDist <= 2 && (normDist / normMaxLen) <= 0.15));

    if (isValidRawMatch || isValidNormMatch) {
      const currentDist = Math.min(rawDist, normDist);
      if (currentDist < minDistance) {
        minDistance = currentDist;
        bestMatch = cleanExisting;
      }
    }
  }

  return bestMatch;
}

// In-memory cache for customer names per shopkeeper (60 second TTL)
const customerCache = new Map();
const CUSTOMER_CACHE_TTL_MS = 60000;

// In-memory multi-turn conversation context per shopkeeper session (5 minute TTL)
const conversationContextMap = new Map();
const CONVERSATION_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Gets the recent conversation context for a shopkeeper session.
 */
function getConversationContext(shopkeeperId, shopId) {
  if (!shopkeeperId) return [];
  const key = `${shopkeeperId}_${shopId || `shop_${shopkeeperId}`}`;
  const contextData = conversationContextMap.get(key);
  if (!contextData) return [];

  // Expire after 5 minutes of inactivity
  if (Date.now() - contextData.lastUpdated > CONVERSATION_TTL_MS) {
    conversationContextMap.delete(key);
    return [];
  }

  return contextData.turns || [];
}

/**
 * Saves a new conversation turn to the shopkeeper session context (keeps last 3 turns).
 */
function recordConversationTurn(shopkeeperId, shopId, turn) {
  if (!shopkeeperId || !turn) return;
  const key = `${shopkeeperId}_${shopId || `shop_${shopkeeperId}`}`;
  const current = getConversationContext(shopkeeperId, shopId);

  const updatedTurns = [...current, turn].slice(-3); // Keep only last 3 turns
  conversationContextMap.set(key, {
    turns: updatedTurns,
    lastUpdated: Date.now(),
  });
}

/**
 * Helper to fetch customer names with 60s in-memory caching and 50 record limit.
 */
async function getCachedCustomerNames(shopkeeperId, shopId, logDetails = true) {
  if (!shopkeeperId || process.env.USE_MOCK_DB === 'true') {
    return [];
  }

  const effectiveShopId = shopId || `shop_${shopkeeperId}`;
  const cacheKey = `${shopkeeperId}_${effectiveShopId}`;

  const cached = customerCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CUSTOMER_CACHE_TTL_MS) {
    if (logDetails) {
      console.log(`[Voice Timing] Firestore customer list fetched from memory CACHE (TTL hit, ${cached.names.length} names)`);
    }
    return cached.names;
  }

  try {
    const snapshot = await db
      .collection('customers')
      .where('shopkeeperId', '==', shopkeeperId)
      .limit(100)
      .get();

    const names = snapshot.docs
      .map((doc) => doc.data())
      .filter((data) => isDocInShop(data, effectiveShopId, shopkeeperId))
      .map((data) => data.name)
      .filter(Boolean)
      .slice(0, 50);

    customerCache.set(cacheKey, { names, timestamp: Date.now() });
    if (logDetails) {
      console.log(`[Voice Timing] Firestore customer list queried from Firestore DB (cache miss, ${names.length} names)`);
    }
    return names;
  } catch (dbErr) {
    console.warn('Failed to fetch existing customers for voice context:', dbErr.message);
    return [];
  }
}

/**
 * POST /api/voice/process
 * Accepts audio in base64 in request body.
 * Fetches existing shopkeeper customers for context and fuzzy name matching.
 * Sends audio to Gemini API using native audio input capability.
 */
const processVoice = async (req, res) => {
  const reqStart = Date.now();
  const reqStartISO = new Date(reqStart).toISOString();
  console.log(`[Voice Timing] [${reqStartISO}] POST /api/voice/process - Request received`);

  try {
    const { audioData, audioBase64, mimeType = 'audio/mp3' } = req.body;
    const base64Content = audioBase64 || audioData;

    if (!base64Content) {
      const totalMs = Date.now() - reqStart;
      console.log(`[Voice Timing] [${new Date().toISOString()}] Bad Request returned in ${totalMs}ms`);
      return res.status(400).json({
        error: 'Bad Request',
        message: 'audioBase64 or audioData (base64 encoded audio) is required',
      });
    }

    // 1. Fetch existing customer names with caching & limit 50
    const firestoreStart = Date.now();
    const firestoreStartISO = new Date(firestoreStart).toISOString();
    const shopkeeperId = req.shopkeeper ? req.shopkeeper.shopkeeperId : null;
    console.log(`[Voice Timing] [${firestoreStartISO}] [1/3] Fetching Firestore customer list for shopkeeperId: ${shopkeeperId || 'none'}...`);

    const effectiveShopId = getEffectiveShopId(req);
    const existingCustomerNames = await getCachedCustomerNames(shopkeeperId, effectiveShopId, true);
    const firestoreFetchMs = Date.now() - firestoreStart;
    const firestoreEndISO = new Date().toISOString();
    console.log(`[Voice Timing] [${firestoreEndISO}] [1/3] Firestore customer fetch finished | Duration: ${firestoreFetchMs}ms | Customer count: ${existingCustomerNames.length}`);

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || process.env.NODE_ENV === 'test' || process.env.USE_MOCK_GEMINI === 'true') {
      let decodedAudio = '';
      try {
        decodedAudio = Buffer.from(base64Content, 'base64').toString('utf8');
      } catch (e) {}

      if (decodedAudio.includes('mock_add_stock') || req.body.mockIntent === 'add_stock') {
        return res.status(200).json({
          transcription_gujarati: '૫ પેકેટ પાર્લેજી આવ્યું',
          translation_english: '5 packet Parle-G received',
          intent: 'add_stock',
          customer_name: null,
          suggested_customer_name: null,
          name_confidence: 'low',
          amount: 0,
          items: ['Parle-G'],
          stock_item_name: 'Parle-G',
          quantity: 5,
          unit: 'packet',
          confidence: 'high',
          detectedLanguage: 'gujarati',
        });
      }

      if (decodedAudio.includes('mock_reduce_stock') || req.body.mockIntent === 'reduce_stock') {
        return res.status(200).json({
          transcription_gujarati: '૨ પેકેટ પાર્લેજી વેચાયા',
          translation_english: '2 packet Parle-G sold',
          intent: 'reduce_stock',
          customer_name: null,
          suggested_customer_name: null,
          name_confidence: 'low',
          amount: 0,
          items: ['Parle-G'],
          stock_item_name: 'Parle-G',
          quantity: 2,
          unit: 'packet',
          confidence: 'high',
          detectedLanguage: 'gujarati',
        });
      }

      if (!apiKey && process.env.NODE_ENV !== 'test' && process.env.USE_MOCK_GEMINI !== 'true') {
        return res.status(500).json({
          error: 'Configuration Error',
          message: 'GEMINI_API_KEY environment variable is not configured',
        });
      }

      const mockName = req.body.mockCustomerName || 'Ramesh';
      const suggested = findSuggestedCustomerName(mockName, existingCustomerNames);
      let mockSuggestedCorrection = null;
      if (!suggested) {
        mockSuggestedCorrection = getSuggestedNameCorrection(mockName);
      }
      return res.status(200).json({
        transcription_gujarati: 'રમેશ ભાઈ ૫૦ રૂપિયા ઉધાર ખાંડ અને ચા',
        translation_english: 'Ramesh bhai 50 rupees credit sugar and tea',
        intent: 'add_udhaar',
        customer_name: mockName,
        suggested_customer_name: suggested,
        suggestedCorrection: mockSuggestedCorrection,
        name_confidence: 'high',
        amount: 50,
        items: ['sugar', 'tea'],
        stock_item_name: null,
        quantity: 0,
        unit: null,
        confidence: 'high',
        detectedLanguage: 'gujarati',
      });
    }

    const genAI = new GoogleGenerativeAI(apiKey);

    const customerContextListStr = existingCustomerNames.length > 0
      ? existingCustomerNames.join(', ')
      : 'None yet';

    const prompt = `
You are an expert multilingual speech recognition and intent extraction assistant for Indian shopkeepers.
Analyze the provided audio recording. Note that the speaker may speak in Gujarati, Hindi, English, or any mix of these three languages (very common in Indian shopkeeper speech — e.g., mixing English numbers with Gujarati sentence structure, or Hindi words within a Gujarati sentence). Auto-detect the language(s) used and transcribe accurately regardless of which language or mix is used.

CRITICAL INSTRUCTIONS:
1. MULTI-LANGUAGE AUDIO & NUMBER PARSING:
   - Understand numbers and amounts accurately whether spoken in Gujarati (e.g., "પાંચસો"), Hindi (e.g., "paanch sau", "पांच सौ"), or English (e.g., "five hundred") — all should parse correctly to 500.
   - Extract customer names accurately even if spoken with English pronunciation, Hindi accent, or regional spelling influence.
2. CUSTOMER NAME EXTRACTION:
   - Transcribe the customer name EXACTLY as spoken in the audio recording. Do NOT alter, force-fit, or replace a newly spoken customer name with any name from the existing customer list unless the speaker actually spoke that exact name.
   - Existing Customer List for this shop: [ ${customerContextListStr} ]
   - Use the existing customer list ONLY as spelling context if the exact same name was spoken. If a genuinely different name is spoken (e.g., "Bhagubhai" or "ભાગુભાઈ"), transcribe it strictly as spoken. Do NOT substitute it with a similar existing name (e.g. "Valkubhai" or "વાળકુભાઈ").
   - Gujarati/Indian customer names in this shop context are typically drawn from common regional first names (e.g., Bhavesh, Ramesh, Kavita, Priya) and surnames (e.g., Patel, Shah, Mehta, Solanki, Popat, Jani). If a transcribed name sounds unclear or ambiguous, prefer transcribing it as a phonetically close, commonly-used Gujarati name rather than an unusual or invented-sounding one.

Task:
1. Transcribe the spoken audio accurately in Gujarati script or relevant mixed text (transcription_gujarati).
2. Translate the transcription into English (translation_english).
3. Identify the primary intent (intent):
   - "add_udhaar": Customer bought items on credit (owes money).
   - "mark_paid": Customer paid back credit/udhaar.
   - "record_sale": A direct cash sale happened.
   - "add_stock": Adding new stock or inventory received (e.g. "5 packet Parle-G aayu", "10 kg sugar aavi").
   - "reduce_stock": Reducing or selling stock/inventory (e.g. "2 packet Parle-G becha", "stock ochhu thayu").
   - "unclear": If the audio is not clear or intent cannot be determined.
4. Extract full customer name if mentioned (customer_name) - string or null. Extract the FULL customer name exactly as spoken — including both first name and surname/last name if both are present in the sentence (e.g., "Badrubhai Bhukan", not just "Badrubhai"). Do NOT guess, invent, or auto-complete a surname if only a first name was spoken.
5. Assess name confidence specifically (name_confidence): "high", "medium", or "low".
6. Extract total amount in rupees (amount) - number or 0.
7. Extract list of items mentioned (items) - array of strings or empty array.
8. Extract inventory stock item name if intent is add_stock/reduce_stock (stock_item_name) - string or null.
9. Extract stock quantity if intent is add_stock/reduce_stock (quantity) - number or 0.
10. Extract unit for stock if mentioned (unit) - string or null (e.g. "packet", "kg", "piece", "liter", "box").
11. Detect the primary language used (detectedLanguage): "gujarati", "hindi", "english", or "mixed".
12. Assess overall confidence score (confidence): "high", "medium", or "low".

Return ONLY a valid JSON object without any Markdown formatting or code block markers:
{
  "transcription_gujarati": "...",
  "translation_english": "...",
  "intent": "add_udhaar" | "mark_paid" | "record_sale" | "add_stock" | "reduce_stock" | "unclear",
  "customer_name": "...",
  "name_confidence": "high" | "medium" | "low",
  "amount": 0,
  "items": ["..."],
  "stock_item_name": "...",
  "quantity": 0,
  "unit": "...",
  "detectedLanguage": "gujarati" | "hindi" | "english" | "mixed",
  "confidence": "high" | "medium" | "low"
}
`;

    const audioPart = {
      inlineData: {
        data: base64Content,
        mimeType: mimeType,
      },
    };

    const geminiStart = Date.now();
    const geminiStartISO = new Date(geminiStart).toISOString();
    console.log(`[Voice Timing] [${geminiStartISO}] [2/3] Calling Gemini API (with candidate fallback resolver)...`);

    const result = await generateWithFallback(genAI, async (model) => {
      return await model.generateContent([prompt, audioPart]);
    });
    const geminiCallMs = Date.now() - geminiStart;
    const geminiEndISO = new Date().toISOString();
    console.log(`[Voice Timing] [${geminiEndISO}] [2/3] Gemini API processing complete | Total Gemini Duration: ${geminiCallMs}ms`);

    const responseText = result.response.text();

    /**
     * Robust JSON extraction function:
     * 1. First, strip markdown code block fences and try JSON.parse.
     * 2. Next, use regex to extract the first valid JSON object `{ ... }` or array `[ ... ]`.
     * 3. Fallback: attempt JSON.parse on progressively trimmed substrings starting from the first `{` to last `}`.
     */
    const extractJson = (rawText) => {
      if (!rawText || typeof rawText !== 'string') return null;

      // 1. Direct clean of code blocks
      const cleaned = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
      try {
        return JSON.parse(cleaned);
      } catch (e) {
        // Continue to regex
      }

      // 2. Regex search for JSON object or array
      const jsonRegex = /\{[\s\S]*\}|\[[\s\S]*\]/;
      const match = rawText.match(jsonRegex);
      if (match) {
        try {
          return JSON.parse(match[0]);
        } catch (e) {
          // Continue to progressive fallback
        }
      }

      // 3. Progressive substring fallback from first '{' to last '}'
      const firstBrace = rawText.indexOf('{');
      const lastBrace = rawText.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace > firstBrace) {
        const candidate = rawText.substring(firstBrace, lastBrace + 1);
        try {
          return JSON.parse(candidate);
        } catch (e) {
          // Fall through
        }
      }

      return null;
    };

    let parsedResult = extractJson(responseText);

    if (!parsedResult) {
      console.error('Failed to parse Gemini output as JSON:', responseText);
      parsedResult = {
        transcription_gujarati: responseText,
        translation_english: '',
        intent: 'unclear',
        customer_name: null,
        name_confidence: 'low',
        amount: 0,
        items: [],
        detectedLanguage: 'gujarati',
        confidence: 'low',
      };
    }

    if (!parsedResult.detectedLanguage) {
      parsedResult.detectedLanguage = 'gujarati';
    }

    // Run generic fuzzy matching against existing customer list
    const suggestedName = findSuggestedCustomerName(parsedResult.customer_name, existingCustomerNames);
    parsedResult.suggested_customer_name = suggestedName;

    // Reference CSV matching for new customer names
    let suggestedCorrection = null;
    if (parsedResult.customer_name && !suggestedName) {
      suggestedCorrection = getSuggestedNameCorrection(parsedResult.customer_name);
    }
    parsedResult.suggestedCorrection = suggestedCorrection;

    if (!parsedResult.name_confidence) {
      parsedResult.name_confidence = parsedResult.customer_name ? 'medium' : 'low';
    }

    const totalMs = Date.now() - reqStart;
    const reqEndISO = new Date().toISOString();
    const postProcessingMs = totalMs - firestoreFetchMs - geminiCallMs;
    console.log(`[Voice Timing] [${reqEndISO}] [3/3] End-to-End Voice Processing Complete | Total Time: ${totalMs}ms (Firestore: ${firestoreFetchMs}ms, Gemini: ${geminiCallMs}ms, Post-processing: ${postProcessingMs}ms)`);

    return res.status(200).json(parsedResult);
  } catch (error) {
    console.error('Error processing voice audio:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: error.message,
    });
  }
};

/**
 * Helper to calculate IST Date range boundaries for timeframes.
 */
function getDateRangeFromTimeframe(timeframe) {
  const now = new Date();
  // Get current date string in IST YYYY-MM-DD
  const istDateStr = now.toLocaleDateString('sv-SE', { timeZone: 'Asia/Kolkata' });
  const [year, month, day] = istDateStr.split('-').map(Number);

  const startOfTodayIST = new Date(`${istDateStr}T00:00:00.000+05:30`);
  const endOfTodayIST = new Date(startOfTodayIST.getTime() + 24 * 60 * 60 * 1000);

  if (timeframe === 'today') {
    return { startDate: startOfTodayIST, endDate: endOfTodayIST, labelGu: 'આજે', labelEn: 'today' };
  }

  if (timeframe === 'yesterday') {
    const startOfYesterdayIST = new Date(startOfTodayIST.getTime() - 24 * 60 * 60 * 1000);
    return { startDate: startOfYesterdayIST, endDate: startOfTodayIST, labelGu: 'ગઈકાલે', labelEn: 'yesterday' };
  }

  if (timeframe === 'this_week') {
    const startOfWeekIST = new Date(startOfTodayIST.getTime() - 6 * 24 * 60 * 60 * 1000);
    return { startDate: startOfWeekIST, endDate: endOfTodayIST, labelGu: 'આ અઠવાડિયે', labelEn: 'this week' };
  }

  if (timeframe === 'last_week') {
    const endOfLastWeekIST = new Date(startOfTodayIST.getTime() - 6 * 24 * 60 * 60 * 1000);
    const startOfLastWeekIST = new Date(endOfLastWeekIST.getTime() - 7 * 24 * 60 * 60 * 1000);
    return { startDate: startOfLastWeekIST, endDate: endOfLastWeekIST, labelGu: 'પાછલા અઠવાડિયે', labelEn: 'last week' };
  }

  if (timeframe === 'this_month') {
    const monthStr = month < 10 ? `0${month}` : `${month}`;
    const startOfMonthIST = new Date(`${year}-${monthStr}-01T00:00:00.000+05:30`);
    return { startDate: startOfMonthIST, endDate: endOfTodayIST, labelGu: 'આ મહિને', labelEn: 'this month' };
  }

  if (timeframe === 'last_month') {
    let lastMonth = month - 1;
    let lastMonthYear = year;
    if (lastMonth === 0) {
      lastMonth = 12;
      lastMonthYear = year - 1;
    }
    const monthStr = month < 10 ? `0${month}` : `${month}`;
    const lastMonthStr = lastMonth < 10 ? `0${lastMonth}` : `${lastMonth}`;

    const startOfLastMonthIST = new Date(`${lastMonthYear}-${lastMonthStr}-01T00:00:00.000+05:30`);
    const startOfThisMonthIST = new Date(`${year}-${monthStr}-01T00:00:00.000+05:30`);
    return { startDate: startOfLastMonthIST, endDate: startOfThisMonthIST, labelGu: 'ગયા મહિને', labelEn: 'last month' };
  }

  return { startDate: null, endDate: null, labelGu: 'કુલ', labelEn: 'all time' };
}

/**
 * Helper to determine sentiment/urgency tone category based on days overdue and total balance.
 * Returns 'normal' | 'attention' | 'caution'
 */
function getCustomerToneCategory(daysOverdue, totalUdhaar) {
  const days = Number(daysOverdue) || 0;
  const udhaar = Number(totalUdhaar) || 0;

  if (days >= 30 || udhaar >= 2000) {
    return 'caution';
  }
  if (days >= 15 || udhaar >= 1000) {
    return 'attention';
  }
  return 'normal';
}

/**
 * Helper to query customer balance for query endpoint.
 */
async function handleCustomerBalanceQuery(shopkeeperId, customerName, shopId, subType = null) {
  const effectiveShopId = shopId || (shopkeeperId ? `shop_${shopkeeperId}` : null);
  const customers = [];

  if (shopkeeperId) {
    try {
      const snapshot = await db.collection('customers')
        .where('shopkeeperId', '==', shopkeeperId)
        .get();

      snapshot.forEach((doc) => {
        const data = doc.data();
        if (isDocInShop(data, effectiveShopId, shopkeeperId)) {
          customers.push(data);
        }
      });
    } catch (err) {
      console.warn('Error fetching customer balance for query:', err.message);
    }
  }

  // Handle "top_debtor": who owes the most
  if (subType === 'top_debtor') {
    const debtors = customers.filter((c) => (Number(c.totalUdhaar) || 0) > 0);
    if (debtors.length === 0) {
      return {
        answerText: 'હાલમાં કોઈ ગ્રાહકનું ઉધાર બાકી નથી.',
        answerTextEnglish: 'No customers currently have pending udhaar.',
      };
    }
    debtors.sort((a, b) => (Number(b.totalUdhaar) || 0) - (Number(a.totalUdhaar) || 0));
    const top = debtors[0];
    const topBal = Number(top.totalUdhaar) || 0;
    return {
      answerText: `સૌથી વધુ ઉધાર ${top.name}નું છે, ₹${topBal} બાકી છે.`,
      answerTextEnglish: `${top.name} owes the most with a pending balance of ₹${topBal}.`,
    };
  }

  // Handle "debtor_count": how many customers have pending udhaar
  if (subType === 'debtor_count') {
    const debtors = customers.filter((c) => (Number(c.totalUdhaar) || 0) > 0);
    return {
      answerText: `હાલમાં કુલ ${debtors.length} ગ્રાહકોનું ઉધાર બાકી છે.`,
      answerTextEnglish: `Currently ${debtors.length} customers have pending udhaar.`,
    };
  }

  // Handle "total_outstanding": total pending udhaar across all customers
  if (subType === 'total_outstanding') {
    const totalOut = customers.reduce((sum, c) => sum + (Number(c.totalUdhaar) || 0), 0);
    return {
      answerText: `દુકાનનું કુલ ₹${totalOut} ઉધાર તમામ ગ્રાહકો પાસે બાકી છે.`,
      answerTextEnglish: `Total outstanding balance across all customers is ₹${totalOut}.`,
    };
  }

  // Handle single customer balance query
  let customerDisplayName = customerName || 'ગ્રાહક';
  let balance = 0;
  let customerFound = false;
  let matchedCustomer = null;

  if (customerName && customers.length > 0) {
    const normTarget = normalizeGujaratiPhonetics(customerName);
    let bestMatch = null;
    let minDist = Infinity;

    for (const cust of customers) {
      if (!cust.name) continue;
      const normName = normalizeGujaratiPhonetics(cust.name);
      if (normTarget && normTarget === normName) {
        bestMatch = cust;
        minDist = 0;
        break;
      }
      const dist = levenshteinDistance(normTarget, normName);
      if (dist < minDist) {
        minDist = dist;
        bestMatch = cust;
      }
    }

    if (bestMatch && (minDist <= 1 || (normTarget.length >= 6 && minDist <= 2 && minDist / normTarget.length <= 0.15) || normTarget === normalizeGujaratiPhonetics(bestMatch.name))) {
      customerDisplayName = bestMatch.name;
      balance = Number(bestMatch.totalUdhaar) || 0;
      customerFound = true;
      matchedCustomer = bestMatch;
    }
  }

  if (!customerFound) {
    const answerText = customerName
      ? `${customerName} નામના કોઈ ગ્રાહક મળ્યા નથી.`
      : `ગ્રાહકનું નામ સ્પષ્ટ નથી.`;
    const answerTextEnglish = customerName
      ? `No customer named ${customerName} was found.`
      : `Customer name was not specified.`;
    return { customerName: customerDisplayName, balance, answerText, answerTextEnglish };
  }

  // Determine days since last activity for tone calculation
  let daysSinceLastActivity = 0;
  if (matchedCustomer && shopkeeperId) {
    try {
      const custId = matchedCustomer.customerId || matchedCustomer.id;
      const txSnapshot = await db.collection('transactions')
        .where('shopkeeperId', '==', shopkeeperId)
        .get();

      let latestTxTime = 0;
      txSnapshot.forEach((doc) => {
        const tx = doc.data();
        if (tx.customerId === custId && tx.timestamp) {
          const t = new Date(tx.timestamp).getTime();
          if (!isNaN(t) && t > latestTxTime) latestTxTime = t;
        }
      });

      if (!latestTxTime) {
        const fallBackIso = matchedCustomer.updatedAt || matchedCustomer.createdAt;
        latestTxTime = fallBackIso ? new Date(fallBackIso).getTime() : Date.now();
      }

      if (latestTxTime) {
        const diffMs = Math.max(0, Date.now() - latestTxTime);
        daysSinceLastActivity = Math.floor(diffMs / (24 * 60 * 60 * 1000));
      }
    } catch (e) {
      // ignore
    }
  }

  const tone = getCustomerToneCategory(daysSinceLastActivity, balance);

  let answerText = `${customerDisplayName}નું ₹${balance} ઉધાર બાકી છે.`;
  let answerTextEnglish = `${customerDisplayName}'s pending balance is ₹${balance}.`;

  if (balance > 0) {
    if (tone === 'caution') {
      answerText = `ધ્યાન આપો: ${customerDisplayName}નું ₹${balance} ઉધાર બાકી છે અને ${daysSinceLastActivity > 0 ? `${daysSinceLastActivity} દિવસથી કોઈ ચુકવણી નથી થઈ` : 'રકમ વધુ છે'}. રિમાઇન્ડર મોકલવાનું વિચારો.`;
      answerTextEnglish = `Attention: ${customerDisplayName}'s balance is ₹${balance} and no payment in ${daysSinceLastActivity} days. Consider sending a reminder.`;
    } else if (tone === 'attention') {
      answerText = `${customerDisplayName}નું ₹${balance} ઉધાર બાકી છે. છેલ્લા ${daysSinceLastActivity} દિવસથી કંઈ ચૂકવ્યું નથી, થોડું ધ્યાન રાખજો.`;
      answerTextEnglish = `${customerDisplayName}'s pending balance is ₹${balance}. Nothing paid in the last ${daysSinceLastActivity} days, please keep an eye.`;
    }
  }

  return { customerName: customerDisplayName, balance, tone, daysSinceLastActivity, answerText, answerTextEnglish };
}

/**
 * Helper to query customer phone number for query endpoint.
 */
async function handleCustomerPhoneQuery(shopkeeperId, customerName, shopId) {
  let customerDisplayName = customerName || 'ગ્રાહક';
  let phone = null;
  let customerFound = false;
  const effectiveShopId = shopId || (shopkeeperId ? `shop_${shopkeeperId}` : null);

  if (shopkeeperId && customerName) {
    try {
      const snapshot = await db.collection('customers')
        .where('shopkeeperId', '==', shopkeeperId)
        .get();

      const customers = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        if (isDocInShop(data, effectiveShopId, shopkeeperId)) {
          customers.push(data);
        }
      });

      if (customers.length > 0) {
        const normTarget = normalizeGujaratiPhonetics(customerName);
        let bestMatch = null;
        let minDist = Infinity;

        for (const cust of customers) {
          if (!cust.name) continue;
          const normName = normalizeGujaratiPhonetics(cust.name);
          if (normTarget && normTarget === normName) {
            bestMatch = cust;
            minDist = 0;
            break;
          }
          const dist = levenshteinDistance(normTarget, normName);
          if (dist < minDist) {
            minDist = dist;
            bestMatch = cust;
          }
        }

        if (bestMatch && (minDist <= 1 || (normTarget.length >= 6 && minDist <= 2 && minDist / normTarget.length <= 0.15) || normTarget === normalizeGujaratiPhonetics(bestMatch.name))) {
          customerDisplayName = bestMatch.name;
          phone = bestMatch.phone && bestMatch.phone !== '0000000000' ? bestMatch.phone : null;
          customerFound = true;
        }
      }
    } catch (err) {
      console.warn('Error fetching customer phone for query:', err.message);
    }
  }

  const answerText = customerFound
    ? (phone ? `${customerDisplayName}નો ફોન નંબર ${phone} છે.` : `${customerDisplayName}નો ફોન નંબર નોંધાયેલ નથી.`)
    : customerName
      ? `${customerName} નામના કોઈ ગ્રાહક મળ્યા નથી.`
      : `ગ્રાહકનું નામ સ્પષ્ટ નથી.`;

  const answerTextEnglish = customerFound
    ? (phone ? `${customerDisplayName}'s phone number is ${phone}.` : `${customerDisplayName} has no phone number recorded.`)
    : customerName
      ? `No customer named ${customerName} was found.`
      : `Customer name was not specified.`;

  return { customerName: customerDisplayName, phone, answerText, answerTextEnglish };
}

/**
 * Helper to query customer history or general transaction activity for query endpoint.
 */
async function handleCustomerHistoryQuery(shopkeeperId, customerName, shopId, timeframe = null, actionType = null) {
  let customerDisplayName = customerName || null;
  let totalBorrowed = 0;
  let totalPaid = 0;
  let totalSales = 0;
  let currentBalance = 0;
  let lastTransactionDateStr = null;
  let customerFound = false;
  let hasTransactions = false;
  const effectiveShopId = shopId || (shopkeeperId ? `shop_${shopkeeperId}` : null);

  const dateRange = getDateRangeFromTimeframe(timeframe);

  if (shopkeeperId) {
    try {
      if (customerName) {
        const snapshot = await db.collection('customers')
          .where('shopkeeperId', '==', shopkeeperId)
          .get();

        const customers = [];
        snapshot.forEach((doc) => {
          const data = doc.data();
          if (isDocInShop(data, effectiveShopId, shopkeeperId)) {
            customers.push({ id: doc.id, ...data });
          }
        });

        if (customers.length > 0) {
          const normTarget = normalizeGujaratiPhonetics(customerName);
          let bestMatch = null;
          let minDist = Infinity;

          for (const cust of customers) {
            if (!cust.name) continue;
            const normName = normalizeGujaratiPhonetics(cust.name);
            if (normTarget && normTarget === normName) {
              bestMatch = cust;
              minDist = 0;
              break;
            }
            const dist = levenshteinDistance(normTarget, normName);
            if (dist < minDist) {
              minDist = dist;
              bestMatch = cust;
            }
          }

          if (bestMatch && (minDist <= 1 || (normTarget.length >= 6 && minDist <= 2 && minDist / normTarget.length <= 0.15) || normTarget === normalizeGujaratiPhonetics(bestMatch.name))) {
            customerDisplayName = bestMatch.name;
            currentBalance = Number(bestMatch.totalUdhaar) || 0;
            customerFound = true;

            const custId = bestMatch.customerId || bestMatch.id;
            const txSnapshot = await db.collection('transactions')
              .where('shopkeeperId', '==', shopkeeperId)
              .where('customerId', '==', custId)
              .get();

            let transactions = [];
            txSnapshot.forEach((doc) => transactions.push(doc.data()));

            if (dateRange.startDate && dateRange.endDate) {
              transactions = transactions.filter((tx) => {
                const txDate = new Date(tx.timestamp || 0);
                return txDate >= dateRange.startDate && txDate < dateRange.endDate;
              });
            }

            if (transactions.length > 0) {
              hasTransactions = true;
              transactions.sort((a, b) => new Date(a.timestamp || 0) - new Date(b.timestamp || 0));

              for (const tx of transactions) {
                const amt = Number(tx.amount) || 0;
                if (tx.type === 'udhaar_add') totalBorrowed += amt;
                else if (tx.type === 'udhaar_paid') totalPaid += amt;
                else if (tx.type === 'sale') totalSales += amt;
              }

              const latestTx = transactions[transactions.length - 1];
              if (latestTx && latestTx.timestamp) {
                const dateObj = new Date(latestTx.timestamp);
                if (!isNaN(dateObj.getTime())) {
                  lastTransactionDateStr = dateObj.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: 'numeric' });
                }
              }
            }
          }
        }
      } else {
        // No specific customer name: aggregate shopkeeper transactions for timeframe
        const txSnapshot = await db.collection('transactions')
          .where('shopkeeperId', '==', shopkeeperId)
          .get();

        let transactions = [];
        txSnapshot.forEach((doc) => {
          const data = doc.data();
          if (isDocInShop(data, effectiveShopId, shopkeeperId)) {
            transactions.push(data);
          }
        });

        if (dateRange.startDate && dateRange.endDate) {
          transactions = transactions.filter((tx) => {
            const txDate = new Date(tx.timestamp || 0);
            return txDate >= dateRange.startDate && txDate < dateRange.endDate;
          });
        }

        if (transactions.length > 0) {
          hasTransactions = true;
          for (const tx of transactions) {
            const amt = Number(tx.amount) || 0;
            if (tx.type === 'udhaar_add') totalBorrowed += amt;
            else if (tx.type === 'udhaar_paid') totalPaid += amt;
            else if (tx.type === 'sale') totalSales += amt;
          }
        }
      }
    } catch (err) {
      console.warn('Error fetching customer history for query:', err.message);
    }
  }

  if (customerName && !customerFound) {
    return {
      answerText: `${customerName} નામના કોઈ ગ્રાહક મળ્યા નથી.`,
      answerTextEnglish: `No customer named ${customerName} was found.`,
    };
  }

  const periodLabelGu = dateRange.labelGu || '';
  const periodLabelEn = dateRange.labelEn || '';

  if (customerFound) {
    if (hasTransactions) {
      if (actionType === 'udhaar_add') {
        return {
          answerText: `${customerDisplayName}એ ${periodLabelGu} ₹${totalBorrowed}નું સામાન ઉધાર લીધું છે.`,
          answerTextEnglish: `${customerDisplayName} took ₹${totalBorrowed} on credit ${periodLabelEn}.`,
        };
      }
      if (actionType === 'udhaar_paid') {
        return {
          answerText: `${customerDisplayName} પાસેથી ${periodLabelGu} ₹${totalPaid} જમા/વસૂલ થયા છે.`,
          answerTextEnglish: `Collected ₹${totalPaid} from ${customerDisplayName} ${periodLabelEn}.`,
        };
      }
      return {
        answerText: `${customerDisplayName}એ ${periodLabelGu} ₹${totalBorrowed} ઉધાર લીધું છે, ₹${totalPaid} પાછું આપ્યું છે. હાલમાં ₹${currentBalance} બાકી છે.`,
        answerTextEnglish: `${customerDisplayName} borrowed ₹${totalBorrowed} and paid back ₹${totalPaid} ${periodLabelEn}. Current pending balance is ₹${currentBalance}.`,
      };
    } else {
      return {
        answerText: `${customerDisplayName}નો ${periodLabelGu} કોઈ વ્યવહાર મળ્યો નથી. હાલમાં ₹${currentBalance} બાકી છે.`,
        answerTextEnglish: `${customerDisplayName} has no transaction history recorded ${periodLabelEn}. Current balance is ₹${currentBalance}.`,
      };
    }
  }

  // Shopwide transaction history summary
  if (hasTransactions) {
    if (actionType === 'udhaar_paid') {
      return {
        answerText: `${periodLabelGu} કુલ ₹${totalPaid} ની ઉધાર વસૂલી થઈ છે.`,
        answerTextEnglish: `Total udhaar collected ${periodLabelEn} is ₹${totalPaid}.`,
      };
    }
    if (actionType === 'udhaar_add') {
      return {
        answerText: `${periodLabelGu} કુલ ₹${totalBorrowed} નવું ઉધાર આપવામાં આવ્યું છે.`,
        answerTextEnglish: `Total new udhaar given ${periodLabelEn} is ₹${totalBorrowed}.`,
      };
    }
    return {
      answerText: `${periodLabelGu} કુલ વેચાણ ₹${totalSales}, નવું ઉધાર ₹${totalBorrowed}, અને ઉધાર વસૂલી ₹${totalPaid} થઈ છે.`,
      answerTextEnglish: `${periodLabelEn} total sales ₹${totalSales}, new udhaar ₹${totalBorrowed}, and collection ₹${totalPaid}.`,
    };
  }

  return {
    answerText: `${periodLabelGu} કોઈ વ્યવહાર નોંધાયા નથી.`,
    answerTextEnglish: `No transactions were recorded ${periodLabelEn}.`,
  };
}

/**
 * Helper to query inventory status for query endpoint.
 */
async function handleInventoryStatusQuery(shopkeeperId, itemName, shopId, subType = null) {
  let answerText = '';
  let answerTextEnglish = '';
  const effectiveShopId = shopId || (shopkeeperId ? `shop_${shopkeeperId}` : null);

  if (shopkeeperId) {
    try {
      const snapshot = await db.collection('inventory')
        .where('shopkeeperId', '==', shopkeeperId)
        .get();

      const items = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        if (isDocInShop(data, effectiveShopId, shopkeeperId)) {
          items.push({ id: doc.id, ...data });
        }
      });

      // Handle "out_of_stock": quantity <= 0
      if (subType === 'out_of_stock') {
        const outItems = items.filter((i) => (Number(i.quantity) || 0) <= 0);
        if (outItems.length === 0) {
          return {
            answerText: 'કોઈપણ વસ્તુ સ્ટોકમાંથી સંપૂર્ણ પૂરી થઈ નથી.',
            answerTextEnglish: 'No items are completely out of stock.',
          };
        }
        const outList = outItems.map((i) => i.itemName || 'Item').join(', ');
        return {
          answerText: `આ ${outItems.length} વસ્તુઓનો સ્ટોક સંપૂર્ણ પૂરો (0) થઈ ગયો છે: ${outList}.`,
          answerTextEnglish: `The following ${outItems.length} items are completely out of stock (quantity 0): ${outList}.`,
        };
      }

      // Handle "best_selling": best selling item based on sale transactions
      if (subType === 'best_selling') {
        const txSnapshot = await db.collection('transactions')
          .where('shopkeeperId', '==', shopkeeperId)
          .get();

        const itemSalesCount = {};
        txSnapshot.forEach((doc) => {
          const tx = doc.data();
          if (isDocInShop(tx, effectiveShopId, shopkeeperId) && Array.isArray(tx.items)) {
            tx.items.forEach((it) => {
              if (typeof it === 'string' && it.trim()) {
                const clean = it.trim();
                itemSalesCount[clean] = (itemSalesCount[clean] || 0) + 1;
              }
            });
          }
        });

        const sortedItems = Object.entries(itemSalesCount).sort((a, b) => b[1] - a[1]);
        if (sortedItems.length > 0) {
          const [topItem, count] = sortedItems[0];
          return {
            answerText: `તમારી દુકાનમાં સૌથી વધુ વેચાતી વસ્તુ ${topItem} છે (${count} વખત વેચાઈ).`,
            answerTextEnglish: `The best-selling item in your shop is ${topItem} (sold ${count} times).`,
          };
        } else {
          return {
            answerText: 'હજી સુધી કોઈ વસ્તુના વેચાણનો રેકોર્ડ મળ્યો નથી.',
            answerTextEnglish: 'No item sales history recorded yet.',
          };
        }
      }

      if (itemName && items.length > 0) {
        // Search specific item using fuzzy matching
        const normTarget = normalizeGujaratiPhonetics(itemName);
        let bestMatch = null;
        let minDist = Infinity;

        for (const item of items) {
          if (!item.itemName) continue;
          const normName = normalizeGujaratiPhonetics(item.itemName);
          if (normTarget && normTarget === normName) {
            bestMatch = item;
            minDist = 0;
            break;
          }
          const dist = levenshteinDistance(normTarget, normName);
          if (dist < minDist) {
            minDist = dist;
            bestMatch = item;
          }
        }

        if (bestMatch && (minDist <= 3 || normTarget === normalizeGujaratiPhonetics(bestMatch.itemName))) {
          const qty = Number(bestMatch.quantity) || 0;
          const unit = bestMatch.unit || 'piece';
          answerText = `તમારી પાસે ${bestMatch.itemName} ${qty} ${unit} છે.`;
          answerTextEnglish = `You have ${qty} ${unit} of ${bestMatch.itemName}.`;
          return { answerText, answerTextEnglish };
        } else {
          answerText = `${itemName} સ્ટોકમાં મળ્યું નથી.`;
          answerTextEnglish = `${itemName} was not found in inventory.`;
          return { answerText, answerTextEnglish };
        }
      } else if (!itemName) {
        // Summarize all inventory
        const totalCount = items.length;
        if (totalCount === 0) {
          answerText = 'તમારા સ્ટોકમાં હાલમાં કોઈ વસ્તુ નથી.';
          answerTextEnglish = 'There are currently no items in your inventory.';
          return { answerText, answerTextEnglish };
        }

        const topItems = items.slice(0, 10).map((i) => `${i.itemName} ${i.quantity} ${i.unit || 'piece'}`).join(', ');
        answerText = `તમારી પાસે કુલ ${totalCount} વસ્તુઓ છે: ${topItems}`;
        answerTextEnglish = `You have a total of ${totalCount} items: ${topItems}`;
        return { answerText, answerTextEnglish };
      }
    } catch (err) {
      console.warn('Error fetching inventory status for query:', err.message);
    }
  }

  answerText = itemName ? `${itemName} સ્ટોકમાં મળ્યું નથી.` : 'સ્ટોકની માહિતી ઉપલબ્ધ નથી.';
  answerTextEnglish = itemName ? `${itemName} was not found in inventory.` : 'Inventory information is not available.';
  return { answerText, answerTextEnglish };
}

/**
 * Helper to query low-stock inventory items for query endpoint.
 */
async function handleInventoryLowStockQuery(shopkeeperId, shopId) {
  let answerText = '';
  let answerTextEnglish = '';
  const effectiveShopId = shopId || (shopkeeperId ? `shop_${shopkeeperId}` : null);

  if (shopkeeperId) {
    try {
      const snapshot = await db.collection('inventory')
        .where('shopkeeperId', '==', shopkeeperId)
        .get();

      const lowStockItems = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        if (isDocInShop(data, effectiveShopId, shopkeeperId)) {
          const qty = Number(data.quantity) || 0;
          const threshold = Number(data.lowStockThreshold) || 5;
          const isLow = data.isLowStock !== undefined ? Boolean(data.isLowStock) : qty <= threshold;
          if (isLow) {
            lowStockItems.push({
              itemName: data.itemName || 'Item',
              quantity: qty,
              unit: data.unit || 'piece',
            });
          }
        }
      });

      if (lowStockItems.length === 0) {
        answerText = 'તમારી પાસે કોઈ વસ્તુ ઓછી નથી, બધો સ્ટોક પૂરતો છે.';
        answerTextEnglish = 'No items are running low on stock.';
        return { answerText, answerTextEnglish };
      }

      const itemsList = lowStockItems.map((i) => `${i.itemName} (${i.quantity} ${i.unit})`).join(', ');
      answerText = `આ ${lowStockItems.length} વસ્તુઓનો સ્ટોક ઓછો છે: ${itemsList}`;
      answerTextEnglish = `The following ${lowStockItems.length} items are running low on stock: ${itemsList}`;
      return { answerText, answerTextEnglish };
    } catch (err) {
      console.warn('Error fetching low stock inventory for query:', err.message);
    }
  }

  answerText = 'સ્ટોકની માહિતી ઉપલબ્ધ નથી.';
  answerTextEnglish = 'Inventory information is not available.';
  return { answerText, answerTextEnglish };
}

/**
 * Helper to query daily summary and trends for query endpoint.
 */
async function handleDailySummaryQuery(shopkeeperId, shopId, subType = null) {
  let totalSales = 0;
  let totalNewUdhaar = 0;
  let totalUdhaarCollected = 0;
  let transactionCount = 0;
  const effectiveShopId = shopId || (shopkeeperId ? `shop_${shopkeeperId}` : null);

  const now = new Date();
  const istDateStr = now.toLocaleDateString('sv-SE', { timeZone: 'Asia/Kolkata' });
  const startOfTodayIST = new Date(`${istDateStr}T00:00:00.000+05:30`);
  const endOfTodayIST = new Date(startOfTodayIST.getTime() + 24 * 60 * 60 * 1000);

  if (shopkeeperId) {
    try {
      // Handle "comparison": compare today's sales with yesterday's
      if (subType === 'comparison') {
        const startOfYesterdayIST = new Date(startOfTodayIST.getTime() - 24 * 60 * 60 * 1000);

        const snapshot = await db.collection('transactions')
          .where('shopkeeperId', '==', shopkeeperId)
          .where('timestamp', '>=', startOfYesterdayIST.toISOString())
          .where('timestamp', '<', endOfTodayIST.toISOString())
          .get();

        let todaySales = 0;
        let yesterdaySales = 0;

        snapshot.forEach((doc) => {
          const data = doc.data();
          if (isDocInShop(data, effectiveShopId, shopkeeperId) && data.type === 'sale') {
            const txDate = new Date(data.timestamp || 0);
            const amt = Number(data.amount) || 0;
            if (txDate >= startOfTodayIST) {
              todaySales += amt;
            } else {
              yesterdaySales += amt;
            }
          }
        });

        if (todaySales > yesterdaySales) {
          const diff = todaySales - yesterdaySales;
          return {
            answerText: `આજે ગઈકાલ કરતાં ₹${diff} વધુ વેચાણ થયું છે. (આજે: ₹${todaySales}, ગઈકાલે: ₹${yesterdaySales})`,
            answerTextEnglish: `Today sales are higher than yesterday by ₹${diff}. (Today: ₹${todaySales}, Yesterday: ₹${yesterdaySales})`,
          };
        } else if (todaySales < yesterdaySales) {
          const diff = yesterdaySales - todaySales;
          return {
            answerText: `આજે ગઈકાલ કરતાં ₹${diff} ઓછું વેચાણ થયું છે. (આજે: ₹${todaySales}, ગઈકાલે: ₹${yesterdaySales})`,
            answerTextEnglish: `Today sales are lower than yesterday by ₹${diff}. (Today: ₹${todaySales}, Yesterday: ₹${yesterdaySales})`,
          };
        } else {
          return {
            answerText: `આજે અને ગઈકાલે બંને દિવસે સરખું વેચાણ (₹${todaySales}) થયું છે.`,
            answerTextEnglish: `Today and yesterday sales are equal (₹${todaySales}).`,
          };
        }
      }

      // Handle "best_day": best day of the week
      if (subType === 'best_day') {
        const startOfWeekIST = new Date(startOfTodayIST.getTime() - 6 * 24 * 60 * 60 * 1000);

        const snapshot = await db.collection('transactions')
          .where('shopkeeperId', '==', shopkeeperId)
          .where('timestamp', '>=', startOfWeekIST.toISOString())
          .where('timestamp', '<', endOfTodayIST.toISOString())
          .get();

        const dailySalesMap = {}; // dateStr -> sum
        const dayNamesGu = {
          0: 'રવિવાર',
          1: 'સોમવાર',
          2: 'મંગળવાર',
          3: 'બુધવાર',
          4: 'ગુરુવાર',
          5: 'શુક્રવાર',
          6: 'શનિવાર',
        };
        const dayNamesEn = {
          0: 'Sunday',
          1: 'Monday',
          2: 'Tuesday',
          3: 'Wednesday',
          4: 'Thursday',
          5: 'Friday',
          6: 'Saturday',
        };

        snapshot.forEach((doc) => {
          const data = doc.data();
          if (isDocInShop(data, effectiveShopId, shopkeeperId) && data.type === 'sale') {
            const txDate = new Date(data.timestamp || 0);
            const dateStr = txDate.toLocaleDateString('sv-SE', { timeZone: 'Asia/Kolkata' });
            const amt = Number(data.amount) || 0;
            dailySalesMap[dateStr] = (dailySalesMap[dateStr] || 0) + amt;
          }
        });

        const sortedDays = Object.entries(dailySalesMap).sort((a, b) => b[1] - a[1]);
        if (sortedDays.length > 0) {
          const [bestDateStr, maxSales] = sortedDays[0];
          const bestDateObj = new Date(`${bestDateStr}T12:00:00.000+05:30`);
          const dayOfWeek = bestDateObj.getDay();
          const nameGu = dayNamesGu[dayOfWeek] || bestDateStr;
          const nameEn = dayNamesEn[dayOfWeek] || bestDateStr;

          return {
            answerText: `આ અઠવાડિયાનો શ્રેષ્ઠ વેચાણ દિવસ ${nameGu} હતો, જેમાં કુલ ₹${maxSales} નું વેચાણ થયું.`,
            answerTextEnglish: `The best sales day this week was ${nameEn} with total sales of ₹${maxSales}.`,
          };
        } else {
          return {
            answerText: 'આ અઠવાડિયે હજી સુધી રોકડ વેચાણનો કોઈ રેકોર્ડ મળ્યો નથી.',
            answerTextEnglish: 'No cash sales recorded yet this week.',
          };
        }
      }

      // Default today summary
      const snapshot = await db.collection('transactions')
        .where('shopkeeperId', '==', shopkeeperId)
        .where('timestamp', '>=', startOfTodayIST.toISOString())
        .where('timestamp', '<', endOfTodayIST.toISOString())
        .get();

      snapshot.forEach((doc) => {
        const data = doc.data();
        if (isDocInShop(data, effectiveShopId, shopkeeperId)) {
          transactionCount++;
          const amount = Number(data.amount) || 0;
          if (data.type === 'sale') totalSales += amount;
          else if (data.type === 'udhaar_add') totalNewUdhaar += amount;
          else if (data.type === 'udhaar_paid') totalUdhaarCollected += amount;
        }
      });
    } catch (err) {
      console.warn('Error fetching daily summary for query:', err.message);
    }
  }

  const answerText = `આજનું કુલ વેચાણ ₹${totalSales} છે, નવું ઉધાર ₹${totalNewUdhaar} છે, અને ઉધાર વસૂલી ₹${totalUdhaarCollected} છે.`;
  const answerTextEnglish = `Today's total sale is ₹${totalSales}, new udhaar is ₹${totalNewUdhaar}, and udhaar collected is ₹${totalUdhaarCollected}.`;

  return { totalSales, totalNewUdhaar, totalUdhaarCollected, transactionCount, answerText, answerTextEnglish };
}

/**
 * Helper to generate Business Insights for query endpoint.
 */
async function handleBusinessInsightsQuery(shopkeeperId, shopId, subType = null) {
  const effectiveShopId = shopId || (shopkeeperId ? `shop_${shopkeeperId}` : null);

  if (!shopkeeperId) {
    return {
      answerText: 'દુકાનની માહિતી ઉપલબ્ધ નથી.',
      answerTextEnglish: 'Shop information is not available.',
    };
  }

  try {
    const now = new Date();
    const istDateStr = now.toLocaleDateString('sv-SE', { timeZone: 'Asia/Kolkata' });
    const startOfTodayIST = new Date(`${istDateStr}T00:00:00.000+05:30`);
    const endOfTodayIST = new Date(startOfTodayIST.getTime() + 24 * 60 * 60 * 1000);

    // Fetch todays txs
    const todaySnapshot = await db.collection('transactions')
      .where('shopkeeperId', '==', shopkeeperId)
      .where('timestamp', '>=', startOfTodayIST.toISOString())
      .where('timestamp', '<', endOfTodayIST.toISOString())
      .get();

    let todaySales = 0;
    let todayNewUdhaar = 0;
    let todayCollected = 0;

    todaySnapshot.forEach((doc) => {
      const data = doc.data();
      if (isDocInShop(data, effectiveShopId, shopkeeperId)) {
        const amt = Number(data.amount) || 0;
        if (data.type === 'sale') todaySales += amt;
        else if (data.type === 'udhaar_add') todayNewUdhaar += amt;
        else if (data.type === 'udhaar_paid') todayCollected += amt;
      }
    });

    if (subType === 'today_earnings') {
      const totalIncome = todaySales + todayCollected;
      return {
        answerText: `આજે રોકડ કમાણી ₹${totalIncome} થઈ છે (વેચાણ: ₹${todaySales}, ઉધાર વસૂલી: ₹${todayCollected}). નવું ઉધાર ₹${todayNewUdhaar} છે.`,
        answerTextEnglish: `Today's total cash collection is ₹${totalIncome} (Sales: ₹${todaySales}, Udhaar collected: ₹${todayCollected}). New udhaar added is ₹${todayNewUdhaar}.`,
      };
    }

    if (subType === 'monthly_overview') {
      const monthRange = getDateRangeFromTimeframe('this_month');
      const monthSnapshot = await db.collection('transactions')
        .where('shopkeeperId', '==', shopkeeperId)
        .where('timestamp', '>=', monthRange.startDate.toISOString())
        .where('timestamp', '<', monthRange.endDate.toISOString())
        .get();

      let mSales = 0;
      let mUdhaar = 0;
      let mCollected = 0;

      monthSnapshot.forEach((doc) => {
        const data = doc.data();
        if (isDocInShop(data, effectiveShopId, shopkeeperId)) {
          const amt = Number(data.amount) || 0;
          if (data.type === 'sale') mSales += amt;
          else if (data.type === 'udhaar_add') mUdhaar += amt;
          else if (data.type === 'udhaar_paid') mCollected += amt;
        }
      });

      return {
        answerText: `આ મહિને કુલ વેચાણ ₹${mSales}, નવું ઉધાર ₹${mUdhaar}, અને ઉધાર વસૂલી ₹${mCollected} થઈ છે. એકંદરે વેપાર સારો રહ્યો છે.`,
        answerTextEnglish: `This month total sales: ₹${mSales}, new udhaar: ₹${mUdhaar}, and collection: ₹${mCollected}. Overall business is steady.`,
      };
    }

    if (subType === 'suggestions') {
      // Check pending alerts & low stock
      const custSnapshot = await db.collection('customers')
        .where('shopkeeperId', '==', shopkeeperId)
        .get();

      let highUdhaarCount = 0;
      let totalUdhaar = 0;
      custSnapshot.forEach((doc) => {
        const data = doc.data();
        if (isDocInShop(data, effectiveShopId, shopkeeperId)) {
          const bal = Number(data.totalUdhaar) || 0;
          if (bal > 0) {
            totalUdhaar += bal;
            highUdhaarCount++;
          }
        }
      });

      const invSnapshot = await db.collection('inventory')
        .where('shopkeeperId', '==', shopkeeperId)
        .get();

      let lowStockCount = 0;
      invSnapshot.forEach((doc) => {
        const data = doc.data();
        if (isDocInShop(data, effectiveShopId, shopkeeperId)) {
          const qty = Number(data.quantity) || 0;
          const thresh = Number(data.lowStockThreshold) || 5;
          if (qty <= thresh) lowStockCount++;
        }
      });

      const suggestions = [];
      const suggestionsEn = [];

      if (totalUdhaar > 1000) {
        suggestions.push(`કુલ ₹${totalUdhaar} ઉધાર બાકી છે, જૂના ગ્રાહકોને વસૂલી માટે રીમાઇન્ડર મોકલો`);
        suggestionsEn.push(`Total pending udhaar is ₹${totalUdhaar}, send WhatsApp reminders to long overdue customers`);
      }

      if (lowStockCount > 0) {
        suggestions.push(`${lowStockCount} વસ્તુઓનો સ્ટોક ઓછો છે, નવો સ્ટોક મંગાવો`);
        suggestionsEn.push(`${lowStockCount} items running low on stock, reorder inventory`);
      }

      if (suggestions.length === 0) {
        return {
          answerText: 'તમારો વેપાર સરસ ચાલી રહ્યો છે! ઉધાર અને સ્ટોક બધું નિયંત્રણમાં છે.',
          answerTextEnglish: 'Your shop is running smoothly! Udhaar and inventory are well managed.',
        };
      }

      const urgencyPrefixGu = (totalUdhaar >= 2000 || lowStockCount >= 3) ? 'ખાસ ધ્યાન આપો: ' : 'સુઝાવો: ';
      const urgencyPrefixEn = (totalUdhaar >= 2000 || lowStockCount >= 3) ? 'Urgent Attention Required: ' : 'Suggestions: ';

      return {
        answerText: `${urgencyPrefixGu}${suggestions.join('; ')}.`,
        answerTextEnglish: `${urgencyPrefixEn}${suggestionsEn.join('; ')}.`,
      };
    }

    // Default overview
    const totalIncome = todaySales + todayCollected;
    return {
      answerText: `આજનો વેપાર: કુલ કમાણી ₹${totalIncome}, નવું ઉધાર ₹${todayNewUdhaar}.`,
      answerTextEnglish: `Today's overview: total income ₹${totalIncome}, new udhaar ₹${todayNewUdhaar}.`,
    };
  } catch (err) {
    console.warn('Error generating business insights:', err.message);
    return {
      answerText: 'વેપારની માહિતી મેળવવામાં ભૂલ આવી.',
      answerTextEnglish: 'Could not fetch business insights data.',
    };
  }
}

/**
 * POST /api/voice/query
 * Accepts audio in base64.
 * Classifies query vs transaction and generates natural spoken answer in Gujarati and English.
 */
const processVoiceQuery = async (req, res) => {
  const reqStart = Date.now();
  const reqStartISO = new Date(reqStart).toISOString();
  console.log(`[Voice Query Timing] [${reqStartISO}] POST /api/voice/query - Request received`);

  try {
    const { audioData, audioBase64, mimeType = 'audio/mp3', mockQueryType, mockCustomerName, isMockTransaction } = req.body;
    const base64Content = audioBase64 || audioData;

    if (!base64Content) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'audioBase64 or audioData (base64 encoded audio) is required',
      });
    }

    const shopkeeperId = req.shopkeeper ? req.shopkeeper.shopkeeperId : null;
    const apiKey = process.env.GEMINI_API_KEY;

    // Handle mock environment for testing or missing API key
    if (!apiKey || process.env.NODE_ENV === 'test' || process.env.USE_MOCK_GEMINI === 'true') {
      let decodedAudio = '';
      try {
        decodedAudio = Buffer.from(base64Content, 'base64').toString('utf8');
      } catch (e) {
        // ignore
      }

      const isTx = isMockTransaction || decodedAudio.includes('mock_transaction');
      if (isTx) {
        return res.status(200).json({
          isQuery: false,
          message: 'આ ટ્રાન્ઝેક્શન છે. મહેરબાની કરીને ટ્રાન્ઝેક્શન મોડનો ઉપયોગ કરો. / This audio is a transaction, please use transaction recording mode.',
        });
      }

      let qType = mockQueryType || req.body.mockQueryType;
      let sType = req.body.mockSubType;
      let timeframe = req.body.mockTimeframe;
      let actionType = req.body.mockActionType;

      if (!qType) {
        if (decodedAudio.includes('top_debtor') || decodedAudio.includes('sabse zyada udhaar')) {
          qType = 'customer_balance';
          sType = 'top_debtor';
        } else if (decodedAudio.includes('debtor_count') || decodedAudio.includes('kitne customers udhaar')) {
          qType = 'customer_balance';
          sType = 'debtor_count';
        } else if (decodedAudio.includes('total_outstanding') || decodedAudio.includes('total kitna udhaar')) {
          qType = 'customer_balance';
          sType = 'total_outstanding';
        } else if (decodedAudio.includes('history')) {
          qType = 'customer_history';
        } else if (decodedAudio.includes('low_stock')) {
          qType = 'inventory_low_stock';
        } else if (decodedAudio.includes('out_of_stock') || decodedAudio.includes('khatam thai gaya')) {
          qType = 'inventory_status';
          sType = 'out_of_stock';
        } else if (decodedAudio.includes('best_selling') || decodedAudio.includes('sabse zyada bikta')) {
          qType = 'inventory_status';
          sType = 'best_selling';
        } else if (decodedAudio.includes('inventory')) {
          qType = 'inventory_status';
        } else if (decodedAudio.includes('comparison') || decodedAudio.includes('kal se aaj')) {
          qType = 'daily_summary';
          sType = 'comparison';
        } else if (decodedAudio.includes('best_day') || decodedAudio.includes('best din')) {
          qType = 'daily_summary';
          sType = 'best_day';
        } else if (decodedAudio.includes('summary')) {
          qType = 'daily_summary';
        } else if (decodedAudio.includes('insights') || decodedAudio.includes('aaj kamai') || decodedAudio.includes('mahina kem') || decodedAudio.includes('sudharo')) {
          qType = 'business_insights';
          if (decodedAudio.includes('aaj kamai')) sType = 'today_earnings';
          else if (decodedAudio.includes('mahina kem')) sType = 'monthly_overview';
          else if (decodedAudio.includes('sudharo')) sType = 'suggestions';
        } else if (decodedAudio.includes('general')) {
          qType = 'general';
        } else {
          qType = 'customer_balance';
        }
      }

      const effectiveShopId = getEffectiveShopId(req);

      if (qType === 'customer_balance' || sType === 'phone_number') {
        const recentTurns = getConversationContext(shopkeeperId, effectiveShopId);
        let activeCustName = mockCustomerName || req.body.mockCustomerName || (sType ? null : 'Ramesh');

        if (!activeCustName && recentTurns.length > 0) {
          const lastCustTurn = [...recentTurns].reverse().find((t) => t.customer_name);
          if (lastCustTurn) activeCustName = lastCustTurn.customer_name;
        }

        let result;
        if (sType === 'phone_number') {
          result = await handleCustomerPhoneQuery(shopkeeperId, activeCustName, effectiveShopId);
        } else {
          result = await handleCustomerBalanceQuery(shopkeeperId, activeCustName, effectiveShopId, sType);
        }

        const resolvedCustomerName = (result && result.customerName && result.customerName !== 'ગ્રાહક') ? result.customerName : activeCustName;

        recordConversationTurn(shopkeeperId, effectiveShopId, {
          queryText: 'mock query',
          customer_name: resolvedCustomerName,
          item_name: null,
          queryType: 'customer_balance',
          subType: sType,
          answerText: result.answerText,
          answerTextEnglish: result.answerTextEnglish,
        });

        return res.status(200).json({
          isQuery: true,
          queryType: 'customer_balance',
          subType: sType,
          customer_name: resolvedCustomerName,
          answerText: result.answerText,
          answerTextEnglish: result.answerTextEnglish,
        });
      } else if (qType === 'customer_history') {
        const custName = mockCustomerName || req.body.mockCustomerName || null;
        const result = await handleCustomerHistoryQuery(shopkeeperId, custName, effectiveShopId, timeframe, actionType);
        return res.status(200).json({
          isQuery: true,
          queryType: 'customer_history',
          timeframe,
          actionType,
          answerText: result.answerText,
          answerTextEnglish: result.answerTextEnglish,
        });
      } else if (qType === 'inventory_status') {
        const itemName = req.body.mockItemName || null;
        const result = await handleInventoryStatusQuery(shopkeeperId, itemName, effectiveShopId, sType);
        return res.status(200).json({
          isQuery: true,
          queryType: 'inventory_status',
          subType: sType,
          answerText: result.answerText,
          answerTextEnglish: result.answerTextEnglish,
        });
      } else if (qType === 'inventory_low_stock') {
        const result = await handleInventoryLowStockQuery(shopkeeperId, effectiveShopId);
        return res.status(200).json({
          isQuery: true,
          queryType: 'inventory_low_stock',
          answerText: result.answerText,
          answerTextEnglish: result.answerTextEnglish,
        });
      } else if (qType === 'daily_summary') {
        const result = await handleDailySummaryQuery(shopkeeperId, effectiveShopId, sType);
        return res.status(200).json({
          isQuery: true,
          queryType: 'daily_summary',
          subType: sType,
          answerText: result.answerText,
          answerTextEnglish: result.answerTextEnglish,
        });
      } else if (qType === 'business_insights') {
        const result = await handleBusinessInsightsQuery(shopkeeperId, effectiveShopId, sType);
        return res.status(200).json({
          isQuery: true,
          queryType: 'business_insights',
          subType: sType,
          answerText: result.answerText,
          answerTextEnglish: result.answerTextEnglish,
        });
      } else {
        return res.status(200).json({
          isQuery: true,
          queryType: 'general',
          answerText: 'શું તમે કોઈ ચોક્કસ ગ્રાહક, વસ્તુ અથવા વેચાણ વિશે પૂછવા માંગો છો?',
          answerTextEnglish: 'Are you asking about a specific customer, item, or sale?',
        });
      }
    }

    const firestoreStart = Date.now();
    const firestoreStartISO = new Date(firestoreStart).toISOString();
    console.log(`[Voice Query Timing] [${firestoreStartISO}] [1/3] Fetching Firestore customer list for query context...`);

    const genAI = new GoogleGenerativeAI(apiKey);
    const effectiveShopId = getEffectiveShopId(req);
    const existingCustomerNames = await getCachedCustomerNames(shopkeeperId, effectiveShopId, true);
    const firestoreFetchMs = Date.now() - firestoreStart;
    console.log(`[Voice Query Timing] [${new Date().toISOString()}] [1/3] Firestore fetch finished | Duration: ${firestoreFetchMs}ms | Customer count: ${existingCustomerNames.length}`);

    const customerContextListStr = existingCustomerNames.length > 0 ? existingCustomerNames.join(', ') : 'None';

    const recentTurns = getConversationContext(shopkeeperId, effectiveShopId);
    let conversationHistoryStr = 'None';
    if (recentTurns.length > 0) {
      conversationHistoryStr = recentTurns.map((t, idx) => {
        return `Turn ${idx + 1}:
  - User Query / Spoken Intent: "${t.queryText || ''}"
  - Customer Mentioned: ${t.customer_name || 'None'}
  - Item Mentioned: ${t.item_name || 'None'}
  - Query Type: ${t.queryType || 'None'}
  - System Answer: "${t.answerTextEnglish || t.answerText || ''}"`;
      }).join('\n');
    }

    const prompt = `
You are an expert multilingual speech recognition and voice query assistant for Indian shopkeepers.
Analyze the provided audio recording. Note that the speaker may speak in Gujarati, Hindi, English, or any mix of these three languages (e.g. Gujarati sentence with Hindi or English words). Auto-detect the language(s) used and transcribe accurately regardless of which language or mix is used.

MULTi-TURN CONVERSATION MEMORY & PRONOUN RESOLUTION:
Recent Conversation History:
${conversationHistoryStr}

If the current voice query uses pronouns or implicit references like "uska", "usko", "wo", "woh", "usme se", "eni", "tenu", "his", "her", "their" without naming anyone/anything specific, inspect the Recent Conversation History above:
- If previous turn(s) discussed a specific customer (e.g. Ramesh), resolve "customer_name" to that customer name ("Ramesh").
- If previous turn(s) discussed a specific item (e.g. Parle-G), resolve "item_name" to that item name ("Parle-G").
- If the follow-up asks for phone number, address, or details about the previous customer (e.g., "aur uska phone number kya hai", "no. sho chhe"), classify queryType as "customer_balance" or "customer_history" and extract customer_name as the previous customer name.
- IF THE FOLLOW-UP QUERY CHANGES TOPIC ENTIRELY (e.g., mentions a different customer like "Suresh" or a new topic like sales comparison), update customer_name / item_name to the NEW entity being discussed and do NOT stick to the old context.

Task:
1. Determine if the user is asking a QUESTION/QUERY (asking for info like customer balance, history, sales, inventory, business insights) OR making a TRANSACTION instruction (recording sale/udhaar/stock change).
   - "classification": "QUERY" or "TRANSACTION"

2. If classification is "QUERY", categorize into one of these queryTypes and subTypes:

   a) "customer_balance":
      - subType "single": balance of a specific customer (e.g. "Ramesh ka kitna udhaar baaki hai")
      - subType "top_debtor": who owes the most (e.g. "sabse zyada udhaar kiska hai", "konnu sauthi vadhu udhaar chhe")
      - subType "debtor_count": how many customers have pending udhaar (e.g. "kitne customers udhaar par hai", "kethla grahak nu udhaar baaki chhe")
      - subType "total_outstanding": total outstanding balance across all customers (e.g. "total kitna udhaar bakaya hai", "kool kethlu udhaar chhe")

   b) "customer_history":
      - asking for transaction history/activity.
      - Can be for a specific customer or for all transactions.
      - Identify timeframe ("today", "yesterday", "this_week", "last_week", "this_month", "last_month", "all_time")
      - Identify actionType ("udhaar_add" for credit/taken, "udhaar_paid" for vasool/collected/paid back, "sale" for sales, "all")
      - e.g. "is mahine Ramesh ne kitna liya" -> customer_name: "Ramesh", timeframe: "this_month", actionType: "udhaar_add"
      - e.g. "pichhle hafte kitna vasool hua" -> timeframe: "last_week", actionType: "udhaar_paid"

   c) "daily_summary":
      - subType "today_summary": today's sales, new udhaar, and collection (e.g. "aaj ka summary batao")
      - subType "comparison": comparing today's sales with yesterday (e.g. "kal se aaj zyada vechaan hua ke kam")
      - subType "best_day": best sales day this week (e.g. "is hafte ka best din kaunsa tha")

   d) "inventory_status" or "inventory_low_stock":
      - "inventory_status" subType "item_check": specific item quantity or general inventory list (e.g. "Parle-G kitna hai")
      - "inventory_low_stock": items running low on stock
      - "inventory_status" subType "out_of_stock": items completely out of stock / zero quantity (e.g. "kitne items khatam thai gaya", "kaunsa stock zero hai")
      - "inventory_status" subType "best_selling": best-selling item based on sales (e.g. "sabse zyada bikta hua item kaunsa")

   e) "business_insights":
      - subType "today_earnings": how earnings/sales went today (e.g. "aaj kamai kem thai", "aaj kaisa raha business")
      - subType "monthly_overview": overall monthly performance overview (e.g. "mahina kem gayo", "is mahine kaisa raha shop")
      - subType "suggestions": suggestions/improvements for shop (e.g. "kya sudharo karvo joie", "business ke mate shu karvu")

   f) "general":
      - Any other question or fallback.

3. Entity Extraction:
   - "customer_name": Extracted customer name if mentioned (string or null). Transcribe EXACTLY as spoken without forcing to an existing customer name unless phonetically identical.
     - Existing Customer List for this shop: [ ${customerContextListStr} ]
   - "item_name": Extracted product/item name if mentioned (string or null).
   - "timeframe": "today" | "yesterday" | "this_week" | "last_week" | "this_month" | "last_month" | "all_time" | null
   - "actionType": "udhaar_add" | "udhaar_paid" | "sale" | "all" | null

4. Output fields:
   - "answerText": Gujarati spoken response text (optional/null if backend will construct from data, required for "general").
   - "answerTextEnglish": English translation (optional/null if backend constructs from data).
   - "detectedLanguage": "gujarati" | "hindi" | "english" | "mixed".

Return ONLY a valid JSON object without markdown formatting:
{
  "classification": "QUERY" | "TRANSACTION",
  "queryType": "customer_balance" | "customer_history" | "daily_summary" | "inventory_status" | "inventory_low_stock" | "business_insights" | "general",
  "subType": "single" | "top_debtor" | "debtor_count" | "total_outstanding" | "today_summary" | "comparison" | "best_day" | "item_check" | "out_of_stock" | "best_selling" | "today_earnings" | "monthly_overview" | "suggestions" | null,
  "customer_name": "..." | null,
  "item_name": "..." | null,
  "timeframe": "today" | "yesterday" | "this_week" | "last_week" | "this_month" | "last_month" | "all_time" | null,
  "actionType": "udhaar_add" | "udhaar_paid" | "sale" | "all" | null,
  "detectedLanguage": "gujarati" | "hindi" | "english" | "mixed",
  "answerText": "..." | null,
  "answerTextEnglish": "..." | null
}
`;

    const audioPart = {
      inlineData: {
        data: base64Content,
        mimeType: mimeType,
      },
    };

    const geminiStart = Date.now();
    const geminiStartISO = new Date(geminiStart).toISOString();
    console.log(`[Voice Query Timing] [${geminiStartISO}] [2/3] Calling Gemini API for query classification...`);

    const result = await generateWithFallback(genAI, async (model) => {
      return await model.generateContent([prompt, audioPart]);
    });

    const geminiCallMs = Date.now() - geminiStart;
    console.log(`[Voice Query Timing] [${new Date().toISOString()}] [2/3] Gemini API call complete | Duration: ${geminiCallMs}ms`);

    const responseText = result.response.text();

    const extractJson = (rawText) => {
      if (!rawText || typeof rawText !== 'string') return null;
      const cleaned = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
      try {
        return JSON.parse(cleaned);
      } catch (e) {}
      const jsonRegex = /\{[\s\S]*\}|\[[\s\S]*\]/;
      const match = rawText.match(jsonRegex);
      if (match) {
        try {
          return JSON.parse(match[0]);
        } catch (e) {}
      }
      return null;
    };

    const parsedResult = extractJson(responseText) || {
      classification: 'QUERY',
      queryType: 'general',
      customer_name: null,
      answerText: 'તમારો પ્રશ્ન સમજી શકાયો નથી, કૃપા કરીને ફરી પૂછો.',
      answerTextEnglish: 'Could not understand your question, please ask again.',
    };

    if (parsedResult.classification === 'TRANSACTION') {
      return res.status(200).json({
        isQuery: false,
        message: 'આ ટ્રાન્ઝેક્શન છે. મહેરબાની કરીને ટ્રાન્ઝેક્શન મોડનો ઉપયોગ કરો. / This audio is a transaction, please use transaction recording mode.',
      });
    }

    const queryType = parsedResult.queryType || 'general';

    const totalMs = Date.now() - reqStart;
    console.log(`[Voice Query Timing] [${new Date().toISOString()}] [3/3] End-to-End Voice Query Completed | Total Time: ${totalMs}ms (Firestore: ${firestoreFetchMs}ms, Gemini: ${geminiCallMs}ms)`);

    // Check conversation history for entity fallback if current entity is missing
    let activeCustomerName = parsedResult.customer_name;
    let activeItemName = parsedResult.item_name;

    if (!activeCustomerName && recentTurns.length > 0) {
      const lastCustTurn = [...recentTurns].reverse().find((t) => t.customer_name);
      if (lastCustTurn && lastCustTurn.customer_name) {
        activeCustomerName = lastCustTurn.customer_name;
      }
    }

    if (!activeItemName && recentTurns.length > 0) {
      const lastItemTurn = [...recentTurns].reverse().find((t) => t.item_name);
      if (lastItemTurn && lastItemTurn.item_name) {
        activeItemName = lastItemTurn.item_name;
      }
    }

    let finalResponse = null;

    if (parsedResult.subType === 'phone_number' || (parsedResult.answerTextEnglish && parsedResult.answerTextEnglish.toLowerCase().includes('phone'))) {
      const phoneResult = await handleCustomerPhoneQuery(shopkeeperId, activeCustomerName, effectiveShopId);
      finalResponse = {
        isQuery: true,
        queryType: 'customer_balance',
        subType: 'phone_number',
        customer_name: activeCustomerName,
        answerText: phoneResult.answerText,
        answerTextEnglish: phoneResult.answerTextEnglish,
      };
    } else if (queryType === 'customer_balance') {
      const balanceResult = await handleCustomerBalanceQuery(shopkeeperId, activeCustomerName, effectiveShopId, parsedResult.subType);
      finalResponse = {
        isQuery: true,
        queryType: 'customer_balance',
        subType: parsedResult.subType,
        customer_name: activeCustomerName,
        answerText: balanceResult.answerText,
        answerTextEnglish: balanceResult.answerTextEnglish,
      };
    } else if (queryType === 'customer_history') {
      const historyResult = await handleCustomerHistoryQuery(shopkeeperId, activeCustomerName, effectiveShopId, parsedResult.timeframe, parsedResult.actionType);
      finalResponse = {
        isQuery: true,
        queryType: 'customer_history',
        timeframe: parsedResult.timeframe,
        actionType: parsedResult.actionType,
        customer_name: activeCustomerName,
        answerText: historyResult.answerText,
        answerTextEnglish: historyResult.answerTextEnglish,
      };
    } else if (queryType === 'inventory_status') {
      const inventoryResult = await handleInventoryStatusQuery(shopkeeperId, activeItemName, effectiveShopId, parsedResult.subType);
      finalResponse = {
        isQuery: true,
        queryType: 'inventory_status',
        subType: parsedResult.subType,
        item_name: activeItemName,
        answerText: inventoryResult.answerText,
        answerTextEnglish: inventoryResult.answerTextEnglish,
      };
    } else if (queryType === 'inventory_low_stock') {
      const lowStockResult = await handleInventoryLowStockQuery(shopkeeperId, effectiveShopId);
      finalResponse = {
        isQuery: true,
        queryType: 'inventory_low_stock',
        answerText: lowStockResult.answerText,
        answerTextEnglish: lowStockResult.answerTextEnglish,
      };
    } else if (queryType === 'daily_summary') {
      const summaryResult = await handleDailySummaryQuery(shopkeeperId, effectiveShopId, parsedResult.subType);
      finalResponse = {
        isQuery: true,
        queryType: 'daily_summary',
        subType: parsedResult.subType,
        answerText: summaryResult.answerText,
        answerTextEnglish: summaryResult.answerTextEnglish,
      };
    } else if (queryType === 'business_insights') {
      const insightResult = await handleBusinessInsightsQuery(shopkeeperId, effectiveShopId, parsedResult.subType);
      finalResponse = {
        isQuery: true,
        queryType: 'business_insights',
        subType: parsedResult.subType,
        answerText: insightResult.answerText,
        answerTextEnglish: insightResult.answerTextEnglish,
      };
    } else {
      // Smart Fallback Handling: check if customer, item, or timeframe was extracted
      if (activeCustomerName) {
        const historyResult = await handleCustomerHistoryQuery(shopkeeperId, activeCustomerName, effectiveShopId, parsedResult.timeframe, parsedResult.actionType);
        finalResponse = {
          isQuery: true,
          queryType: 'customer_history',
          customer_name: activeCustomerName,
          answerText: historyResult.answerText,
          answerTextEnglish: historyResult.answerTextEnglish,
        };
      } else if (activeItemName) {
        const inventoryResult = await handleInventoryStatusQuery(shopkeeperId, activeItemName, effectiveShopId, parsedResult.subType);
        finalResponse = {
          isQuery: true,
          queryType: 'inventory_status',
          item_name: activeItemName,
          answerText: inventoryResult.answerText,
          answerTextEnglish: inventoryResult.answerTextEnglish,
        };
      } else if (parsedResult.timeframe) {
        const historyResult = await handleCustomerHistoryQuery(shopkeeperId, null, effectiveShopId, parsedResult.timeframe, parsedResult.actionType);
        finalResponse = {
          isQuery: true,
          queryType: 'customer_history',
          answerText: historyResult.answerText,
          answerTextEnglish: historyResult.answerTextEnglish,
        };
      } else {
        finalResponse = {
          isQuery: true,
          queryType: 'general',
          answerText: parsedResult.answerText || 'શું તમે કોઈ ચોક્કસ ગ્રાહક, વસ્તુ અથવા વેચાણ વિશે પૂછવા માંગો છો?',
          answerTextEnglish: parsedResult.answerTextEnglish || 'Are you asking about a specific customer, item, or sale?',
        };
      }
    }

    // Record this turn into multi-turn conversation memory
    recordConversationTurn(shopkeeperId, effectiveShopId, {
      queryText: parsedResult.answerTextEnglish || parsedResult.answerText || '',
      customer_name: activeCustomerName,
      item_name: activeItemName,
      queryType: finalResponse.queryType,
      subType: finalResponse.subType,
      answerText: finalResponse.answerText,
      answerTextEnglish: finalResponse.answerTextEnglish,
    });

    return res.status(200).json(finalResponse);
  } catch (error) {
    console.error('Error processing voice query:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: error.message,
    });
  }
};

module.exports = {
  processVoice,
  processVoiceQuery,
  levenshteinDistance,
  normalizeGujaratiPhonetics,
  findSuggestedCustomerName,
};
