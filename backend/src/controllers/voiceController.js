const { GoogleGenerativeAI } = require('@google/generative-ai');
const { generateWithFallback } = require('../config/geminiModelResolver');
const { db } = require('../config/firebase');
const { getEffectiveShopId, isDocInShop } = require('../utils/shopHelper');

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
 * Finds a suggested customer match from an array of existing customer names using generic phonetic + edit distance similarity.
 */
function findSuggestedCustomerName(extractedName, existingCustomerNames) {
  if (!extractedName || !Array.isArray(existingCustomerNames) || existingCustomerNames.length === 0) {
    return null;
  }

  const cleanExtracted = extractedName.trim();
  const normExtracted = normalizeGujaratiPhonetics(cleanExtracted);

  let bestMatch = null;
  let minDistance = Infinity;

  for (const existingName of existingCustomerNames) {
    if (!existingName) continue;
    const cleanExisting = existingName.trim();

    // Exact match
    if (cleanExtracted.toLowerCase() === cleanExisting.toLowerCase()) {
      return null; // Already an exact match
    }

    const normExisting = normalizeGujaratiPhonetics(cleanExisting);

    // Phonetic normalized exact match
    if (normExtracted.length >= 2 && normExtracted === normExisting) {
      return cleanExisting;
    }

    // Levenshtein distance on normalized strings
    const dist = levenshteinDistance(normExtracted, normExisting);
    const maxLen = Math.max(normExtracted.length, normExisting.length);

    // Consider close match if edit distance is <= 2 (or <= 30% of max length)
    if (dist <= 2 || (maxLen >= 5 && dist / maxLen <= 0.3)) {
      if (dist < minDistance) {
        minDistance = dist;
        bestMatch = cleanExisting;
      }
    }
  }

  return bestMatch;
}

// In-memory cache for customer names per shopkeeper (60 second TTL)
const customerCache = new Map();
const CUSTOMER_CACHE_TTL_MS = 60000;

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

      const mockName = 'Ramesh';
      const suggested = findSuggestedCustomerName(mockName, existingCustomerNames);
      return res.status(200).json({
        transcription_gujarati: 'રમેશ ભાઈ ૫૦ રૂપિયા ઉધાર ખાંડ અને ચા',
        translation_english: 'Ramesh bhai 50 rupees credit sugar and tea',
        intent: 'add_udhaar',
        customer_name: mockName,
        suggested_customer_name: suggested,
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
2. CONSONANT SOUND VARIATIONS:
   - Note that in spoken speech, similar-sounding consonant pairs are frequently confused (e.g. બ/ભ, ક/ખ, ગ/ઘ, ડ/ઢ, પ/ફ, ત/થ, ચ/છ, ટ/ઠ, જ/ઝ).
   - Existing Customer List for this shop: [ ${customerContextListStr} ]
   - If the transcribed spoken name is phonetically close to any name in this existing customer list, prefer matching to the existing name from the list.

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
4. Extract customer name if mentioned (customer_name) - string or null.
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
 * Helper to query customer balance for query endpoint.
 */
async function handleCustomerBalanceQuery(shopkeeperId, customerName, shopId) {
  let customerDisplayName = customerName || 'ગ્રાહક';
  let balance = 0;
  let customerFound = false;
  const effectiveShopId = shopId || (shopkeeperId ? `shop_${shopkeeperId}` : null);

  if (shopkeeperId) {
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

        if (bestMatch && (minDist <= 3 || normTarget === normalizeGujaratiPhonetics(bestMatch.name))) {
          customerDisplayName = bestMatch.name;
          balance = Number(bestMatch.totalUdhaar) || 0;
          customerFound = true;
        }
      }
    } catch (err) {
      console.warn('Error fetching customer balance for query:', err.message);
    }
  }

  const answerText = customerFound
    ? `${customerDisplayName}નું ${balance} રૂપિયા ઉધાર બાકી છે.`
    : customerName
      ? `${customerName} નામના કોઈ ગ્રાહક મળ્યા નથી.`
      : `ગ્રાહકનું નામ સ્પષ્ટ નથી.`;

  const answerTextEnglish = customerFound
    ? `${customerDisplayName}'s pending balance is ${balance} rupees.`
    : customerName
      ? `No customer named ${customerName} was found.`
      : `Customer name was not specified.`;

  return { customerName: customerDisplayName, balance, answerText, answerTextEnglish };
}

/**
 * Helper to query customer history for query endpoint.
 */
async function handleCustomerHistoryQuery(shopkeeperId, customerName, shopId) {
  let customerDisplayName = customerName || 'ગ્રાહક';
  let totalBorrowed = 0;
  let totalPaid = 0;
  let currentBalance = 0;
  let lastTransactionDateStr = null;
  let customerFound = false;
  let hasTransactions = false;
  const effectiveShopId = shopId || (shopkeeperId ? `shop_${shopkeeperId}` : null);

  if (shopkeeperId) {
    try {
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

        if (bestMatch && (minDist <= 3 || normTarget === normalizeGujaratiPhonetics(bestMatch.name))) {
          customerDisplayName = bestMatch.name;
          currentBalance = Number(bestMatch.totalUdhaar) || 0;
          customerFound = true;

          const custId = bestMatch.customerId || bestMatch.id;
          const txSnapshot = await db.collection('transactions')
            .where('shopkeeperId', '==', shopkeeperId)
            .where('customerId', '==', custId)
            .get();

          const transactions = [];
          txSnapshot.forEach((doc) => transactions.push(doc.data()));

          if (transactions.length > 0) {
            hasTransactions = true;
            // Sort by timestamp ascending
            transactions.sort((a, b) => new Date(a.timestamp || 0) - new Date(b.timestamp || 0));

            for (const tx of transactions) {
              const amt = Number(tx.amount) || 0;
              if (tx.type === 'udhaar_add') {
                totalBorrowed += amt;
              } else if (tx.type === 'udhaar_paid') {
                totalPaid += amt;
              }
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
    } catch (err) {
      console.warn('Error fetching customer history for query:', err.message);
    }
  }

  if (!customerFound) {
    const answerText = customerName
      ? `${customerName} નામના કોઈ ગ્રાહક મળ્યા નથી.`
      : `ગ્રાહકનું નામ સ્પષ્ટ નથી.`;
    const answerTextEnglish = customerName
      ? `No customer named ${customerName} was found.`
      : `Customer name was not specified.`;
    return { answerText, answerTextEnglish };
  }

  let answerText = '';
  let answerTextEnglish = '';

  if (hasTransactions && lastTransactionDateStr) {
    answerText = `${customerDisplayName}એ કુલ ₹${totalBorrowed} ઉધાર લીધું છે, ₹${totalPaid} પાછું આપ્યું છે. હાલમાં ₹${currentBalance} બાકી છે. છેલ્લો વ્યવહાર ${lastTransactionDateStr} ના રોજ થયો હતો.`;
    answerTextEnglish = `${customerDisplayName} borrowed total ₹${totalBorrowed}, paid back ₹${totalPaid}. Current pending balance is ₹${currentBalance}. The last transaction was on ${lastTransactionDateStr}.`;
  } else {
    answerText = `${customerDisplayName}નો કોઈ વ્યવહાર મળ્યો નથી. હાલમાં ₹${currentBalance} બાકી છે.`;
    answerTextEnglish = `${customerDisplayName} has no transaction history recorded. Current balance is ₹${currentBalance}.`;
  }

  return { customerName: customerDisplayName, totalBorrowed, totalPaid, currentBalance, lastTransactionDateStr, answerText, answerTextEnglish };
}

/**
 * Helper to query inventory status for query endpoint.
 */
async function handleInventoryStatusQuery(shopkeeperId, itemName, shopId) {
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
 * Helper to query daily summary for query endpoint.
 */
async function handleDailySummaryQuery(shopkeeperId, shopId) {
  let totalSales = 0;
  let totalNewUdhaar = 0;
  let totalUdhaarCollected = 0;
  let transactionCount = 0;
  const effectiveShopId = shopId || (shopkeeperId ? `shop_${shopkeeperId}` : null);

  if (shopkeeperId) {
    try {
      const now = new Date();
      const istDateStr = now.toLocaleDateString('sv-SE', { timeZone: 'Asia/Kolkata' });
      const startOfTodayIST = new Date(`${istDateStr}T00:00:00.000+05:30`);
      const endOfTodayIST = new Date(startOfTodayIST.getTime() + 24 * 60 * 60 * 1000);

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

  const answerText = `આજનું કુલ વેચાણ ${totalSales} રૂપિયા છે, નવું ઉધાર ${totalNewUdhaar} રૂપિયા છે, અને ઉધાર વસૂલી ${totalUdhaarCollected} રૂપિયા છે.`;
  const answerTextEnglish = `Today's total sale is ${totalSales} rupees, new udhaar is ${totalNewUdhaar} rupees, and udhaar collected is ${totalUdhaarCollected} rupees.`;

  return { totalSales, totalNewUdhaar, totalUdhaarCollected, transactionCount, answerText, answerTextEnglish };
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

      let qType = mockQueryType;
      if (!qType) {
        if (decodedAudio.includes('history')) qType = 'customer_history';
        else if (decodedAudio.includes('low_stock')) qType = 'inventory_low_stock';
        else if (decodedAudio.includes('inventory')) qType = 'inventory_status';
        else if (decodedAudio.includes('summary')) qType = 'daily_summary';
        else if (decodedAudio.includes('general')) qType = 'general';
        else qType = 'customer_balance';
      }

    const effectiveShopId = getEffectiveShopId(req);

      if (qType === 'customer_balance') {
        const custName = mockCustomerName || req.body.mockItemName || 'Ramesh';
      const result = await handleCustomerBalanceQuery(shopkeeperId, custName, effectiveShopId);
        return res.status(200).json({
          isQuery: true,
          queryType: 'customer_balance',
          answerText: result.answerText,
          answerTextEnglish: result.answerTextEnglish,
        });
      } else if (qType === 'customer_history') {
        const custName = mockCustomerName || 'Ramesh';
      const result = await handleCustomerHistoryQuery(shopkeeperId, custName, effectiveShopId);
        return res.status(200).json({
          isQuery: true,
          queryType: 'customer_history',
          answerText: result.answerText,
          answerTextEnglish: result.answerTextEnglish,
        });
      } else if (qType === 'inventory_status') {
        const itemName = req.body.mockItemName || null;
      const result = await handleInventoryStatusQuery(shopkeeperId, itemName, effectiveShopId);
        return res.status(200).json({
          isQuery: true,
          queryType: 'inventory_status',
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
      const result = await handleDailySummaryQuery(shopkeeperId, effectiveShopId);
        return res.status(200).json({
          isQuery: true,
          queryType: 'daily_summary',
          answerText: result.answerText,
          answerTextEnglish: result.answerTextEnglish,
        });
      } else {
        return res.status(200).json({
          isQuery: true,
          queryType: 'general',
          answerText: 'શું તમે કોઈ ચોક્કસ ગ્રાહક અથવા વસ્તુ વિશે પૂછવા માંગો છો?',
          answerTextEnglish: 'Are you asking about a specific customer or item?',
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

    const prompt = `
You are an expert multilingual speech recognition and voice query assistant for Indian shopkeepers.
Analyze the provided audio recording. Note that the speaker may speak in Gujarati, Hindi, English, or any mix of these three languages. Auto-detect the language(s) used and transcribe accurately regardless of which language or mix is used.

Task:
1. Determine if the user is asking a QUESTION/QUERY (asking for info like customer balance, customer history, stock status, daily sales, etc.) OR making a TRANSACTION instruction (recording sale/udhaar).
   - "classification": "QUERY" or "TRANSACTION"
2. If classification is "QUERY", recognize these query types:
   - "customer_balance": asking how much a specific customer owes / pending balance.
   - "customer_history": asking for detailed transaction history for a specific customer (what they bought/borrowed, when, payments, history).
   - "daily_summary": asking about today's total sales, new udhaar, or collection totals.
   - "inventory_status": asking what items are in stock, total stock quantity, or a specific item's quantity.
   - "inventory_low_stock": asking which items are running low on stock or out of stock.
   - "general": any other question or fallback.

3. Entity Extraction:
   - "customer_name": Extracted customer name if queryType is "customer_balance" or "customer_history" (string or null).
     - Existing Customer List for this shop: [ ${customerContextListStr} ]
     - Prefer matching spoken customer name to existing list if phonetically close.
   - "item_name": Extracted product/item name if queryType is "inventory_status" and a specific item is mentioned (string or null).

4. General Query Handling:
   - If queryType is "general", provide a helpful best-effort answer in Gujarati script if context permits, or a clarifying question like "શું તમે કોઈ ચોક્કસ ગ્રાહક અથવા વસ્તુ વિશે પૂછવા માંગો છો?"
   - "answerText": Gujarati spoken text (required for "general", optional/null for data-driven query types).
   - "answerTextEnglish": English translation of answerText.
   - "detectedLanguage": "gujarati" | "hindi" | "english" | "mixed".

Return ONLY a valid JSON object without markdown formatting:
{
  "classification": "QUERY" | "TRANSACTION",
  "queryType": "customer_balance" | "customer_history" | "daily_summary" | "inventory_status" | "inventory_low_stock" | "general" | null,
  "customer_name": "..." | null,
  "item_name": "..." | null,
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

    if (queryType === 'customer_balance') {
      const balanceResult = await handleCustomerBalanceQuery(shopkeeperId, parsedResult.customer_name, effectiveShopId);
      return res.status(200).json({
        isQuery: true,
        queryType: 'customer_balance',
        answerText: balanceResult.answerText,
        answerTextEnglish: balanceResult.answerTextEnglish,
      });
    } else if (queryType === 'customer_history') {
      const historyResult = await handleCustomerHistoryQuery(shopkeeperId, parsedResult.customer_name, effectiveShopId);
      return res.status(200).json({
        isQuery: true,
        queryType: 'customer_history',
        answerText: historyResult.answerText,
        answerTextEnglish: historyResult.answerTextEnglish,
      });
    } else if (queryType === 'inventory_status') {
      const inventoryResult = await handleInventoryStatusQuery(shopkeeperId, parsedResult.item_name, effectiveShopId);
      return res.status(200).json({
        isQuery: true,
        queryType: 'inventory_status',
        answerText: inventoryResult.answerText,
        answerTextEnglish: inventoryResult.answerTextEnglish,
      });
    } else if (queryType === 'inventory_low_stock') {
      const lowStockResult = await handleInventoryLowStockQuery(shopkeeperId, effectiveShopId);
      return res.status(200).json({
        isQuery: true,
        queryType: 'inventory_low_stock',
        answerText: lowStockResult.answerText,
        answerTextEnglish: lowStockResult.answerTextEnglish,
      });
    } else if (queryType === 'daily_summary') {
      const summaryResult = await handleDailySummaryQuery(shopkeeperId, effectiveShopId);
      return res.status(200).json({
        isQuery: true,
        queryType: 'daily_summary',
        answerText: summaryResult.answerText,
        answerTextEnglish: summaryResult.answerTextEnglish,
      });
    } else {
      return res.status(200).json({
        isQuery: true,
        queryType: 'general',
        answerText: parsedResult.answerText || 'શું તમે કોઈ ચોક્કસ ગ્રાહક અથવા વસ્તુ વિશે પૂછવા માંગો છો?',
        answerTextEnglish: parsedResult.answerTextEnglish || 'Are you asking about a specific customer or item?',
      });
    }
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
