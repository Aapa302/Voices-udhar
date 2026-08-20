const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const { db } = require('../config/firebase');

/**
 * Helper to generate PDF document buffer
 */
const generatePdfBuffer = (billData) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50 });
      const buffers = [];

      doc.on('data', (chunk) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', (err) => reject(err));

      // Header - Shop Name
      doc.fontSize(20).text(billData.shopName, { align: 'center', underline: true });
      doc.moveDown(0.5);
      doc.fontSize(12).text(`Bill / Receipt`, { align: 'center' });
      doc.fontSize(10).text(`Date: ${billData.date}`, { align: 'center' });
      doc.moveDown(1.5);

      // Customer Info
      doc.fontSize(12).text(`Customer Name: ${billData.customerName}`);
      if (billData.customerPhone) {
        doc.fontSize(10).text(`Phone: ${billData.customerPhone}`);
      }
      doc.moveDown(1);

      // Line items table
      doc.fontSize(12).text('Items / Details:', { underline: true });
      doc.moveDown(0.5);

      if (Array.isArray(billData.items) && billData.items.length > 0) {
        billData.items.forEach((item, index) => {
          const itemText = typeof item === 'object' ? `${item.name || item.item} - ₹${item.price || item.amount || ''}` : `${index + 1}. ${item}`;
          doc.fontSize(11).text(itemText);
        });
      } else {
        doc.fontSize(11).text('No items specified');
      }

      doc.moveDown(1.5);
      doc.fontSize(14).text(`Total Amount: ₹${billData.totalAmount}`, { bold: true });
      doc.moveDown(2);

      // Footer
      doc.fontSize(10).text('Thank you for your business!', { align: 'center', italic: true });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
};

/**
 * POST /api/bill/generate
 * Accepts: shopkeeperId, customerId (or customerName + customerPhone), items array, totalAmount (or amount)
 */
const generateBill = async (req, res) => {
  try {
    const {
      shopkeeperId,
      customerId,
      customerName: inputCustomerName,
      customerPhone: inputCustomerPhone,
      items = [],
      totalAmount: inputTotalAmount,
      amount,
    } = req.body;

    const totalAmount = inputTotalAmount !== undefined ? inputTotalAmount : amount;

    if (totalAmount === undefined || totalAmount === null) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'totalAmount (or amount) is required',
      });
    }

    let shopName = 'Voice Udhar Shop';
    let customerName = inputCustomerName || 'Valued Customer';
    let customerPhone = inputCustomerPhone || '';
    let upiId = '';

    // Fetch shopkeeper details from Firestore if shopkeeperId provided
    if (shopkeeperId) {
      const shopDoc = await db.collection('shopkeepers').doc(shopkeeperId).get();
      if (shopDoc.exists) {
        const shopData = shopDoc.data();
        shopName = shopData.shopName || shopName;
        upiId = shopData.upiId || upiId;
      }
    }

    // Generate UPI QR Code image if shopkeeper has set a UPI ID
    let upiQrCodeBase64 = null;
    let upiUri = null;

    if (upiId && upiId.trim()) {
      upiUri = `upi://pay?pa=${encodeURIComponent(upiId.trim())}&pn=${encodeURIComponent(shopName.trim())}&am=${encodeURIComponent(totalAmount)}&cu=INR`;
      try {
        upiQrCodeBase64 = await QRCode.toDataURL(upiUri, {
          errorCorrectionLevel: 'M',
          margin: 2,
          width: 250,
        });
      } catch (qrErr) {
        console.warn('Warning: Failed to generate UPI QR code:', qrErr.message);
      }
    }

    // Fetch customer details from Firestore if customerId provided and name/phone not explicitly given
    if (customerId && (!inputCustomerName || !inputCustomerPhone)) {
      const custDoc = await db.collection('customers').doc(customerId).get();
      if (custDoc.exists) {
        const custData = custDoc.data();
        customerName = inputCustomerName || custData.name || customerName;
        customerPhone = inputCustomerPhone || custData.phone || customerPhone;
      }
    }

    const billDate = new Date().toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });

    const billData = {
      shopName,
      customerName,
      customerPhone,
      items,
      totalAmount,
      date: billDate,
    };

    const pdfBuffer = await generatePdfBuffer(billData);

    // Build WhatsApp share link
    const cleanPhone = customerPhone.replace(/\D/g, '');
    const phoneWithCountry = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;

    const itemsSummary = Array.isArray(items) && items.length > 0
      ? items.map(i => typeof i === 'object' ? `${i.name || i.item} (₹${i.price || i.amount || ''})` : i).join(', ')
      : 'Billing Items';

    const whatsappText = `Hello ${customerName},\nHere is your bill from ${shopName}:\nItems: ${itemsSummary}\nTotal Amount: ₹${totalAmount}\nDate: ${billDate}\nThank you!`;
    const encodedText = encodeURIComponent(whatsappText);

    const whatsappShareLink = phoneWithCountry
      ? `https://wa.me/${phoneWithCountry}?text=${encodedText}`
      : `https://wa.me/?text=${encodedText}`;

    // If client requested direct PDF download
    if (req.query.download === 'true' || req.headers.accept === 'application/pdf') {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="bill_${Date.now()}.pdf"`);
      return res.send(pdfBuffer);
    }

    // Default JSON response containing PDF base64 and WhatsApp share link
    return res.status(200).json({
      message: 'Bill generated successfully',
      shopName,
      customerName,
      totalAmount,
      date: billDate,
      upiId: upiId || null,
      upiQrCodeBase64: upiQrCodeBase64 || null,
      whatsappShareLink,
      pdfBase64: pdfBuffer.toString('base64'),
    });
  } catch (error) {
    console.error('Error generating bill:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: error.message,
    });
  }
};

module.exports = {
  generateBill,
};
