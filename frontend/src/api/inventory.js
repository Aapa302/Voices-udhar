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
 * Get all inventory items for a shopkeeper.
 * @param {string} shopkeeperId
 * @returns {Promise<Array>} List of inventory items sorted low-stock first
 */
export async function getInventoryApi(shopkeeperId) {
  const apiKey = localStorage.getItem('voice_udhar_api_key') || '';
  const shopId = localStorage.getItem('voice_udhar_shop_id') || '';

  const response = await fetch(`${API_BASE_URL}/api/inventory/${shopkeeperId}`, {
    method: 'GET',
    headers: {
      'x-api-key': apiKey,
      'x-shop-id': shopId,
    },
  });

  const data = await handleApiResponse(response, 'સ્ટોક વિગતો મેળવવામાં નિષ્ફળ / Failed to fetch inventory');
  return data.data || [];
}

/**
 * Add or update inventory item (by name fuzzy matching or new item creation).
 * @param {Object} itemData - { itemName, quantity, unit, lowStockThreshold, mode }
 * @returns {Promise<Object>} Response object with data and isLowStock
 */
export async function addOrUpdateInventoryApi(itemData) {
  const apiKey = localStorage.getItem('voice_udhar_api_key') || '';
  const shopkeeperId = localStorage.getItem('voice_udhar_shopkeeper_id') || '';
  const shopId = localStorage.getItem('voice_udhar_shop_id') || '';

  const response = await fetch(`${API_BASE_URL}/api/inventory`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'x-shop-id': shopId,
    },
    body: JSON.stringify({
      shopkeeperId,
      shopId,
      ...itemData,
    }),
  });

  return await handleApiResponse(response, 'સ્ટોક ઉમેરવામાં/સુધારવામાં નિષ્ફળ / Failed to add or update inventory');
}

/**
 * Update an inventory item by itemId.
 * @param {string} itemId
 * @param {Object} itemData - { itemName, quantity, unit, lowStockThreshold }
 * @returns {Promise<Object>} Response object
 */
export async function updateInventoryItemApi(itemId, itemData) {
  const apiKey = localStorage.getItem('voice_udhar_api_key') || '';
  const shopId = localStorage.getItem('voice_udhar_shop_id') || '';

  const response = await fetch(`${API_BASE_URL}/api/inventory/${itemId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'x-shop-id': shopId,
    },
    body: JSON.stringify(itemData),
  });

  return await handleApiResponse(response, 'સ્ટોક વિગતો અપડેટ કરવામાં નિષ્ફળ / Failed to update inventory item');
}

/**
 * Delete an inventory item by itemId.
 * @param {string} itemId
 * @returns {Promise<Object>} Response object
 */
export async function deleteInventoryItemApi(itemId) {
  const apiKey = localStorage.getItem('voice_udhar_api_key') || '';
  const shopId = localStorage.getItem('voice_udhar_shop_id') || '';

  const response = await fetch(`${API_BASE_URL}/api/inventory/${itemId}`, {
    method: 'DELETE',
    headers: {
      'x-api-key': apiKey,
      'x-shop-id': shopId,
    },
  });

  return await handleApiResponse(response, 'સ્ટોક દૂર કરવામાં નિષ્ફળ / Failed to delete inventory item');
}
