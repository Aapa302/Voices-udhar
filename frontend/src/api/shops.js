const API_BASE_URL = import.meta.env.VITE_API_URL || '';

async function handleApiResponse(response, defaultErrorMsg) {
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      localStorage.removeItem('voice_udhar_shopkeeper_id');
      localStorage.removeItem('voice_udhar_api_key');
      localStorage.removeItem('voice_udhar_shop_name');
      localStorage.removeItem('voice_udhar_shop_id');
      localStorage.setItem('voice_udhar_auth_error', 'સેશન સમાપ્ત થઈ ગયું છે, કૃપા કરીને ફરી નોંધણી કરો / Session expired, please register again.');
      window.dispatchEvent(new Event('voice_udhar_auth_failed'));
      throw new Error('સેશન સમાપ્ત થઈ ગયું છે, કૃપા કરીને ફરી નોંધણી કરો / Session expired, please register again.');
    }

    let errorData = null;
    try {
      errorData = await response.json();
    } catch (e) {
      // ignore
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
 * List all shops for current shopkeeper.
 */
export async function getShopsApi() {
  const apiKey = localStorage.getItem('voice_udhar_api_key');
  const response = await fetch(`${API_BASE_URL}/api/shops`, {
    headers: {
      'x-api-key': apiKey || '',
    },
  });

  return await handleApiResponse(response, 'દુકાનોની યાદી મેળવવામાં ભૂલ આવી / Failed to fetch shops');
}

/**
 * Create a new shop.
 * @param {Object} data - { shopName, upiId }
 */
export async function createShopApi(data) {
  const apiKey = localStorage.getItem('voice_udhar_api_key');
  const response = await fetch(`${API_BASE_URL}/api/shops`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey || '',
    },
    body: JSON.stringify(data),
  });

  return await handleApiResponse(response, 'નવી દુકાન બનાવવામાં ભૂલ આવી / Failed to create new shop');
}

/**
 * Update shop details.
 * @param {string} shopId
 * @param {Object} data - { shopName, upiId }
 */
export async function updateShopApi(shopId, data) {
  const apiKey = localStorage.getItem('voice_udhar_api_key');
  const response = await fetch(`${API_BASE_URL}/api/shops/${shopId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey || '',
    },
    body: JSON.stringify(data),
  });

  return await handleApiResponse(response, 'દુકાન વિગતો અપડેટ કરવામાં ભૂલ આવી / Failed to update shop details');
}
