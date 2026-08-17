const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

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

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || 'તારણ મેળવવામાં નિષ્ફળ / Failed to fetch daily summary');
  }

  return data;
}
