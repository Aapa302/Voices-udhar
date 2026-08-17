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
 * Get all customers for the shopkeeper.
 * @param {string} shopkeeperId
 * @returns {Promise<Array>} List of customers
 */
export async function getCustomers(shopkeeperId) {
  const apiKey = localStorage.getItem('voice_udhar_api_key') || '';

  const response = await fetch(`${API_BASE_URL}/api/customers/${shopkeeperId}`, {
    method: 'GET',
    headers: {
      'x-api-key': apiKey,
    },
  });

  const data = await handleApiResponse(response, 'ગ્રાહકો લાવવામાં નિષ્ફળ / Failed to fetch customers');
  return data.data || [];
}

/**
 * Get single customer details by customerId.
 * @param {string} customerId
 * @returns {Promise<Object>} Single customer details
 */
export async function getCustomerDetail(customerId) {
  const apiKey = localStorage.getItem('voice_udhar_api_key') || '';

  const response = await fetch(`${API_BASE_URL}/api/customers/detail/${customerId}`, {
    method: 'GET',
    headers: {
      'x-api-key': apiKey,
    },
  });

  const data = await handleApiResponse(response, 'ગ્રાહકની વિગતો મેળવવામાં નિષ્ફળ / Failed to fetch customer details');
  return data.data || data;
}

/**
 * Add or update a customer.
 * @param {Object} customerData - { shopkeeperId, name, phone, customerId? }
 * @returns {Promise<Object>} Created or updated customer
 */
export async function createCustomer(customerData) {
  const apiKey = localStorage.getItem('voice_udhar_api_key') || '';

  const response = await fetch(`${API_BASE_URL}/api/customers`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify(customerData),
  });

  const data = await handleApiResponse(response, 'ગ્રાહક ઉમેરવામાં ભૂલ આવી / Failed to save customer');
  return data.data;
}
