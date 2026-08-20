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
 * Generate PDF bill and WhatsApp share link.
 * @param {Object} billPayload - { shopkeeperId, customerId?, customerName?, customerPhone?, items?, totalAmount }
 * @returns {Promise<Object>} Bill generation result containing whatsappShareLink, pdfBase64, date, shopName, etc.
 */
export async function generateBillApi(billPayload) {
  const apiKey = localStorage.getItem('voice_udhar_api_key') || '';
  const shopId = localStorage.getItem('voice_udhar_shop_id') || '';

  const response = await fetch(`${API_BASE_URL}/api/bill/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'x-shop-id': shopId,
    },
    body: JSON.stringify({ ...billPayload, shopId }),
  });

  return await handleApiResponse(response, 'બિલ બનાવવામાં ભૂલ આવી / Failed to generate bill');
}
