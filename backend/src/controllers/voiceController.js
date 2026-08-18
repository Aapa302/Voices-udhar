const { GoogleGenerativeAI } = require('@google/generative-ai');
const { generateWithFallback } = require('../config/geminiModelResolver');
const { db } = require('../config/firebase');

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
async function getCachedCustomerNames(shopkeeperId) {
  if (!shopkeeperId || process.env.USE_MOCK_DB === 'true') {
    return [];
  }

  const cached = customerCache.get(shopkeeperId);
  if (cached && Date.now() - cached.timestamp < CUSTOMER_CACHE_TTL_MS) {
    return cached.names;
  }

  try {
    const snapshot = await db
      .collection('customers')
      .where('shopkeeperId', '==', shopkeeperId)
      .limit(50)
      .get();

    const names = snapshot.docs.map((doc) => doc.data().name).filter(Boolean);
    customerCache.set(shopkeeperId, { names, timestamp: Date.now() });
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
  try {
    const { audioData, audioBase64, mimeType = 'audio/mp3' } = req.body;
    const base64Content = audioBase64 || audioData;

    if (!base64Content) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'audioBase64 or audioData (base64 encoded audio) is required',
      });
    }

    // Fetch existing customer names with caching & limit 50
    const firestoreStart = Date.now();
    const shopkeeperId = req.shopkeeper ? req.shopkeeper.shopkeeperId : null;
    const existingCustomerNames = await getCachedCustomerNames(shopkeeperId);
    const firestoreFetchMs = Date.now() - firestoreStart;

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      // If Gemini API key is missing, return a graceful mock fallback or error
      if (process.env.NODE_ENV === 'test' || process.env.USE_MOCK_GEMINI === 'true') {
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
          confidence: 'high',
        });
      }
      return res.status(500).json({
        error: 'Configuration Error',
        message: 'GEMINI_API_KEY environment variable is not configured',
      });
    }

    const genAI = new GoogleGenerativeAI(apiKey);

    const customerContextListStr = existingCustomerNames.length > 0
      ? existingCustomerNames.join(', ')
      : 'None yet';

    const prompt = `
You are an expert Gujarati speech recognition and intent extraction assistant for small Indian shopkeepers.
Analyze the provided audio recording. Note that speech is spoken in casual, spoken, informal Gujarati from daily shop interactions, including regional dialect pronunciation variations.

CRITICAL INSTRUCTIONS FOR NAME RECOGNITION:
1. Pay special attention to spoken Gujarati names.
2. Note that in spoken Gujarati audio, similar-sounding consonant pairs are frequently confused (e.g. બ/ભ, ક/ખ, ગ/ઘ, ડ/ઢ, પ/ફ, ત/થ, ચ/છ, ટ/ઠ, જ/ઝ). Consider these phonetically commonly confused sounds when transcribing names.
3. Existing Customer List for this shop: [ ${customerContextListStr} ]
   - If the transcribed spoken name is phonetically close to any name in this existing customer list, prefer matching to the existing name from the list.

Task:
1. Transcribe the Gujarati speech accurately in Gujarati script (transcription_gujarati).
2. Translate the Gujarati transcription into English (translation_english).
3. Identify the primary intent (intent):
   - "add_udhaar": Customer bought items on credit (owes money).
   - "mark_paid": Customer paid back credit/udhaar.
   - "record_sale": A direct cash sale happened.
   - "unclear": If the audio is not clear or intent cannot be determined.
4. Extract customer name if mentioned (customer_name) - string or null.
5. Assess name confidence specifically (name_confidence): "high", "medium", or "low".
6. Extract total amount in rupees (amount) - number or 0.
7. Extract list of items mentioned (items) - array of strings or empty array.
8. Assess overall confidence score (confidence): "high", "medium", or "low".

Return ONLY a valid JSON object without any Markdown formatting or code block markers:
{
  "transcription_gujarati": "...",
  "translation_english": "...",
  "intent": "add_udhaar" | "mark_paid" | "record_sale" | "unclear",
  "customer_name": "...",
  "name_confidence": "high" | "medium" | "low",
  "amount": 0,
  "items": ["..."],
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
    const result = await generateWithFallback(genAI, async (model) => {
      return await model.generateContent([prompt, audioPart]);
    });
    const geminiCallMs = Date.now() - geminiStart;
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
        confidence: 'low',
      };
    }

    // Run generic fuzzy matching against existing customer list
    const suggestedName = findSuggestedCustomerName(parsedResult.customer_name, existingCustomerNames);
    parsedResult.suggested_customer_name = suggestedName;

    if (!parsedResult.name_confidence) {
      parsedResult.name_confidence = parsedResult.customer_name ? 'medium' : 'low';
    }

    const totalMs = Date.now() - reqStart;
    console.log(`[Voice Timing] total: ${totalMs}ms | firestoreFetch: ${firestoreFetchMs}ms | geminiCall: ${geminiCallMs}ms`);

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
async function handleCustomerBalanceQuery(shopkeeperId, customerName) {
  let customerDisplayName = customerName || 'ગ્રાહક';
  let balance = 0;
  let customerFound = false;

  if (shopkeeperId) {
    try {
      const snapshot = await db.collection('customers')
        .where('shopkeeperId', '==', shopkeeperId)
        .get();

      const customers = [];
      snapshot.forEach((doc) => customers.push(doc.data()));

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
 * Helper to query daily summary for query endpoint.
 */
async function handleDailySummaryQuery(shopkeeperId) {
  let totalSales = 0;
  let totalNewUdhaar = 0;
  let totalUdhaarCollected = 0;
  let transactionCount = 0;

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
        transactionCount++;
        const amount = Number(data.amount) || 0;
        if (data.type === 'sale') totalSales += amount;
        else if (data.type === 'udhaar_add') totalNewUdhaar += amount;
        else if (data.type === 'udhaar_paid') totalUdhaarCollected += amount;
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

      const qType = mockQueryType || (decodedAudio.includes('summary') ? 'daily_summary' : decodedAudio.includes('general') ? 'general' : 'customer_balance');

      if (qType === 'customer_balance') {
        const custName = mockCustomerName || 'Ramesh';
        const result = await handleCustomerBalanceQuery(shopkeeperId, custName);
        return res.status(200).json({
          isQuery: true,
          queryType: 'customer_balance',
          answerText: result.answerText,
          answerTextEnglish: result.answerTextEnglish,
        });
      } else if (qType === 'daily_summary') {
        const result = await handleDailySummaryQuery(shopkeeperId);
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
          answerText: 'હું તમારી સહાય માટે તૈયાર છું. તમે ગ્રાહકના ઉધાર અથવા આજના વેચાણ વિશે પૂછી શકો છો.',
          answerTextEnglish: 'I am ready to help you. You can ask about customer udhaar or today\'s sales.',
        });
      }
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const existingCustomerNames = await getCachedCustomerNames(shopkeeperId);
    const customerContextListStr = existingCustomerNames.length > 0 ? existingCustomerNames.join(', ') : 'None';

    const prompt = `
You are an expert Gujarati speech recognition and voice query assistant for small Indian shopkeepers.
Analyze the provided audio recording.

Task:
1. Determine if the user is asking a QUESTION/QUERY (asking for info like customer balance, daily sales, or general questions) OR making a TRANSACTION instruction (recording sale/udhaar).
   - "classification": "QUERY" or "TRANSACTION"
2. If classification is "QUERY":
   - "queryType": "customer_balance" (asking about a specific customer's udhaar/balance) | "daily_summary" (asking about today's sales, totals, or udhaar given) | "general" (any other question)
   - "customer_name": Extracted customer name if queryType is "customer_balance" (string or null).
     - Existing Customer List for this shop: [ ${customerContextListStr} ]
     - Prefer matching spoken customer name to existing list if phonetically close.
   - "answerText": If queryType is "general", provide a clear spoken response in Gujarati script. For customer_balance and daily_summary, this can be null.
   - "answerTextEnglish": English translation of answerText.
3. If classification is "TRANSACTION":
   - queryType, customer_name, answerText, answerTextEnglish should be null.

Return ONLY a valid JSON object without markdown formatting:
{
  "classification": "QUERY" | "TRANSACTION",
  "queryType": "customer_balance" | "daily_summary" | "general" | null,
  "customer_name": "..." | null,
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

    const result = await generateWithFallback(genAI, async (model) => {
      return await model.generateContent([prompt, audioPart]);
    });

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

    if (queryType === 'customer_balance') {
      const balanceResult = await handleCustomerBalanceQuery(shopkeeperId, parsedResult.customer_name);
      return res.status(200).json({
        isQuery: true,
        queryType: 'customer_balance',
        answerText: balanceResult.answerText,
        answerTextEnglish: balanceResult.answerTextEnglish,
      });
    } else if (queryType === 'daily_summary') {
      const summaryResult = await handleDailySummaryQuery(shopkeeperId);
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
        answerText: parsedResult.answerText || 'હું તમારી સહાય માટે તૈયાર છું.',
        answerTextEnglish: parsedResult.answerTextEnglish || 'I am ready to help you.',
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
