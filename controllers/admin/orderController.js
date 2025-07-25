const mongoose = require('mongoose');
const Order = require('../../models/orderSchema');
const Product = require('../../models/productSchema');
const Wallet = require('../../models/walletSchema');
const PDFDocument = require('pdfkit');
const path = require('path');
const User=require('../../models/userSchema')

exports.getOrderManagement = async (req, res) => {
  try {
    const { search, paymentMethod, paymentStatus, startDate, endDate, page = 1 } = req.query;
    const perPage = 10;

    let query = {};
    
    if (search && search.trim()) {
      const searchTerm = search.trim();
      
      const matchingUsers = await User.find({
        $or: [
          { name: { $regex: searchTerm, $options: 'i' } },
          { email: { $regex: searchTerm, $options: 'i' } }
        ]
      }).select('_id');
      
      const userIds = matchingUsers.map(user => user._id);
      
      const searchQueries = [];
      
      if (userIds.length > 0) {
        searchQueries.push({ userId: { $in: userIds } });
      }
      
      if (mongoose.Types.ObjectId.isValid(searchTerm)) {
        searchQueries.push({ _id: new mongoose.Types.ObjectId(searchTerm) });
      } else if (searchTerm.length >= 3) {
        const allOrders = await Order.find({}).select('_id');
        const matchingOrderIds = allOrders.filter(order => {
          const orderIdStr = order._id.toString().slice(-8).toUpperCase();
          return orderIdStr.includes(searchTerm.toUpperCase());
        }).map(order => order._id);
        
        if (matchingOrderIds.length > 0) {
          searchQueries.push({ _id: { $in: matchingOrderIds } });
        }
      }
      
      if (searchQueries.length > 0) {
        query.$or = searchQueries;
      } else {
        query._id = null;
      }
    }

    if (paymentMethod && ['COD', 'RAZORPAY', 'WALLET'].includes(paymentMethod)) {
      query.paymentMethod = paymentMethod;
    }
    
    if (paymentStatus && ['Pending', 'Completed', 'Failed', 'Cancelled', 'Refunded'].includes(paymentStatus)) {
      query.paymentStatus = paymentStatus;
    }
    
    if (startDate || endDate) {
      query.orderDate = {};
      if (startDate && !isNaN(new Date(startDate))) {
        query.orderDate.$gte = new Date(startDate);
      }
      if (endDate && !isNaN(new Date(endDate))) {
        query.orderDate.$lte = new Date(new Date(endDate).setHours(23, 59, 59, 999));
      }
    }

    const totalOrders = await Order.countDocuments(query);
    const totalPages = Math.ceil(totalOrders / perPage);
    const currentPage = Math.max(1, Math.min(parseInt(page) || 1, totalPages));
    const skip = (currentPage - 1) * perPage;

    const orders = await Order.find(query)
      .populate('userId', 'name email')
      .populate('items.productId', 'productName images')
      .sort({ orderDate: -1 })
      .skip(skip)
      .limit(perPage);

    res.render('admin/order/orderManagement', {
      orders,
      page: currentPage,
      totalPages,
      perPage,
      searchQuery: search || '',
      paymentMethod: paymentMethod || '',
      paymentStatus: paymentStatus || '',
      startDate: startDate || '',
      endDate: endDate || ''
    });
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).render('admin/error', { message: 'Server Error. Please try again later.', status: 500 });
  }
};

exports.getViewOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
   
    const order = await Order.findById(orderId)
      .populate('userId', 'name email')
      .populate({
        path: 'items.productId',
        select: 'productName images',
        options: { strictPopulate: false }
      })
      .populate({
        path: 'addressId',
        options: { strictPopulate: false }
      });

      
    res.render('admin/order/view-order', { order: order.toObject({ virtuals: true }) });
  } catch (error) {
    console.error(` Error loading order ${orderId || 'unknown'}:`, error.message);
    res.status(500).redirect('/admin/orderManagement?error=Server error');
  }
};

exports.updateDeliveryStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { deliveryStatus } = req.body;
    
    const order = await Order.findById(orderId);
   

    const statusOrder = ['Placed', 'Processing', 'Shipped', 'Out for Delivery', 'Delivered'];
    const currentIndex = statusOrder.indexOf(order.deliveryStatus);
    const newIndex = statusOrder.indexOf(deliveryStatus);


    order.deliveryStatus = deliveryStatus;
    if (deliveryStatus === 'Shipped' && !order.trackingInfo?.status) {
      order.trackingInfo = order.trackingInfo || {};
      order.trackingInfo.status = 'Shipped';
    }
    if (deliveryStatus === 'Delivered') {
      order.deliveryDate = new Date();
      if (order.paymentMethod === 'COD') {
        order.paymentStatus = 'Completed';
      }
    }

    await order.save();
    res.json({ success: true, message: 'Delivery status updated successfully', alertType: 'success' });
  } catch (error) {
    console.error(' Error updating delivery status:', error);
    res.json({ success: false, message: 'Server error', alertType: 'error' });
  }
};

exports.cancelOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { reason } = req.body;

    const order = await Order.findById(orderId).populate('items.productId');
    
    

    if (!reason) {
      console.warn('Cancellation reason required');
      return res.json({ success: false, message: 'Cancellation reason is required', alertType: 'error' });
    }

   
    for (const item of order.items) {
      if (item.status === 'Active') {
        try {
         
          const updatedProduct = await Product.findOneAndUpdate(
            { _id: item.productId },
            {
              $inc: { 'variants.$[elem].stock': item.quantity },
            },
            {
              arrayFilters: [{ 'elem.size': item.variantSize }],
              new: true,
            }
          );

            } catch (stockError) {
          console.error(`Error updating stock for item ${item._id}:`, stockError);
        }
      }
    }

    order.deliveryStatus = 'Cancelled';
    order.status = 'Cancelled';
    
    order.items.forEach(item => {
      if (item.status === 'Active') {
        item.status = 'Cancelled';
        item.cancellationReason = reason;
      }
    });

    if (order.paymentStatus === 'Completed' && ['RAZORPAY', 'WALLET'].includes(order.paymentMethod)) {
      const wallet = await Wallet.getOrCreate(order.userId);
      
      const refundAmount = order.items.reduce((sum, item) => {
        if (item.status === 'Cancelled' && !item.isRefunded) {
          return sum + (item.finalItemTotal - (item.couponDiscount * item.quantity));
        }
        return sum;
      }, 0);

      if (refundAmount > 0) {
        await wallet.addMoney(
          parseFloat(refundAmount),
          `Refund for cancelled order #${order._id.toString().slice(-8).toUpperCase()}`,
          order._id
        );
        
        order.refundDetails = {
          amount: refundAmount,
          method: 'wallet',
          processedAt: new Date(),
          transactionId: `REF-CANCEL-${order._id}-${Date.now()}`
        };
        
        order.items.forEach(item => {
          if (item.status === 'Cancelled') {
            item.isRefunded = true;
          }
        });
        
        order.paymentStatus = 'Refunded';
      }
    } else if (order.paymentMethod === 'COD') {
      order.paymentStatus = 'Cancelled';
    }

    const activeItems = order.items.filter(item => item.status === 'Active' || item.status === 'ReturnRequested');
    order.subtotal = activeItems.reduce((sum, item) => sum + item.finalItemTotal, 0);
    order.totalCouponDiscount = activeItems.reduce((sum, item) => sum + (item.couponDiscount * item.quantity), 0);
    order.finalTotal = order.subtotal - order.totalCouponDiscount;

    await order.save();
    
    res.json({ 
      success: true, 
      message: 'Order cancelled and refund processed successfully', 
      alertType: 'success' 
    });
    
  } catch (error) {
    console.error('Error in cancelOrder:', error);
    res.json({ 
      success: false, 
      message: 'Server error occurred while cancelling order', 
      alertType: 'error' 
    });
  }
};



exports.getUpdateTracking = async (req, res) => {
  try {
    
    const order = await Order.findById(req.params.orderId)
      .populate('userId', 'name email')
      .populate('items.productId', 'productName images');
   
       res.render('admin/order/update-tracking', {
      order,
      trackingNumber: order.trackingInfo?.trackingNumber || '',
      carrier: order.trackingInfo?.carrier || '',
      status: order.trackingInfo?.status || 'Placed',
      reachedPlaces: order.trackingInfo?.reachedPlaces || [],
      deliveryDate: order.deliveryDate ? order.deliveryDate.toISOString().split('T')[0] : ''
    });
  } catch (err) {
    console.error('Error in getUpdateTracking:', err);
    res.status(500).render('admin/error', { message: 'Server Error. Please try again later.', status: 500 });
  }
};

exports.updateTracking = async (req, res) => {
  try {
   
    const order = await Order.findById(req.params.orderId);
    
    const { trackingNumber, carrier, status, reachedPlaces, deliveryDate, existingReachedPlaces } = req.body;

    let currentReachedPlaces = order.trackingInfo?.reachedPlaces || [];
    try {
      if (existingReachedPlaces) {
        currentReachedPlaces = JSON.parse(existingReachedPlaces);
      }
    } catch (err) {
      console.warn(' Error parsing existingReachedPlaces:', err);
    }

    let newReachedPlaces = [];
    if (reachedPlaces && Array.isArray(reachedPlaces)) {
      newReachedPlaces = reachedPlaces.map(place => ({
        place: place.place,
        date: place.date ? new Date(place.date) : new Date()
      }));
    }

    const mergedReachedPlaces = [];
    newReachedPlaces.forEach((newPlace, index) => {
      if (index < currentReachedPlaces.length) {
        mergedReachedPlaces[index] = {
          place: newPlace.place || currentReachedPlaces[index].place,
          date: newPlace.date || currentReachedPlaces[index].date
        };
      } else {
        mergedReachedPlaces.push(newPlace);
      }
    });
    for (let i = newReachedPlaces.length; i < currentReachedPlaces.length; i++) {
      mergedReachedPlaces.push(currentReachedPlaces[i]);
    }

    order.trackingInfo = {
      trackingNumber: trackingNumber || order.trackingInfo?.trackingNumber || '',
      carrier: carrier || order.trackingInfo?.carrier || '',
      status: status || order.trackingInfo?.status || 'Placed',
      reachedPlaces: mergedReachedPlaces
    };

    const statusMap = ['Placed', 'Processing', 'Shipped', 'Out for Delivery', 'Delivered'];
    if (deliveryDate && new Date(deliveryDate) <= new Date()) {
      order.deliveryStatus = 'Delivered';
      order.trackingInfo.status = 'Delivered';
    } else if (mergedReachedPlaces.length > 0) {
      const statusIndex = Math.min(mergedReachedPlaces.length - 1, statusMap.length - 1);
      order.deliveryStatus = statusMap[statusIndex];
      order.trackingInfo.status = statusMap[statusIndex];
    } else {
      order.deliveryStatus = statusMap[0];
      order.trackingInfo.status = statusMap[0];
    }

    if (deliveryDate) {
      const deliveryDateObj = new Date(deliveryDate);
      if (isNaN(deliveryDateObj)) {
        console.warn(' Invalid delivery date');
        return res.json({ success: false, message: 'Invalid delivery date', alertType: 'error' });
      }
      const orderDateOnly = new Date(order.orderDate.toDateString());
      const deliveryDateOnly = new Date(deliveryDateObj.toDateString());
      if (deliveryDateOnly < orderDateOnly) {
        console.warn(' Delivery date cannot be before order date');
        return res.json({ success: false, message: 'Delivery date cannot be before order date', alertType: 'error' });
      }
      order.deliveryDate = deliveryDateObj;
    }

    const statusOrder = ['Placed', 'Processing', 'Shipped', 'Out for Delivery', 'Delivered'];
    const currentIndex = statusOrder.indexOf(order.deliveryStatus);
    const newIndex = statusOrder.indexOf(order.trackingInfo.status);
    if (newIndex < currentIndex) {
      console.warn(' Cannot move to previous status in tracking');
      return res.json({ success: false, message: 'Cannot move to previous status in tracking', alertType: 'error' });
    }

    await order.save();
    res.json({ success: true, message: 'Tracking information updated successfully', alertType: 'success' });
  } catch (err) {
    console.error(' Error in updateTracking:', err);
    res.status(500).json({ success: false, message: 'Server error', alertType: 'error' });
  }
};



exports.generateInvoicePDF = async (req, res) => {
  try {
    
    const orderId = req.params.orderId;


    const order = await Order.findById(orderId)
      .populate('userId', 'name email phone')
      .populate('addressId', 'name phone street city state pinCode country')
      .populate('items.productId', 'name images');

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const doc = new PDFDocument({
      size: 'A4',
      margin: 50,
      bufferPages: true,
    });

    doc.registerFont('NotoSans', path.join(__dirname, '../../fonts/NotoSans-Regular.ttf'));

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=invoice-${order._id.toString().slice(-8).toUpperCase()}.pdf`);

    doc.pipe(res);

    doc.font('NotoSans').fontSize(20).fillColor('#2c3e50').text('Invoice', 50, 50);
    doc.fontSize(12).fillColor('#6c757d').text('Lune Perfurmie', 50, 80);
    doc.text('123 kinfra, Calicut, India', 50, 95);
    doc.text('Email: luneperfumie@company.com | Phone: +1234567890', 50, 110);

    doc.moveTo(50, 130).lineTo(550, 130).strokeColor('#e9ecef').lineWidth(1).stroke();

    doc.font('NotoSans').fontSize(14).fillColor('#2c3e50').text('Order Details', 50, 150);
    doc.fontSize(10).fillColor('#495057');
    doc.text(`Order ID: #${order._id.toString().slice(-8).toUpperCase()}`, 50, 170);
    doc.text(`Order Date: ${order.orderDate ? new Date(order.orderDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A'}`, 50, 185);
    if (order.deliveryDate) {
      doc.text(`Delivered On: ${new Date(order.deliveryDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`, 50, 200);
    }
    doc.text(`Delivery Status: ${order.deliveryStatus || 'N/A'}`, 50, 215);

    doc.font('NotoSans').fontSize(12).fillColor('#2c3e50').text('Delivery Address', 300, 230);
    doc.fontSize(10).fillColor('#495057');
    doc.text(`Name: ${order.addressId?.name || 'N/A'}`, 300, 250);
    doc.text(`Street: ${order.addressId?.street || 'N/A'}, ${order.addressId?.city || 'N/A'}`, 300, 265);
    doc.text(`State: ${order.addressId?.state || 'N/A'}, ${order.addressId?.pinCode || 'N/A'}`, 300, 280);
    doc.text(`Country: ${order.addressId?.country || 'N/A'}`, 300, 295);
    doc.text(`Phone Number: ${order.addressId?.phone || 'N/A'}`, 300, 310);

    doc.moveTo(50, 315).lineTo(550, 315).strokeColor('#e9ecef').lineWidth(1).stroke();

    doc.font('NotoSans').fontSize(12).fillColor('#2c3e50').text('Items Ordered', 50, 330);
    const tableTop = 350;
    doc.fontSize(10).fillColor('#2c3e50');
    doc.text('Product', 50, tableTop);
    doc.text('Variant', 200, tableTop);
    doc.text('Quantity', 250, tableTop);
    doc.text('Unit Price', 300, tableTop);
    doc.text('Total', 350, tableTop);
    doc.text('Status', 400, tableTop);
    doc.moveTo(50, tableTop + 15).lineTo(550, tableTop + 15).strokeColor('#e9ecef').lineWidth(1).stroke();

    let y = tableTop + 25;
    order.items.forEach((item, index) => {
      doc.font('NotoSans').fontSize(10).fillColor('#495057');
      doc.text(item.productName || item.productId?.name || 'Unknown Product', 50, y, { width: 140, ellipsis: true });
      doc.text(item.variantSize || 'N/A', 200, y);
      doc.text(item.quantity || 1, 250, y);
      doc.text(`\u20B9${(item.offerPrice || 0).toLocaleString('en-IN')}`, 300, y);
      doc.text(`\u20B9${((item.offerPrice || 0) * (item.quantity || 1)).toLocaleString('en-IN')}`, 350, y);
      doc.text(item.status || 'N/A', 400, y);
      if (item.status === 'Cancelled' && item.cancellationReason) {
        doc.fontSize(8).fillColor('#dc3545').text(`Reason: ${item.cancellationReason}`, 400, y + 10, { width: 140, ellipsis: true });
        y += 10;
      } else if (item.status === 'Returned' || item.status === 'ReturnRequested') {
        doc.fontSize(8).fillColor('#fd7e14').text(`Reason: ${item.returnReason || 'N/A'}`, 400, y + 10, { width: 140, ellipsis: true });
        if (item.returnApproved !== undefined) {
          doc.text(`Return: ${item.returnApproved ? 'Approved' : 'Rejected'}`, 400, y + 20, { width: 140, ellipsis: true });
          if (!item.returnApproved && item.returnRejectionReason) {
            doc.text(`Rejection: ${item.returnRejectionReason}`, 400, y + 30, { width: 140, ellipsis: true });
            y += 20;
          }
          y += 10;
        }
      }
      y += 30;
      if (index < order.items.length - 1) {
        doc.moveTo(50, y - 5).lineTo(550, y - 5).strokeColor('#e9ecef').lineWidth(0.5).stroke();
      }
    });

    const summaryTop = y + 20;
    doc.font('NotoSans').fontSize(12).fillColor('#2c3e50').text('Payment Summary', 50, summaryTop);
    doc.fontSize(10).fillColor('#495057');
    doc.text(`Subtotal: \u20B9${(order.subtotal || 0).toLocaleString('en-IN')}`, 50, summaryTop + 20);
    if (order.totalCouponDiscount > 0) {
      doc.fillColor('#28a745').text(`Coupon Discount: -\u20B9${(order.totalCouponDiscount || 0).toLocaleString('en-IN')}`, 50, summaryTop + 35);
    }
    doc.fillColor('#495057').text(`Final Total: \u20B9${(order.finalTotal || 0).toLocaleString('en-IN')}`, 50, summaryTop + 50);
    doc.text(`Payment Method: ${order.paymentMethod === 'RAZORPAY' ? 'GPay/Online' : order.paymentMethod === 'WALLET' ? 'Wallet' : order.paymentMethod || 'Cash on Delivery'}`, 50, summaryTop + 65);
    doc.text(`Payment Status: ${order.paymentStatus === 'Completed' ? 'Paid' : order.paymentStatus || 'N/A'}`, 50, summaryTop + 80);
    if (order.paymentStatus === 'Refunded' && order.refundDetails && order.refundDetails.amount > 0) {
      doc.fillColor('#28a745').text(`Refund: \u20B9${(order.refundDetails.amount || 0).toLocaleString('en-IN')} processed on ${order.refundDetails.processedAt ? new Date(order.refundDetails.processedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A'}`, 50, summaryTop + 95);
    }

    doc.moveTo(50, summaryTop + 120).lineTo(550, summaryTop + 120).strokeColor('#e9ecef').lineWidth(1).stroke();
    doc.font('NotoSans').fontSize(10).fillColor('#6c757d').text('Thank you for your purchase!', 50, summaryTop + 140, { align: 'center' });
    doc.text('Contact us at luneperfumie@company.com for any queries.', 50, summaryTop + 155, { align: 'center' });

    doc.end();
  } catch (error) {
    console.error('Error generating admin invoice PDF:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
