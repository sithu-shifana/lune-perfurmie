const Order = require('../../models/orderSchema');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');

exports.generateSalesReport = async (req, res) => {
  try {
    const { startDate, endDate, timePeriod, page = 1, query = '' } = req.query;

    // Base query - only successful orders
    let queryObj = {
      deliveryStatus: { $nin: ['Cancelled', 'Failed'] }
    };
    
    const now = new Date();
    now.setHours(23, 59, 59, 999);

    // Date filtering
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

    // Search functionality
    if (query) {
      queryObj.$and = [
        { 
          deliveryStatus: { $nin: ['Cancelled', 'Failed'] }
        },
        {
          $or: [
            { _id: { $regex: query.slice(-6), $options: 'i' } }, 
            { 'userId.name': { $regex: query, $options: 'i' } },
          ]
        }
      ];
      delete queryObj.status;
      delete queryObj.deliveryStatus;
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

    // Calculate aggregated data
    const aggregateData = await Order.aggregate([
      { $match: queryObj },
      {
        $addFields: {
          // Calculate actual revenue after returns
          actualRevenue: {
            $subtract: [
              '$finalTotal',
              {
                $sum: {
                  $map: {
                    input: '$items',
                    as: 'item',
                    in: {
                      $cond: [
                        { $eq: ['$$item.status', 'Returned'] },
                        '$$item.finalItemTotal',
                        0
                      ]
                    }
                  }
                }
              }
            ]
          },
          returnAmount: {
            $sum: {
              $map: {
                input: '$items',
                as: 'item',
                in: {
                  $cond: [
                    { $eq: ['$$item.status', 'Returned'] },
                    '$$item.finalItemTotal',
                    0
                  ]
                }
              }
            }
          }
        }
      },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          grossRevenue: { $sum: '$finalTotal' },
          actualRevenue: { $sum: '$actualRevenue' },
          totalDiscount: { $sum: '$totalCouponDiscount' },
          returnAmount: { $sum: '$returnAmount' },
          avgOrderValue: { $avg: '$actualRevenue' }
        }
      }
    ]);

    const summary = aggregateData[0] || {
      totalOrders: 0,
      grossRevenue: 0,
      actualRevenue: 0,
      totalDiscount: 0,
      returnAmount: 0,
      avgOrderValue: 0
    };

    res.render('admin/salesReport', {
      orders,
      totalOrders: summary.totalOrders,
      grossRevenue: summary.grossRevenue,
      actualRevenue: summary.actualRevenue,
      totalDiscount: summary.totalDiscount,
      returnAmount: summary.returnAmount,
      avgOrderValue: summary.avgOrderValue,
      netSales: summary.actualRevenue,
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

    let query = {
      deliveryStatus: { $nin: ['Cancelled', 'Failed'] }
    };

    const now = new Date();
    now.setHours(23, 59, 59, 999);

    // Date filtering (same logic as above)
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

    // Use default font to avoid font loading issues
    const fontName = 'Helvetica';

    // Header
    doc.font('Helvetica-Bold').fontSize(24).fillColor('#2C3E50').text('Sales Report', { align: 'center' });
    doc.moveDown(0.5);
    doc.font(fontName).fontSize(12).fillColor('#7F8C8D').text(
      `Generated on: ${now.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}`,
      { align: 'center' }
    );
    doc.text(
      `Period: ${startDate && endDate ? `${startDate} to ${endDate}` : timePeriod}`,
      { align: 'center' }
    );
    doc.moveDown(2);

    // Table setup
    const tableTop = doc.y;
    const tableX = 30;
    const pageWidth = 842 - 60;
    const colWidths = [80, 80, 100, 200, 90, 90, 100]; 
    const headers = ['Order ID', 'Date', 'Customer', 'Items', 'Amount', 'Returns', 'Net Total'];
    const rowHeight = 40;
    const headerHeight = 35;

    // Header row
    doc.rect(tableX, tableTop, pageWidth, headerHeight).fill('#34495E');
    
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#FFFFFF');
    let currentX = tableX;
    headers.forEach((header, i) => {
      const isNumericColumn = i >= 4;
      doc.text(header, currentX + 8, tableTop + 12, {
        width: colWidths[i] - 16,
        align: isNumericColumn ? 'right' : 'left'
      });
      currentX += colWidths[i];
    });

    let totalGrossAmount = 0;
    let totalReturnAmount = 0;
    let totalNetAmount = 0;
    let yPos = tableTop + headerHeight;

    orders.forEach((order, index) => {
      // Check for page break
      const summaryHeight = 200;
      if (yPos + rowHeight + summaryHeight > doc.page.height - 50) {
        doc.addPage({ layout: 'landscape' });
        yPos = 50;
        
        // Redraw header on new page
        doc.rect(tableX, yPos, pageWidth, headerHeight).fill('#34495E');
        doc.font('Helvetica-Bold').fontSize(11).fillColor('#FFFFFF');
        let headerX = tableX;
        headers.forEach((header, i) => {
          const isNumericColumn = i >= 4;
          doc.text(header, headerX + 8, yPos + 12, {
            width: colWidths[i] - 16,
            align: isNumericColumn ? 'right' : 'left'
          });
          headerX += colWidths[i];
        });
        yPos += headerHeight;
      }

      // Calculate return amount for this order
      const returnAmount = order.items.reduce((sum, item) => {
        return sum + (item.status === 'Returned' ? item.finalItemTotal : 0);
      }, 0);

      const netAmount = order.finalTotal - returnAmount;

      totalGrossAmount += order.finalTotal;
      totalReturnAmount += returnAmount;
      totalNetAmount += netAmount;

      // Alternating row colors
      const rowColor = index % 2 === 0 ? '#ECF0F1' : '#FFFFFF';
      doc.rect(tableX, yPos, pageWidth, rowHeight).fill(rowColor);
      
      // Prepare row data
      const itemsText = order.items
        .filter(item => item.status !== 'Returned')
        .map(item => 
          `${item.productId?.productName || 'Unknown'} (${item.variantSize}, ${item.quantity})`
        ).join(', ');

      const rowData = [
        order._id.toString().slice(-6),
        order.orderDate.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }),
        order.userId?.name || 'Unknown',
        itemsText || 'All items returned',
        `₹${order.finalTotal?.toFixed(2) || '0.00'}`,
        returnAmount > 0 ? `₹${returnAmount.toFixed(2)}` : '-',
        `₹${netAmount.toFixed(2)}`
      ];

      // Draw row data
      doc.fillColor('#2C3E50').font(fontName).fontSize(10);
      let cellX = tableX;
      
      rowData.forEach((data, i) => {
        const isNumericColumn = i >= 4;
        const isItemsColumn = i === 3;
        
        doc.text(data, cellX + 8, yPos + 12, {
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

    // Draw table borders
    doc.lineWidth(1).strokeColor('#BDC3C7');
    
    // Vertical lines
    let borderX = tableX;
    for (let i = 0; i <= headers.length; i++) {
      const startY = tableTop;
      const endY = tableTop + headerHeight + (orders.length * rowHeight);
      doc.moveTo(borderX, startY).lineTo(borderX, endY).stroke();
      if (i < headers.length) borderX += colWidths[i];
    }
    
    // Horizontal lines
    for (let i = 0; i <= orders.length + 1; i++) {
      const lineY = tableTop + (i === 0 ? 0 : headerHeight + ((i-1) * rowHeight));
      doc.moveTo(tableX, lineY).lineTo(tableX + pageWidth, lineY).stroke();
    }

    // Summary section
    const summaryStartY = yPos + 30;
    const summaryBoxWidth = 350;
    const summaryBoxHeight = 140;
    
    doc.rect(tableX, summaryStartY, summaryBoxWidth, summaryBoxHeight)
       .fillAndStroke('#F8F9FA', '#BDC3C7');

    doc.font('Helvetica-Bold').fontSize(16).fillColor('#2C3E50');
    doc.text('Sales Summary', tableX + 20, summaryStartY + 20);
    
    doc.font(fontName).fontSize(12).fillColor('#34495E');
    const summaryData = [
      { label: 'Total Orders:', value: orders.length.toString() },
      { label: 'Gross Revenue:', value: `₹${totalGrossAmount.toFixed(2)}` },
      { label: 'Returns Amount:', value: `₹${totalReturnAmount.toFixed(2)}` },
      { label: 'Net Sales:', value: `₹${totalNetAmount.toFixed(2)}` },
      { label: 'Average Order Value:', value: `₹${orders.length > 0 ? (totalNetAmount / orders.length).toFixed(2) : '0.00'}` }
    ];

    summaryData.forEach((item, index) => {
      const lineY = summaryStartY + 50 + (index * 18);
      doc.text(item.label, tableX + 20, lineY);
      doc.font('Helvetica-Bold').text(item.value, tableX + 200, lineY, { align: 'right', width: 120 });
      doc.font(fontName);
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

    let query = {
      deliveryStatus: { $nin: ['Cancelled', 'Failed'] }
    };
    
    const now = new Date();
    now.setHours(23, 59, 59, 999);

    // Date filtering (same logic as above)
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

    // Define columns with better headers
    worksheet.columns = [
      { header: 'Order ID', key: '_id', width: 20 },
      { header: 'Date', key: 'orderDate', width: 15 },
      { header: 'Customer', key: 'customerName', width: 25 },
      { header: 'Items', key: 'items', width: 40 },
      { header: 'Order Status', key: 'orderStatus', width: 15 },
      { header: 'Delivery Status', key: 'deliveryStatus', width: 18 },
      { header: 'Gross Amount', key: 'grossAmount', width: 15 },
      { header: 'Coupon Discount', key: 'couponDiscount', width: 18 },
      { header: 'Return Amount', key: 'returnAmount', width: 15 },
      { header: 'Net Amount', key: 'netAmount', width: 15 },
    ];

    // Style the header row
    const headerRow = worksheet.getRow(1);
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '34495E' } };
      cell.alignment = { horizontal: 'center' };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
    });

    let totalGrossAmount = 0;
    let totalCouponDiscount = 0;
    let totalReturnAmount = 0;
    let totalNetAmount = 0;

    orders.forEach((order, index) => {
      // Calculate return amount for this order
      const returnAmount = order.items.reduce((sum, item) => {
        return sum + (item.status === 'Returned' ? item.finalItemTotal : 0);
      }, 0);

      const netAmount = order.finalTotal - returnAmount;

      totalGrossAmount += order.finalTotal;
      totalCouponDiscount += order.totalCouponDiscount || 0;
      totalReturnAmount += returnAmount;
      totalNetAmount += netAmount;

      const row = worksheet.addRow({
        _id: order._id.toString().slice(-6),
        orderDate: order.orderDate.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }),
        customerName: order.userId?.name || 'Unknown',
        items: order.items
          .filter(item => item.status !== 'Returned')
          .map((item) => `${item.productId?.productName || 'Unknown'} (${item.variantSize}, Qty: ${item.quantity})`)
          .join('; '),
        orderStatus: order.status,
        deliveryStatus: order.deliveryStatus,
        grossAmount: order.finalTotal?.toFixed(2) || '0.00',
        couponDiscount: (order.totalCouponDiscount || 0).toFixed(2),
        returnAmount: returnAmount.toFixed(2),
        netAmount: netAmount.toFixed(2),
      });

      // Alternate row colors
      if (index % 2 === 1) {
        row.eachCell((cell) => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F8F9FA' } };
        });
      }

      // Add borders to all cells
      row.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      });
    });

    // Add summary rows
    worksheet.addRow({});
    
    const summaryHeaderRow = worksheet.addRow({
      _id: 'SUMMARY',
      customerName: 'Total Orders: ' + orders.length
    });
    summaryHeaderRow.getCell('_id').font = { bold: true, size: 14 };
    summaryHeaderRow.getCell('customerName').font = { bold: true, size: 12 };

    const summaryRow = worksheet.addRow({
      _id: 'Totals',
      grossAmount: totalGrossAmount.toFixed(2),
      couponDiscount: totalCouponDiscount.toFixed(2),
      returnAmount: totalReturnAmount.toFixed(2),
      netAmount: totalNetAmount.toFixed(2),
    });

    summaryRow.eachCell((cell) => {
      cell.font = { bold: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'D5DBDB' } };
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