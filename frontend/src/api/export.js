const API_BASE_URL = import.meta.env.VITE_API_URL || '';

/**
 * Trigger business data export file download for shopkeeper.
 * @param {string} shopkeeperId
 * @param {'excel'|'pdf'} format
 */
export async function downloadDataExportApi(shopkeeperId, format = 'excel') {
  const apiKey = localStorage.getItem('voice_udhar_api_key');
  const shopId = localStorage.getItem('voice_udhar_shop_id') || '';

  const response = await fetch(`${API_BASE_URL}/api/export/${shopkeeperId}?format=${format}`, {
    method: 'GET',
    headers: {
      'x-api-key': apiKey || '',
      'x-shop-id': shopId,
    },
  });

  if (!response.ok) {
    let errorMsg = 'ડેટા ડાઉનલોડ કરવામાં નિષ્ફળ / Export failed';
    try {
      const errData = await response.json();
      if (errData && errData.message) errorMsg = errData.message;
    } catch (e) {}
    throw new Error(errorMsg);
  }

  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const ext = format === 'excel' ? 'xlsx' : 'pdf';
  a.download = `voice_udhar_data_${shopkeeperId}.${ext}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}
