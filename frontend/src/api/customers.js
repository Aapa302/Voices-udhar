const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

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

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || 'ગ્રાહકો લાવવામાં નિષ્ફળ / Failed to fetch customers');
  }

  return data.data || [];
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

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || 'ગ્રાહક ઉમેરવામાં ભૂલ આવી / Failed to save customer');
  }

  return data.data;
}
