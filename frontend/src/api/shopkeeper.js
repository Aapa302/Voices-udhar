const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

/**
 * Register a new shopkeeper.
 * @param {Object} data - { shopName: string, phone: string }
 * @returns {Promise<Object>} API response with shopkeeper data
 */
export async function createShopkeeper(data) {
  const response = await fetch(`${API_BASE_URL}/api/shopkeepers`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

  const resData = await response.json();

  if (!response.ok) {
    throw new Error(resData.message || 'દુકાનદાર બનાવવામાં ભૂલ આવી / Failed to create shopkeeper');
  }

  return resData;
}
