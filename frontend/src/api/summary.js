const API_BASE_URL = import.meta.env.VITE_API_URL || '';

async function handleApiResponse(response, defaultErrorMsg) {
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      localStorage.removeItem('voice_udhar_shopkeeper_id');
      localStorage.removeItem('voice_udhar_api_key');
      localStorage.removeItem('voice_udhar_shop_name');
      localStorage.setItem('voice_udhar_auth_error', 'સેશન સમાપ્ત થઈ ગયું છે, કૃપા કરીને ફરી નોંધણી કરો / Session expired, please register again.');
      window.dispatchEvent(new Event('voice_udhar_auth_failed'));
      throw new Error('સેશન સમાપ્ત થઈ ગયું છે, કૃપા કરીને ફરી નોંધણી કરો / Session expired, please register again.');
    }

    let errorData = null;
    try {
      errorData = await response.json();
    } catch (e) {
      // ignore JSON parse failure
    }

    const msg = (errorData && errorData.message) || response.statusText || defaultErrorMsg;
    throw new Error(msg);
  }

  try {
    return await response.json();
  } catch (e) {
    throw new Error('અમાન્ય સર્વર પ્રતિસાદ / Invalid JSON response from server');
  }
}

/**
 * Get daily summary metrics for a shopkeeper.
 * GET /api/summary/daily/:shopkeeperId
 * @param {string} shopkeeperId
 * @returns {Promise<Object>} { totalSales, totalNewUdhaar, totalUdhaarCollected, transactionCount }
 */
export async function getDailySummaryApi(shopkeeperId) {
  const apiKey = localStorage.getItem('voice_udhar_api_key') || '';

  const response = await fetch(`${API_BASE_URL}/api/summary/daily/${shopkeeperId}`, {
    method: 'GET',
    headers: {
      'x-api-key': apiKey,
    },
  });

  return await handleApiResponse(response, 'તારણ મેળવવામાં નિષ્ફળ / Failed to fetch daily summary');
}

/**
 * Get summary trend data (weekly or monthly) for a shopkeeper.
 * GET /api/summary/trends/:shopkeeperId?period=week|month
 * @param {string} shopkeeperId
 * @param {string} period - 'week' or 'month'
 * @returns {Promise<Object>} { period, dataPoints: [...] }
 */
export async function getSummaryTrendsApi(shopkeeperId, period = 'week') {
  const apiKey = localStorage.getItem('voice_udhar_api_key') || '';

  const response = await fetch(`${API_BASE_URL}/api/summary/trends/${shopkeeperId}?period=${period}`, {
    method: 'GET',
    headers: {
      'x-api-key': apiKey,
    },
  });

  return await handleApiResponse(response, 'ટ્રેન્ડ મેળવવામાં નિષ્ફળ / Failed to fetch summary trends');
}
