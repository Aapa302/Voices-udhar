const { GoogleGenerativeAI } = require('@google/generative-ai');

/**
 * POST /api/voice/process
 * Accepts audio in base64 in the request body.
 * Sends audio to Gemini API using native audio input capability.
 * Prompts Gemini to transcribe (Gujarati dialect tolerant), identify intent, extract customer_name, amount, items, confidence, translation_english.
 * Does NOT save anything to Firestore — just returns structured JSON.
 */
const processVoice = async (req, res) => {
  try {
    const { audioData, audioBase64, mimeType = 'audio/mp3' } = req.body;
    const base64Content = audioBase64 || audioData;

    if (!base64Content) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'audioBase64 or audioData (base64 encoded audio) is required',
      });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      // If Gemini API key is missing, return a graceful mock fallback or error
      if (process.env.NODE_ENV === 'test' || process.env.USE_MOCK_GEMINI === 'true') {
        return res.status(200).json({
          transcription_gujarati: 'રમેશ ભાઈ ૫૦ રૂપિયા ઉધાર ખાંડ અને ચા',
          translation_english: 'Ramesh bhai 50 rupees credit sugar and tea',
          intent: 'add_udhaar',
          customer_name: 'Ramesh',
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
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const prompt = `
You are an expert Gujarati speech recognition and intent extraction assistant for shopkeeper billing in India.
Analyze the provided audio recording. Note that speech will be spoken in Gujarati (including informal regional and local dialect variations — be tolerant of informal and dialect speech).

Task:
1. Transcribe the Gujarati speech accurately in Gujarati script (transcription_gujarati).
2. Translate the Gujarati transcription into English (translation_english).
3. Identify the primary intent (intent):
   - "add_udhaar": Customer bought items on credit (owes money).
   - "mark_paid": Customer paid back credit/udhaar.
   - "record_sale": A direct cash sale happened.
   - "unclear": If the audio is not clear or intent cannot be determined.
4. Extract customer name if mentioned (customer_name) - string or null.
5. Extract total amount in rupees (amount) - number or 0.
6. Extract list of items mentioned (items) - array of strings or empty array.
7. Assess confidence score (confidence): "high", "medium", or "low".

Return ONLY a valid JSON object without any Markdown formatting or code block markers:
{
  "transcription_gujarati": "...",
  "translation_english": "...",
  "intent": "add_udhaar" | "mark_paid" | "record_sale" | "unclear",
  "customer_name": "...",
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

    const result = await model.generateContent([prompt, audioPart]);
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
        amount: 0,
        items: [],
        confidence: 'low',
      };
    }

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
};
