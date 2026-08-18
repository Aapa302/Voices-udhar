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

module.exports = {
  processVoice,
  levenshteinDistance,
  normalizeGujaratiPhonetics,
  findSuggestedCustomerName,
};
