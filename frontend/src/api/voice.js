const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

/**
 * Send base64 audio to POST /api/voice/process for AI intent & detail extraction.
 * @param {string} audioBase64 - Base64 encoded audio string
 * @param {string} mimeType - Audio mime type (e.g. 'audio/webm' or 'audio/mp3')
 * @returns {Promise<Object>} AI extraction result
 */
export async function processVoiceAudio(audioBase64, mimeType = 'audio/webm') {
  const apiKey = localStorage.getItem('voice_udhar_api_key') || '';

  const response = await fetch(`${API_BASE_URL}/api/voice/process`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify({
      audioBase64,
      mimeType,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || 'અવાજ પ્રક્રિયા કરવામાં નિષ્ફળ / Voice processing failed');
  }

  return data;
}
