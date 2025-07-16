const Order = require('../../models/orderSchema');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');

exports.generateSalesReport = async (req, res) => {
  try {
    const { startDate, endDate, timePeriod } = req.query;

    
    let query = {};
    const now = new Date();
    now.setHours(23, 59, 59, 999);

    if (timePeriod === 'daily') {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      query.orderDate = { $gte: start, $lte: now };
    } else if (timePeriod === 'weekly') {
      const start = new Date(now);
      start.setDate(now.getDate() - 7);
      start.setHours(0, 0, 0, 0);
      query.orderDate = { $gte: start, $lte: now };
    } else if (timePeriod === 'monthly') {
      const start = new Date(now);
      start.setMonth(now.getMonth() - 1);
      start.setHours(0, 0, 0, 0);
      query.orderDate = { $gte: start, $lte: now };
    } else if (timePeriod === 'yearly') {
      const start = new Date(now);
      start.setFullYear(now.getFullYear() - 1);
      start.setHours(0, 0, 0, 0);
      query.orderDate = { $gte: start, $lte: now };
    } else if (startDate && endDate) {
      query.orderDate = {
        $gte: new Date(startDate),
        $lte: new Date(new Date(endDate).setHours(23, 59, 59, 999)),
      };
    }

    // Fetch orders with population
    const orders = await Order.find(query)
      .populate('userId items.productId')
      .sort({ orderDate: -1 });

    // Calculate totals
    const totalOrders = orders.length;
    const totalOrderAmount = orders.reduce((sum, order) => sum + order.finalTotal, 0);
    const totalDiscount = orders.reduce((sum, order) => sum + (order.totalSavings || 0) + (order.couponDiscount || 0), 0);
    const netSales = totalOrderAmount - totalDiscount;

    // Render report view with 'now' passed
    res.render('admin/salesReport', {
      orders,
      totalOrders,
      totalOrderAmount,
      totalDiscount,
      netSales,
      startDate: startDate || '',
      endDate: endDate || '',
      timePeriod: timePeriod || 'custom',
      now: now.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }),
    });
  } catch (error) {
    console.error('Error generating sales report:', error);
    res.status(500).send('Internal Server Error');
  }
};

exports.downloadPDFReport = async (req, res) => {
  try {
    const { startDate, endDate, timePeriod } = req.query;

    // Determine date range based on filter
    let query = {};
    const now = new Date();
    now.setHours(23, 59, 59, 999);

    if (timePeriod === 'daily') {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      query.orderDate = { $gte: start, $lte: now };
    } else if (timePeriod === 'weekly') {
      const start = new Date(now);
      start.setDate(now.getDate() - 7);
      start.setHours(0, 0, 0, 0);
      query.orderDate = { $gte: start, $lte: now };
    } else if (timePeriod === 'monthly') {
      const start = new Date(now);
      start.setMonth(now.getMonth() - 1);
      start.setHours(0, 0, 0, 0);
      query.orderDate = { $gte: start, $lte: now };
    } else if (timePeriod === 'yearly') {
      const start = new Date(now);
      start.setFullYear(now.getFullYear() - 1);
      start.setHours(0, 0, 0, 0);
      query.orderDate = { $gte: start, $lte: now };
    } else if (startDate && endDate) {
      query.orderDate = {
        $gte: new Date(startDate),
        $lte: new Date(new Date(endDate).setHours(23, 59, 59, 999)),
      };
    }

    // Fetch orders
    const orders = await Order.find(query)
      .populate('userId items.productId')
      .sort({ orderDate: -1 });

    // Create PDF
    const doc = new PDFDocument();
    res.setHeader('Content-disposition', `attachment; filename=sales_report_${new Date().toISOString().split('T')[0]}.pdf`);
    res.setHeader('Content-type', 'application/pdf');
    doc.pipe(res);

    // PDF content
    doc.fontSize(20).text('Sales Report', { align: 'center' });
    doc.fontSize(12).text(`Generated on: ${now.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}`, { align: 'center' });
    doc.text(`Period: ${startDate && endDate ? `${startDate} to ${endDate}` : timePeriod}`, { align: 'center' });
    doc.moveDown();

    let totalOrderAmount = 0;
    let totalDiscount = 0;

    orders.forEach((order, index) => {
      totalOrderAmount += order.finalTotal;
      totalDiscount += (order.totalSavings || 0) + (order.couponDiscount || 0);

      doc.fontSize(12).text(`Order ${index + 1}`, { underline: true });
      doc.fontSize(10);
      doc.text(`Order ID: ${order._id}`);
      doc.text(`Date: ${order.orderDate.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}`);
      doc.text(`Customer: ${order.userId?.name || 'Unknown'}`);
      doc.text(
        `Items: ${order.items.map((item) => `${item.productId?.productName || 'Unknown'} (Size: ${item.variantSize}, Qty: ${item.quantity})`).join(', ')}`
      );
      doc.text(`Subtotal: ₹${order.subtotal?.toFixed(2) || '0.00'}`);
      doc.text(`Shipping Cost: ₹${order.shippingCost?.toFixed(2) || '0.00'}`);
      doc.text(`Total Savings: ₹${order.totalSavings?.toFixed(2) || '0.00'}`);
      doc.text(`Coupon Discount: ₹${order.couponDiscount?.toFixed(2) || '0.00'}`);
      doc.text(`Final Total: ₹${order.finalTotal?.toFixed(2) || '0.00'}`);
      doc.moveDown();
    });

    doc.text(`Total Orders: ${orders.length}`);
    doc.text(`Total Order Amount: ₹${totalOrderAmount.toFixed(2)}`);
    doc.text(`Total Discount: ₹${totalDiscount.toFixed(2)}`);
    doc.text(`Net Sales: ₹${(totalOrderAmount - totalDiscount).toFixed(2)}`);
    doc.end();
  } catch (error) {
    console.error('Error downloading PDF report:', error);
    res.status(500).send('Failed to generate PDF report. Please try again.');
  }
};

exports.downloadExcelReport = async (req, res) => {
  try {
    const { startDate, endDate, timePeriod } = req.query;

    // Determine date range based on filter
    let query = {};
    const now = new Date();
    now.setHours(23, 59, 59, 999);

    if (timePeriod === 'daily') {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      query.orderDate = { $gte: start, $lte: now };
    } else if (timePeriod === 'weekly') {
      const start = new Date(now);
      start.setDate(now.getDate() - 7);
      start.setHours(0, 0, 0, 0);
      query.orderDate = { $gte: start, $lte: now };
    } else if (timePeriod === 'monthly') {
      const start = new Date(now);
      start.setMonth(now.getMonth() - 1);
      start.setHours(0, 0, 0, 0);
      query.orderDate = { $gte: start, $lte: now };
    } else if (timePeriod === 'yearly') {
      const start = new Date(now);
      start.setFullYear(now.getFullYear() - 1);
      start.setHours(0, 0, 0, 0);
      query.orderDate = { $gte: start, $lte: now };
    } else if (startDate && endDate) {
      query.orderDate = {
        $gte: new Date(startDate),
        $lte: new Date(new Date(endDate).setHours(23, 59, 59, 999)),
      };
    }

    // Fetch orders
    const orders = await Order.find(query)
      .populate('userId items.productId')
      .sort({ orderDate: -1 });

    // Create Excel
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Sales Report');

    // Define columns
    worksheet.columns = [
      { header: 'Order ID', key: '_id', width: 20 },
      { header: 'Date', key: 'orderDate', width: 15 },
      { header: 'Customer', key: 'customerName', width: 20 },
      { header: 'Items', key: 'items', width: 30 },
      { header: 'Subtotal', key: 'subtotal', width: 15 },
      { header: 'Shipping Cost', key: 'shippingCost', width: 15 },
      { header: 'Total Savings', key: 'totalSavings', width: 15 },
      { header: 'Coupon Discount', key: 'couponDiscount', width: 15 },
      { header: 'Final Total', key: 'finalTotal', width: 15 },
    ];

    // Add rows
    let totalOrderAmount = 0;
    let totalDiscount = 0;

    orders.forEach((order) => {
      totalOrderAmount += order.finalTotal;
      totalDiscount += (order.totalSavings || 0) + (order.couponDiscount || 0);

      worksheet.addRow({
        _id: order._id,
        orderDate: order.orderDate.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }),
        customerName: order.userId?.name || 'Unknown',
        items: order.items
          .map((item) => `${item.productId?.productName || 'Unknown'} (Size: ${item.variantSize}, Qty: ${item.quantity})`)
          .join(', '),
        subtotal: order.subtotal?.toFixed(2) || '0.00',
        shippingCost: order.shippingCost?.toFixed(2) || '0.00',
        totalSavings: order.totalSavings?.toFixed(2) || '0.00',
        couponDiscount: order.couponDiscount?.toFixed(2) || '0.00',
        finalTotal: order.finalTotal?.toFixed(2) || '0.00',
      });
    });

    // Add totals
    worksheet.addRow({});
    worksheet.addRow({
      _id: 'Totals',
      subtotal: totalOrderAmount.toFixed(2),
      totalSavings: totalDiscount.toFixed(2),
      finalTotal: (totalOrderAmount - totalDiscount).toFixed(2),
    });

    // Set headers and send file
    res.setHeader('Content-disposition', `attachment; filename=sales_report_${new Date().toISOString().split('T')[0]}.xlsx`);
    res.setHeader('Content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Error downloading Excel report:', error);
    res.status(500).send('Failed to generate Excel report. Please try again.');
  }
};