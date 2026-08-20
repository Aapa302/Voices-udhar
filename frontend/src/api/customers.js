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
  const shopId = localStorage.getItem('voice_udhar_shop_id') || '';

  const response = await fetch(`${API_BASE_URL}/api/customers/${shopkeeperId}`, {
    method: 'GET',
    headers: {
      'x-api-key': apiKey,
      'x-shop-id': shopId,
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
  const shopId = localStorage.getItem('voice_udhar_shop_id') || '';

  const response = await fetch(`${API_BASE_URL}/api/customers/detail/${customerId}`, {
    method: 'GET',
    headers: {
      'x-api-key': apiKey,
      'x-shop-id': shopId,
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
  const shopId = localStorage.getItem('voice_udhar_shop_id') || '';

  const response = await fetch(`${API_BASE_URL}/api/customers`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'x-shop-id': shopId,
    },
    body: JSON.stringify({ ...customerData, shopId }),
  });

  const data = await handleApiResponse(response, 'ગ્રાહક ઉમેરવામાં ભૂલ આવી / Failed to save customer');
  return data.data;
}

/**
 * Get pending udhaar alerts categorized by high amount and long pending duration.
 * @param {string} shopkeeperId
 * @param {number} days - threshold number of days (default 15)
 * @returns {Promise<Object>} { highAmount: [], longPending: [] }
 */
export async function getCustomerAlerts(shopkeeperId, days = 15) {
  const apiKey = localStorage.getItem('voice_udhar_api_key') || '';
  const shopId = localStorage.getItem('voice_udhar_shop_id') || '';

  const response = await fetch(`${API_BASE_URL}/api/customers/alerts/${shopkeeperId}?days=${days}`, {
    method: 'GET',
    headers: {
      'x-api-key': apiKey,
      'x-shop-id': shopId,
    },
  });

  const data = await handleApiResponse(response, 'અલર્ટ્સ મેળવવામાં નિષ્ફળ / Failed to fetch customer alerts');
  return data || { highAmount: [], longPending: [] };
}

/**
 * Get customer smart reminders needing follow-up (default >= 30 days).
 * @param {string} shopkeeperId
 * @param {number} days - threshold number of days (default 30)
 * @returns {Promise<Object>} { remindersNeeded: [] }
 */
export async function getCustomerReminders(shopkeeperId, days = 30) {
  const apiKey = localStorage.getItem('voice_udhar_api_key') || '';
  const shopId = localStorage.getItem('voice_udhar_shop_id') || '';

  const response = await fetch(`${API_BASE_URL}/api/customers/reminders/${shopkeeperId}?days=${days}`, {
    method: 'GET',
    headers: {
      'x-api-key': apiKey,
      'x-shop-id': shopId,
    },
  });

  const data = await handleApiResponse(response, 'રીમાઇન્ડર્સ મેળવવામાં નિષ્ફળ / Failed to fetch customer reminders');
  return data || { remindersNeeded: [] };
}

/**
 * Mark reminder as sent for customer.
 * @param {string} customerId
 * @returns {Promise<Object>}
 */
export async function markReminderSent(customerId) {
  const apiKey = localStorage.getItem('voice_udhar_api_key') || '';
  const shopId = localStorage.getItem('voice_udhar_shop_id') || '';

  const response = await fetch(`${API_BASE_URL}/api/customers/${customerId}/reminder-sent`, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'x-shop-id': shopId,
    },
  });

  return await handleApiResponse(response, 'રીમાઇન્ડર માર્ક કરવામાં નિષ્ફળ / Failed to mark reminder sent');
}

/**
 * Get today's due payment reminders for shopkeeper queue.
 * @param {string} shopkeeperId
 * @returns {Promise<Object>} { remindersToday: [] }
 */
export async function getRemindersToday(shopkeeperId) {
  const apiKey = localStorage.getItem('voice_udhar_api_key') || '';
  const shopId = localStorage.getItem('voice_udhar_shop_id') || '';

  const response = await fetch(`${API_BASE_URL}/api/reminders/today/${shopkeeperId}`, {
    method: 'GET',
    headers: {
      'x-api-key': apiKey,
      'x-shop-id': shopId,
    },
  });

  const data = await handleApiResponse(response, 'આજનાં રીમાઇન્ડર્સ મેળવવામાં નિષ્ફળ / Failed to fetch today reminders');
  return data || { remindersToday: [] };
}

/**
 * Mark batch payment reminders as sent.
 * @param {Array<string>} customerIds
 * @returns {Promise<Object>}
 */
export async function markBatchRemindersSent(customerIds) {
  const apiKey = localStorage.getItem('voice_udhar_api_key') || '';
  const shopId = localStorage.getItem('voice_udhar_shop_id') || '';

  const response = await fetch(`${API_BASE_URL}/api/reminders/batch-sent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'x-shop-id': shopId,
    },
    body: JSON.stringify({ customerIds }),
  });

  return await handleApiResponse(response, 'બેચ રીમાઇન્ડર્સ માર્ક કરવામાં નિષ્ફળ / Failed to mark batch reminders sent');
}
