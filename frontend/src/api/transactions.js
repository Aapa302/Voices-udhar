const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

/**
 * Log a new transaction.
 * @param {Object} txData - { shopkeeperId, customerId, type, amount, items?, rawVoiceText? }
 * @returns {Promise<Object>} Created transaction
 */
export async function logTransaction(txData) {
  const apiKey = localStorage.getItem('voice_udhar_api_key') || '';

  const response = await fetch(`${API_BASE_URL}/api/transactions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify(txData),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || 'ટ્રાન્ઝેક્શન સેવ કરવામાં ભૂલ આવી / Failed to save transaction');
  }

  return data.data;
}

/**
 * Get transaction history for a customer.
 * @param {string} customerId
 * @returns {Promise<Array>} List of transactions
 */
export async function getTransactionsByCustomer(customerId) {
  const apiKey = localStorage.getItem('voice_udhar_api_key') || '';

  const response = await fetch(`${API_BASE_URL}/api/transactions/${customerId}`, {
    method: 'GET',
    headers: {
      'x-api-key': apiKey,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || 'ટ્રાન્ઝેક્શન હિસ્ટ્રી લાવવામાં ભૂલ આવી / Failed to fetch transaction history');
  }

  return data.data || [];
}
