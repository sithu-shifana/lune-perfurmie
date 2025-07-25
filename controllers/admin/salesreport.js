const Order = require('../../models/orderSchema');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');

exports.generateSalesReport = async (req, res) => {
  try {
    const { startDate, endDate, timePeriod, page = 1, query = '' } = req.query;

    let queryObj = {
      paymentStatus: 'Completed' 
    };
    
    const now = new Date();
    now.setHours(23, 59, 59, 999);

    if (timePeriod === 'daily') {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      queryObj.orderDate = { $gte: start, $lte: now };
    } else if (timePeriod === 'weekly') {
      const start = new Date(now);
      start.setDate(now.getDate() - 7);
      start.setHours(0, 0, 0, 0);
      queryObj.orderDate = { $gte: start, $lte: now };
    } else if (timePeriod === 'monthly') {
      const start = new Date(now);
      start.setMonth(now.getMonth() - 1);
      start.setHours(0, 0, 0, 0);
      queryObj.orderDate = { $gte: start, $lte: now };
    } else if (timePeriod === 'yearly') {
      const start = new Date(now);
      start.setFullYear(now.getFullYear() - 1);
      start.setHours(0, 0, 0, 0);
      queryObj.orderDate = { $gte: start, $lte: now };
    } else if (startDate && endDate) {
      queryObj.orderDate = {
        $gte: new Date(startDate),
        $lte: new Date(new Date(endDate).setHours(23, 59, 59, 999)),
      };
    }

    if (query) {
      queryObj.$and = [
        { paymentStatus: 'Completed' }, 
        {
          $or: [
            { _id: { $regex: query.slice(-6), $options: 'i' } }, 
            { 'userId.name': { $regex: query, $options: 'i' } },
          ]
        }
      ];
      delete queryObj.paymentStatus;
    }

    const limit = 10; 
    const currentPage = parseInt(page, 10) || 1;
    const skip = (currentPage - 1) * limit;

    const totalOrdersCount = await Order.countDocuments(queryObj);

    const orders = await Order.find(queryObj)
      .populate('userId items.productId')
      .sort({ orderDate: -1 })
      .skip(skip)
      .limit(limit);

    const allCompletedOrders = await Order.find(
      query ? queryObj : { ...queryObj, paymentStatus: 'Completed' }
    );

    const totalOrders = totalOrdersCount;
    const totalOrderAmount = allCompletedOrders.reduce((sum, order) => sum + (order.finalTotal || 0), 0);
    const totalDiscount = allCompletedOrders.reduce((sum, order) => 
      sum + (order.totalSavings || 0) + (order.couponDiscount || 0), 0
    );
    const netSales = totalOrderAmount-totalDiscount;

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
      currentPage,
      totalPages: Math.ceil(totalOrdersCount / limit),
      query: query || '',
    });
  } catch (error) {
    console.error('Error generating sales report:', error);
    res.status(500).send('Internal Server Error');
  }
};


exports.downloadPDFReport = async (req, res) => {
  try {
    const { startDate, endDate, timePeriod } = req.query;

    let query = {};
    query.paymentStatus= 'Completed' 

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

    const orders = await Order.find(query)
      .populate('userId items.productId')
      .sort({ orderDate: -1 });

    const doc = new PDFDocument({ 
      margin: 30,
      size: 'A4',
      layout: 'landscape'
    });
    
    res.setHeader('Content-disposition', `attachment; filename=sales_report_${new Date().toISOString().split('T')[0]}.pdf`);
    res.setHeader('Content-type', 'application/pdf');
    doc.pipe(res);

    let fontLoaded = false;
    try {
      doc.registerFont('NotoSans', 'C:/Users/sithu/OneDrive/Desktop/Lune Perfumie/fonts/NotoSans-Regular.ttf');
      fontLoaded = true;
    } catch (e) {
      console.warn('NotoSans font not found, falling back to default font.');
    }

    const fontName = fontLoaded ? 'NotoSans' : 'Helvetica';

    doc.font(fontName).fontSize(24).fillColor('#1A3C5E').text('Sales Report', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(12).fillColor('#666666').text(
      `Generated on: ${now.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}`,
      { align: 'center' }
    );
    doc.text(
      `Period: ${startDate && endDate ? `${startDate} to ${endDate}` : timePeriod}`,
      { align: 'center' }
    );
    doc.moveDown(2);

    const tableTop = doc.y;
    const tableX = 30;
    const pageWidth = 842 - 60;
    const colWidths = [60, 70, 80, 250, 80, 80, 80]; 
    const headers = ['Order ID', 'Date', 'Customer', 'Items', 'Subtotal', 'Savings', 'Final Total'];
    const rowHeight = 35;
    const headerHeight = 30;

    doc.rect(tableX, tableTop, pageWidth, headerHeight).fill('#1A3C5E');
    
    doc.font(fontName).fontSize(10).fillColor('#FFFFFF');
    let currentX = tableX;
    headers.forEach((header, i) => {
      const isNumericColumn = i >= 4;
      doc.text(header, currentX + 8, tableTop + 10, {
        width: colWidths[i] - 16,
        align: isNumericColumn ? 'right' : 'left'
      });
      currentX += colWidths[i];
    });

    let totalOrderAmount = 0;
    let totalDiscount = 0;
    let yPos = tableTop + headerHeight;

    orders.forEach((order, index) => {
      const summaryHeight = 150; 
      if (yPos + rowHeight + summaryHeight > doc.page.height - 50) {
        doc.addPage({ layout: 'landscape' });
        yPos = 50;
        
        doc.rect(tableX, yPos, pageWidth, headerHeight).fill('#1A3C5E');
        doc.font(fontName).fontSize(10).fillColor('#FFFFFF');
        let headerX = tableX;
        headers.forEach((header, i) => {
          const isNumericColumn = i >= 4;
          doc.text(header, headerX + 8, yPos + 10, {
            width: colWidths[i] - 16,
            align: isNumericColumn ? 'right' : 'left'
          });
          headerX += colWidths[i];
        });
        yPos += headerHeight;
      }

      totalOrderAmount += order.finalTotal || 0;
      totalDiscount += (order.totalSavings || 0) + (order.couponDiscount || 0);

      const rowColor = index % 2 === 0 ? '#F8F9FA' : '#FFFFFF';
      
      doc.rect(tableX, yPos, pageWidth, rowHeight).fill(rowColor);
      
      const itemsText = order.items.map(item => 
        `${item.productId?.productName || 'Unknown'} (${item.variantSize}, Qty: ${item.quantity})`
      ).join(', ');

      const rowData = [
        order._id.toString().slice(-6),
        order.orderDate.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }),
        order.userId?.name || 'Unknown',
        itemsText,
        `₹${order.subtotal?.toFixed(2) || '0.00'}`,
        `₹${((order.totalSavings || 0) + (order.couponDiscount || 0)).toFixed(2)}`,
        `₹${order.finalTotal?.toFixed(2) || '0.00'}`
      ];

      doc.fillColor('#333333').font(fontName).fontSize(9);
      let cellX = tableX;
      
      rowData.forEach((data, i) => {
        const isNumericColumn = i >= 4;
        const isItemsColumn = i === 3;
        
        doc.text(data, cellX + 8, yPos + 8, {
          width: colWidths[i] - 16,
          height: rowHeight - 16,
          align: isNumericColumn ? 'right' : 'left',
          valign: 'top',
          lineBreak: isItemsColumn,
          ellipsis: !isItemsColumn
        });
        cellX += colWidths[i];
      });

      yPos += rowHeight;
    });

    doc.lineWidth(0.5).strokeColor('#DDDDDD');
    
    let borderX = tableX;
    for (let i = 0; i <= headers.length; i++) {
      const startY = tableTop;
      const endY = tableTop + headerHeight + (orders.length * rowHeight);
      doc.moveTo(borderX, startY).lineTo(borderX, endY).stroke();
      if (i < headers.length) borderX += colWidths[i];
    }
    
    for (let i = 0; i <= orders.length + 1; i++) {
      const lineY = tableTop + (i === 0 ? 0 : headerHeight + ((i-1) * rowHeight));
      doc.moveTo(tableX, lineY).lineTo(tableX + pageWidth, lineY).stroke();
    }

    const summaryStartY = yPos + 20;
    const summaryBoxWidth = 300;
    const summaryBoxHeight = 120;
    
    doc.rect(tableX, summaryStartY, summaryBoxWidth, summaryBoxHeight)
       .fillAndStroke('#F8F9FA', '#DDDDDD');

    doc.font(fontName).fontSize(14).fillColor('#1A3C5E');
    doc.text('Sales Summary', tableX + 20, summaryStartY + 15);
    
    doc.font(fontName).fontSize(11).fillColor('#333333');
    const summaryData = [
      { label: 'Total Orders:', value: orders.length.toString() },
      { label: 'Total Order Amount:', value: `₹${totalOrderAmount.toFixed(2)}` },
      { label: 'Total Discount:', value: `₹${totalDiscount.toFixed(2)}` },
      { label: 'Net Sales:', value: `₹${(totalOrderAmount - totalDiscount).toFixed(2)}` }
    ];

    summaryData.forEach((item, index) => {
      const lineY = summaryStartY + 40 + (index * 18);
      doc.text(item.label, tableX + 20, lineY);
      doc.text(item.value, tableX + 180, lineY, { align: 'right', width: 100 });
    });

    doc.end();
  } catch (error) {
    console.error('Error downloading PDF report:', error);
    res.status(500).send('Failed to generate PDF report. Please try again.');
  }
};


exports.downloadExcelReport = async (req, res) => {
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

    const orders = await Order.find(query)
      .populate('userId items.productId')
      .sort({ orderDate: -1 });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Sales Report');

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

    worksheet.addRow({});
    worksheet.addRow({
      _id: 'Totals',
      subtotal: totalOrderAmount.toFixed(2),
      totalSavings: totalDiscount.toFixed(2),
      finalTotal: (totalOrderAmount - totalDiscount).toFixed(2),
    });

    res.setHeader('Content-disposition', `attachment; filename=sales_report_${new Date().toISOString().split('T')[0]}.xlsx`);
    res.setHeader('Content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Error downloading Excel report:', error);
    res.status(500).send('Failed to generate Excel report. Please try again.');
  }
};