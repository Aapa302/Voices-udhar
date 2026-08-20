const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const { db } = require('../config/firebase');
const { getEffectiveShopId, isDocInShop } = require('../utils/shopHelper');

/**
 * Generate Excel workbook buffer using exceljs
 */
async function generateExcelBuffer(shopName, customers, transactions) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Voice Udhar';
  workbook.created = new Date();

  // 1. Customers Sheet
  const custSheet = workbook.addWorksheet('Customers');
  custSheet.columns = [
    { header: 'Customer Name', key: 'name', width: 25 },
    { header: 'Phone Number', key: 'phone', width: 18 },
    { header: 'Total Pending Udhaar (₹)', key: 'totalUdhaar', width: 25 },
  ];

  // Format header row
  const custHeader = custSheet.getRow(1);
  custHeader.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  custHeader.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF7C3AED' },
  };

  customers.forEach((cust) => {
    custSheet.addRow({
      name: cust.name || 'Unknown',
      phone: cust.phone || 'N/A',
      totalUdhaar: Number(cust.totalUdhaar) || 0,
    });
  });

  // 2. Transactions Sheet
  const txSheet = workbook.addWorksheet('Transactions');
  txSheet.columns = [
    { header: 'Date & Time (IST)', key: 'date', width: 22 },
    { header: 'Customer Name', key: 'customerName', width: 25 },
    { header: 'Type', key: 'typeLabel', width: 16 },
    { header: 'Amount (₹)', key: 'amount', width: 15 },
    { header: 'Items', key: 'items', width: 30 },
  ];

  const txHeader = txSheet.getRow(1);
  txHeader.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  txHeader.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF7C3AED' },
  };

  const customerMap = new Map();
  customers.forEach((c) => customerMap.set(c.customerId || c.id, c.name));

  // Sort transactions by timestamp descending
  const sortedTx = [...transactions].sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));

  sortedTx.forEach((tx) => {
    const custName = customerMap.get(tx.customerId) || tx.customerName || 'Unknown Customer';
    let typeLabel = 'Udhaar Added';
    if (tx.type === 'udhaar_paid') typeLabel = 'Paid Back';
    else if (tx.type === 'sale') typeLabel = 'Cash Sale';

    let dateStr = 'N/A';
    if (tx.timestamp) {
      const d = new Date(tx.timestamp);
      if (!isNaN(d.getTime())) {
        dateStr = d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
      }
    }

    const itemsStr = Array.isArray(tx.items)
      ? tx.items.map((i) => (typeof i === 'object' ? `${i.name || i.item} (₹${i.price || i.amount || ''})` : i)).join(', ')
      : tx.items || '';

    txSheet.addRow({
      date: dateStr,
      customerName: custName,
      typeLabel,
      amount: Number(tx.amount) || 0,
      items: itemsStr,
    });
  });

  return await workbook.xlsx.writeBuffer();
}

/**
 * Generate PDF report buffer using pdfkit
 */
function generatePdfReportBuffer(shopName, customers, transactions) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 40 });
      const buffers = [];

      doc.on('data', (chunk) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', (err) => reject(err));

      const nowStr = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

      // Title & Header
      doc.fontSize(20).text(shopName || 'Voice Udhar Shop', { align: 'center', underline: true });
      doc.moveDown(0.3);
      doc.fontSize(12).text('Full Business Data Export / વ્યાપારિક ડેટા અહેવાલ', { align: 'center' });
      doc.fontSize(9).text(`Export Date: ${nowStr}`, { align: 'center' });
      doc.moveDown(1.5);

      // Customers Section
      doc.fontSize(14).text(`1. Customer Directory (${customers.length} Customers)`, { underline: true });
      doc.moveDown(0.5);

      if (customers.length === 0) {
        doc.fontSize(10).text('No customer records found.');
      } else {
        customers.forEach((cust, index) => {
          const name = cust.name || 'Unknown';
          const phone = cust.phone && cust.phone !== '0000000000' ? cust.phone : 'No Phone';
          const balance = Number(cust.totalUdhaar) || 0;
          doc.fontSize(10).text(`${index + 1}. ${name} | Phone: ${phone} | Udhaar Balance: ₹${balance}`);
        });
      }

      doc.moveDown(1.5);

      // Transactions Section
      doc.fontSize(14).text(`2. Transaction History Log (${transactions.length} Records)`, { underline: true });
      doc.moveDown(0.5);

      const customerMap = new Map();
      customers.forEach((c) => customerMap.set(c.customerId || c.id, c.name));

      const sortedTx = [...transactions].sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));

      if (sortedTx.length === 0) {
        doc.fontSize(10).text('No transaction history records found.');
      } else {
        sortedTx.forEach((tx, index) => {
          const custName = customerMap.get(tx.customerId) || tx.customerName || 'Unknown';
          let dateStr = 'N/A';
          if (tx.timestamp) {
            const d = new Date(tx.timestamp);
            if (!isNaN(d.getTime())) {
              dateStr = d.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' });
            }
          }
          let typeLabel = 'Udhaar Add';
          if (tx.type === 'udhaar_paid') typeLabel = 'Udhaar Paid';
          else if (tx.type === 'sale') typeLabel = 'Cash Sale';

          const amt = Number(tx.amount) || 0;
          const itemsStr = Array.isArray(tx.items) && tx.items.length > 0 ? ` [${tx.items.join(', ')}]` : '';

          doc.fontSize(9.5).text(`${index + 1}. [${dateStr}] ${custName} - ${typeLabel}: ₹${amt}${itemsStr}`);
        });
      }

      doc.moveDown(2);
      doc.fontSize(9).text('Generated by Voice Udhar App', { align: 'center', italic: true });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * GET /api/export/:shopkeeperId?format=excel|pdf
 * Download full business data for authenticated shopkeeper
 */
const exportData = async (req, res) => {
  try {
    const { shopkeeperId } = req.params;
    const authShopkeeperId = req.shopkeeper && req.shopkeeper.shopkeeperId;

    if (!shopkeeperId) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'shopkeeperId parameter is required',
      });
    }

    if (shopkeeperId !== authShopkeeperId) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'shopkeeperId parameter does not match authenticated shopkeeper',
      });
    }

    const format = (req.query.format || 'excel').toLowerCase();

    if (format !== 'excel' && format !== 'pdf') {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'format query parameter must be "excel" or "pdf"',
      });
    }

    const effectiveShopId = getEffectiveShopId(req);

    // Fetch shop details
    let shopName = 'Voice Udhar Shop';
    const shopDoc = await db.collection('shops').doc(effectiveShopId || `shop_${authShopkeeperId}`).get();
    if (shopDoc.exists) {
      shopName = shopDoc.data().shopName || shopName;
    } else {
      const skDoc = await db.collection('shopkeepers').doc(authShopkeeperId).get();
      if (skDoc.exists) {
        shopName = skDoc.data().shopName || shopName;
      }
    }

    // Fetch customers
    const custSnapshot = await db
      .collection('customers')
      .where('shopkeeperId', '==', authShopkeeperId)
      .get();

    const customers = [];
    custSnapshot.forEach((doc) => {
      const data = doc.data();
      if (isDocInShop(data, effectiveShopId, authShopkeeperId)) {
        customers.push({ id: doc.id, ...data });
      }
    });

    // Fetch transactions
    const txSnapshot = await db
      .collection('transactions')
      .where('shopkeeperId', '==', authShopkeeperId)
      .get();

    const transactions = [];
    txSnapshot.forEach((doc) => {
      const data = doc.data();
      if (isDocInShop(data, effectiveShopId, authShopkeeperId)) {
        transactions.push({ id: doc.id, ...data });
      }
    });

    if (format === 'excel') {
      const excelBuffer = await generateExcelBuffer(shopName, customers, transactions);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="data_export_${authShopkeeperId}.xlsx"`);
      return res.send(excelBuffer);
    } else {
      const pdfBuffer = await generatePdfReportBuffer(shopName, customers, transactions);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="data_export_${authShopkeeperId}.pdf"`);
      return res.send(pdfBuffer);
    }
  } catch (error) {
    console.error('Error exporting business data:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: error ? error.message || String(error) : 'Failed to export business data',
    });
  }
};

module.exports = {
  exportData,
};
