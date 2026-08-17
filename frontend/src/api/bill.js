const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

/**
 * Generate PDF bill and WhatsApp share link.
 * @param {Object} billPayload - { shopkeeperId, customerId?, customerName?, customerPhone?, items?, totalAmount }
 * @returns {Promise<Object>} Bill generation result containing whatsappShareLink, pdfBase64, date, shopName, etc.
 */
export async function generateBillApi(billPayload) {
  const apiKey = localStorage.getItem('voice_udhar_api_key') || '';

  const response = await fetch(`${API_BASE_URL}/api/bill/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify(billPayload),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || 'બિલ બનાવવામાં ભૂલ આવી / Failed to generate bill');
  }

  return data;
}
