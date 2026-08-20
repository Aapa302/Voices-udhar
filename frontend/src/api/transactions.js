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
 * Log a new transaction.
 * @param {Object} txData - { shopkeeperId, customerId, type, amount, items?, rawVoiceText? }
 * @returns {Promise<Object>} Created transaction
 */
export async function logTransaction(txData) {
  const apiKey = localStorage.getItem('voice_udhar_api_key') || '';
  const shopId = localStorage.getItem('voice_udhar_shop_id') || '';

  const response = await fetch(`${API_BASE_URL}/api/transactions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'x-shop-id': shopId,
    },
    body: JSON.stringify({ ...txData, shopId }),
  });

  const data = await handleApiResponse(response, 'ટ્રાન્ઝેક્શન સેવ કરવામાં ભૂલ આવી / Failed to save transaction');
  return data.data;
}

/**
 * Get transaction history for a customer.
 * @param {string} customerId
 * @returns {Promise<Array>} List of transactions
 */
export async function getTransactionsByCustomer(customerId) {
  const apiKey = localStorage.getItem('voice_udhar_api_key') || '';
  const shopId = localStorage.getItem('voice_udhar_shop_id') || '';

  const response = await fetch(`${API_BASE_URL}/api/transactions/${customerId}`, {
    method: 'GET',
    headers: {
      'x-api-key': apiKey,
      'x-shop-id': shopId,
    },
  });

  const data = await handleApiResponse(response, 'ટ્રાન્ઝેક્શન હિસ્ટ્રી લાવવામાં ભૂલ આવી / Failed to fetch transaction history');
  return data.data || [];
}
