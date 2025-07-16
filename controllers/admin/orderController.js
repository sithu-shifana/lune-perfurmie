const mongoose = require('mongoose');
const Order = require('../../models/orderSchema');
const Product = require('../../models/productSchema');
const Wallet = require('../../models/walletSchema');

// Get order management page
exports.getOrderManagement = async (req, res) => {
  try {
    const { search, paymentMethod, paymentStatus, startDate, endDate, page = 1 } = req.query;
    const perPage = 10;

    const query = {};
    if (search && search.trim()) {
      query.$or = [
        { _id: mongoose.Types.ObjectId.isValid(search.trim()) ? search.trim() : null },
        { 'userId.name': { $regex: search.trim(), $options: 'i' } },
        { 'userId.email': { $regex: search.trim(), $options: 'i' } },
        {  }
      ].filter(q => q);
    }
    if (paymentMethod && ['COD', 'ONLINE', 'WALLET'].includes(paymentMethod)) {
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

    // Fix missing productName
    for (let order of orders) {
      let needsSave = false;
      for (let item of order.items) {
        if (!item.productName && item.productId?.productName) {
          item.productName = item.productId.productName;
          needsSave = true;
        }
      }
      if (needsSave) {
        await order.save();
        console.log(`✅ Updated order ${order._id} with fixed productName`);
      }
    }

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
    console.error('❌ Error fetching orders:', error);
    res.status(500).render('admin/error', { message: 'Server Error. Please try again later.', status: 500 });
  }
};


exports.getViewOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    if (!mongoose.isValidObjectId(orderId)) {
      console.error(`❌ Invalid order ID: ${orderId}`);
      return res.status(400).redirect('/admin/orderManagement?error=Invalid order ID');
    }

    const order = await Order.findById(orderId)
      .populate('userId', 'name email')
      .populate({
        path: 'items.productId',
        select: 'productName images',
        options: { strictPopulate: false }
      })
      .populate({
        path: 'addressId',
        select: 'line1 city state postalCode',
        options: { strictPopulate: false }
      });

    if (!order) {
      console.error(`❌ Order not found: ${orderId}`);
      return res.status(404).redirect('/admin/orderManagement?error=Order not found');
    }

    let needsSave = false;
    for (const item of order.items) {
      if (!item.productId || !item.productId.productName || !item.productName) {
        console.warn(`⚠️ Fixing missing product data for item ${item._id} in order ${order._id}`);
        item.productName = item.productId?.productName || `Missing Product (ID: ${item.productId?._id || 'N/A'})`;
        item.productId = {
          _id: item.productId?._id || 'N/A',
          productName: item.productName,
          images: item.productId?.images?.length > 0 ? item.productId.images : [{ url: '/images/placeholder.png' }]
        };
        needsSave = true;
      }
    }

    if (!order.addressId || !mongoose.Types.ObjectId.isValid(order.addressId)) {
      console.warn(`⚠️ Invalid or missing address for order ${order._id}`);
      order.addressId = null;
      needsSave = true;
    }

    if (needsSave) {
      await order.save();
      console.log(`✅ Updated order ${order._id} with fixed data`);
    }

    res.render('admin/order/view-order', { order: order.toObject({ virtuals: true }) });
  } catch (error) {
    console.error(`❌ Error loading order ${orderId || 'unknown'}:`, error.message);
    res.status(500).redirect('/admin/orderManagement?error=Server error');
  }
};

// Update delivery status
exports.updateDeliveryStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { deliveryStatus } = req.body;

    if (!mongoose.isValidObjectId(orderId)) {
      console.warn('❌ Invalid Order ID');
      return res.status(400).json({ success: false, message: 'Invalid Order ID', alertType: 'error' });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      console.warn('❌ Order not found');
      return res.status(404).json({ success: false, message: 'Order not found', alertType: 'error' });
    }

    const statusOrder = ['Placed', 'Processing', 'Shipped', 'Out for Delivery', 'Delivered'];
    const currentIndex = statusOrder.indexOf(order.deliveryStatus);
    const newIndex = statusOrder.indexOf(deliveryStatus);

    if (newIndex < currentIndex) {
      console.warn('❌ Cannot move to previous status');
      return res.json({ success: false, message: 'Cannot move to previous status', alertType: 'error' });
    }

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
    console.log(`✅ Delivery status updated to ${deliveryStatus} for order ${order._id}`);
    res.json({ success: true, message: 'Delivery status updated successfully', alertType: 'success' });
  } catch (error) {
    console.error('❌ Error updating delivery status:', error);
    res.json({ success: false, message: 'Server error', alertType: 'error' });
  }
};

exports.cancelOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { reason } = req.body;

    // Find the order
    const order = await Order.findById(orderId).populate('items.productId');
    
    if (!order) {
      return res.json({ success: false, message: 'Order not found', alertType: 'error' });
    }

    if (!reason) {
      console.warn('Cancellation reason required');
      return res.json({ success: false, message: 'Cancellation reason is required', alertType: 'error' });
    }

   
    // Update stock for all items in the order
    for (const item of order.items) {
      if (item.status === 'Active') {
        try {
          const productBefore = await Product.findById(item.productId);
          const variantBefore = productBefore.variants.find(v => v.size === item.variantSize);
          console.log(`Stock before cancellation for ${item.productId}:`, variantBefore?.stock);

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

          if (updatedProduct) {
            const updatedVariant = updatedProduct.variants.find(v => v.size === item.variantSize);
            console.log(`Updated stock for ${item.productId}:`, updatedVariant?.stock);
          }
        } catch (stockError) {
          console.error(`Error updating stock for item ${item._id}:`, stockError);
        }
      }
    }

    // Update order status
    order.deliveryStatus = 'Cancelled';
    order.status = 'Cancelled';
    
    // Update all active items to cancelled
    order.items.forEach(item => {
      if (item.status === 'Active') {
        item.status = 'Cancelled';
        item.cancellationReason = reason;
      }
    });

    // Handle refunds for completed payments
    if (order.paymentStatus === 'Completed' && ['ONLINE', 'WALLET'].includes(order.paymentMethod)) {
      const wallet = await Wallet.getOrCreate(order.userId);
      
      // Calculate refund amount using the same logic as user-side cancellation
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
        
        // Mark all cancelled items as refunded
        order.items.forEach(item => {
          if (item.status === 'Cancelled') {
            item.isRefunded = true;
          }
        });
        
        order.paymentStatus = 'Refunded';
        console.log(`💰 Refunded ${refundAmount} to wallet for order ${order._id}`);
      }
    } else if (order.paymentMethod === 'COD') {
      order.paymentStatus = 'Cancelled';
    }

    // Update order totals to reflect cancellation
    const activeItems = order.items.filter(item => item.status === 'Active' || item.status === 'ReturnRequested');
    order.subtotal = activeItems.reduce((sum, item) => sum + item.finalItemTotal, 0);
    order.totalCouponDiscount = activeItems.reduce((sum, item) => sum + (item.couponDiscount * item.quantity), 0);
    order.finalTotal = order.subtotal - order.totalCouponDiscount;

    await order.save();
    console.log(`✅ Order ${order._id} cancelled successfully`);
    
    res.json({ 
      success: true, 
      message: 'Order cancelled and refund processed successfully', 
      alertType: 'success' 
    });
    
  } catch (error) {
    console.error('❌ Error in cancelOrder:', error);
    res.json({ 
      success: false, 
      message: 'Server error occurred while cancelling order', 
      alertType: 'error' 
    });
  }
};

// Get update tracking page
exports.getUpdateTracking = async (req, res) => {
  try {
    console.log(`🔵 [getUpdateTracking] Fetching order ${req.params.orderId}`);
    if (!mongoose.isValidObjectId(req.params.orderId)) {
      console.warn('❌ Invalid Order ID');
      return res.status(400).render('admin/error', { message: 'Invalid Order ID', status: 400 });
    }
    const order = await Order.findById(req.params.orderId)
      .populate('userId', 'name email')
      .populate('items.productId', 'productName images');
    if (!order) {
      console.warn('❌ Order not found');
      return res.status(404).render('admin/error', { message: 'Order not found', status: 404 });
    }

    // Handle missing product data
    let needsSave = false;
    order.items.forEach(item => {
      if (!item.productName && item.productId?.productName) {
        item.productName = item.productId.productName;
        needsSave = true;
      }
      if (!item.productId || !item.productId.productName) {
        console.warn(`⚠️ Product not found for item ${item._id} in order ${order._id}`);
        item.productId = {
          _id: item.productId?._id || 'N/A',
          productName: `Missing Product (ID: ${item.productId?._id || 'N/A'})`,
          images: [{ url: '/images/placeholder.png' }]
        };
      }
    });
    if (needsSave) {
      await order.save();
      console.log(`✅ Updated order ${order._id} with fixed productName`);
    }

    res.render('admin/order/update-tracking', {
      order,
      trackingNumber: order.trackingInfo?.trackingNumber || '',
      carrier: order.trackingInfo?.carrier || '',
      status: order.trackingInfo?.status || 'Placed',
      reachedPlaces: order.trackingInfo?.reachedPlaces || [],
      deliveryDate: order.deliveryDate ? order.deliveryDate.toISOString().split('T')[0] : ''
    });
  } catch (err) {
    console.error('❌ Error in getUpdateTracking:', err);
    res.status(500).render('admin/error', { message: 'Server Error. Please try again later.', status: 500 });
  }
};

// Update tracking information
exports.updateTracking = async (req, res) => {
  try {
    console.log(`🔵 [updateTracking] Processing for order ${req.params.orderId}`);
    if (!mongoose.isValidObjectId(req.params.orderId)) {
      console.warn('❌ Invalid Order ID');
      return res.status(400).json({ success: false, message: 'Invalid Order ID', alertType: 'error' });
    }
    const order = await Order.findById(req.params.orderId);
    if (!order) {
      console.warn('❌ Order not found');
      return res.status(404).json({ success: false, message: 'Order not found', alertType: 'error' });
    }

    const { trackingNumber, carrier, status, reachedPlaces, deliveryDate } = req.body;

    // Validate inputs
    if (reachedPlaces && !Array.isArray(reachedPlaces)) {
      console.warn('❌ Invalid reachedPlaces format');
      return res.json({ success: false, message: 'Invalid reachedPlaces format', alertType: 'error' });
    }

    // Update trackingInfo
    order.trackingInfo = {
      trackingNumber: trackingNumber || order.trackingInfo?.trackingNumber || '',
      carrier: carrier || order.trackingInfo?.carrier || '',
      status: status || order.trackingInfo?.status || 'Placed',
      reachedPlaces: reachedPlaces
        ? reachedPlaces.map(place => ({
            place: place.place,
            date: place.date ? new Date(place.date) : new Date()
          }))
        : order.trackingInfo?.reachedPlaces || []
    };

    // Sync deliveryStatus with tracking status
    if (status && ['Placed', 'Processing', 'Shipped', 'Out for Delivery', 'Delivered'].includes(status)) {
      const statusOrder = ['Placed', 'Processing', 'Shipped', 'Out for Delivery', 'Delivered'];
      const currentIndex = statusOrder.indexOf(order.deliveryStatus);
      const newIndex = statusOrder.indexOf(status);
      if (newIndex < currentIndex) {
        console.warn('❌ Cannot move to previous status in tracking');
        return res.json({ success: false, message: 'Cannot move to previous status in tracking', alertType: 'error' });
      }
      order.deliveryStatus = status;
    }

    // Validate and update deliveryDate
    if (deliveryDate && status === 'Delivered') {
      const deliveryDateObj = new Date(deliveryDate);
      if (isNaN(deliveryDateObj)) {
        console.warn('❌ Invalid delivery date');
        return res.json({ success: false, message: 'Invalid delivery date', alertType: 'error' });
      }
      const orderDateOnly = new Date(order.orderDate.toDateString());
      const deliveryDateOnly = new Date(deliveryDateObj.toDateString());
      if (deliveryDateOnly < orderDateOnly) {
        console.warn('❌ Delivery date cannot be before order date');
        return res.json({ success: false, message: 'Delivery date cannot be before order date', alertType: 'error' });
      }
      order.deliveryDate = deliveryDateObj;
    }

    await order.save();
    console.log(`✅ Tracking updated for order ${order._id}`);
    res.json({ success: true, message: 'Tracking information updated successfully', alertType: 'success' });
  } catch (err) {
    console.error('❌ Error in updateTracking:', err);
    res.json({ success: false, message: 'Server error', alertType: 'error' });
  }
};

module.exports = exports;