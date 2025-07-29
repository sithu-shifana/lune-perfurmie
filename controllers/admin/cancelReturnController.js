const mongoose = require('mongoose');
const Order = require('../../models/orderSchema');
const Product = require('../../models/productSchema');
const Wallet = require('../../models/walletSchema');


exports.getManageReturns = async (req, res) => {
  try {
    const order = await Order.findById(req.params.orderId)
      .populate('userId', 'name email')
      .populate('items.productId', 'productName images');
    
    if (!order) {
      console.warn('Order not found');
      return res.status(404).render('admin/error', { message: 'Order not found', status: 404 });
    }

    res.render('admin/order/manage-returns', { order });
  } catch (err) {
    console.error('Error in getManageReturns:', err);
    res.status(500).render('admin/error', { message: 'Server Error. Please try again later.', status: 500 });
  }
};



exports.getViewReturns = async (req, res) => {
  try {
    
    const order = await Order.findById(req.params.orderId)
      .populate('userId', 'name email')
      .populate('items.productId', 'productName images');
   
    res.render('admin/order/view-returns', { order });
  } catch (err) {
    console.error('Error in getViewReturns:', err);
    res.status(500).render('admin/error', { message: 'Server Error. Please try again later.', status: 500 });
  }
};



exports.approveReturn = async (req, res) => {
  try {
    const order = await Order.findById(req.params.orderId).populate('items.productId');
    
    const returnRequestedItems = order.items.filter(item => item.status === 'ReturnRequested');
    if (returnRequestedItems.length === 0) {
      return res.status(400).json({ success: false, message: 'No items requested for return', alertType: 'error' });
    }

    for (const item of order.items) {
      if (item.status === 'ReturnRequested') {
        item.status = 'Returned';
        item.returnApproved = true;
        item.isRefunded = true;
      }
    }

    // Update order totals
    const activeItems = order.items.filter(item => item.status === 'Active');
    const stillReturnRequestedItems = order.items.filter(item => item.status === 'ReturnRequested');
    order.subtotal = activeItems.reduce((sum, item) => sum + item.finalItemTotal, 0);
    order.totalCouponDiscount = activeItems.reduce((sum, item) => sum + (item.couponDiscount * item.quantity), 0);
    order.finalTotal = order.subtotal - order.totalCouponDiscount;

    // Update order statuses
    if (order.items.every(item => item.status === 'Returned')) {
      order.deliveryStatus = 'Returned';
      order.paymentStatus = 'Refunded';
      order.status = 'Refunded';
    } else if (stillReturnRequestedItems.length > 0) {
      order.deliveryStatus = 'ReturnRequested';
    } else if (activeItems.length > 0) {
      order.deliveryStatus = 'Delivered';
    }

    await order.save();
    res.json({ success: true, message: 'Order return approved successfully', alertType: 'success' });
  } catch (err) {
    console.error(' Error in approveReturn:', err);
    res.json({ success: false, message: 'Server error', alertType: 'error' });
  }
};


exports.rejectReturn = async (req, res) => {
  try {
    const order = await Order.findById(req.params.orderId);
    if (!order) {
      console.warn(' Order not found');
      return res.status(404).json({ success: false, message: 'Order not found', alertType: 'error' });
    }
    const { rejectionReason } = req.body;
    if (!rejectionReason) {
      return res.status(400).json({ success: false, message: 'Rejection reason is required', alertType: 'error' });
    }

    const returnRequestedItems = order.items.filter(item => item.status === 'ReturnRequested');
    if (returnRequestedItems.length === 0) {
      return res.status(400).json({ success: false, message: 'No items requested for return', alertType: 'error' });
    }

    for (const item of order.items) {
      if (item.status === 'ReturnRequested') {
        item.status = 'Active';
        item.returnApproved = false;
        item.returnRejectionReason = rejectionReason;
        item.returnRejected = true;
      }
    }

    await order.save();
    res.json({ success: true, message: 'Order return rejected successfully', alertType: 'success' });
  } catch (err) {
    console.error('Error in rejectReturn:', err);
    res.json({ success: false, message: 'Server error', alertType: 'error' });
  }
};



exports.approveItemReturn = async (req, res) => {
  try {
    

    const order = await Order.findById(req.params.orderId).populate('items.productId');
    const item = order.items.id(req.params.itemId);
   
    const productBefore = await Product.findById(item.productId);
    const variantBefore = productBefore.variants.find(v => v.size === item.variantSize);

    const updatedProduct = await Product.findOneAndUpdate(
      { _id: item.productId },
      { $inc: { 'variants.$[elem].stock': item.quantity } },
      { arrayFilters: [{ 'elem.size': item.variantSize }], new: true }
    );

    if (!updatedProduct) {
      console.warn(' Failed to update product stock');
      return res.status(500).json({ success: false, message: 'Failed to update product stock', alertType: 'error' });
    }


    const refundAmount = (item.offerPrice * item.quantity) - (item.couponDiscount * item.quantity);
    if (refundAmount < 0) {
      console.warn(` Negative refund amount calculated for item ${item._id}`);
      return res.status(500).json({ success: false, message: 'Invalid refund amount calculated', alertType: 'error' });
    }

    if (['RAZORPAY', 'WALLET','COD'].includes(order.paymentMethod) && order.paymentStatus === 'Completed') {
      const wallet = await Wallet.getOrCreate(order.userId);
      await wallet.addMoney(
        parseFloat(refundAmount),
        `Refund for item ${item.productName} #${order._id.toString().slice(-8).toUpperCase()}`,
      );
    }

    item.status = 'Returned';
    item.returnApproved = true;
    item.isRefunded = true;

    const activeItems = order.items.filter(i => i.status === 'Active' || i.status === 'ReturnRequested');
    order.subtotal = activeItems.reduce((sum, i) => sum + i.finalItemTotal, 0);
    order.totalCouponDiscount = activeItems.reduce((sum, i) => sum + (i.couponDiscount * i.quantity), 0);
    order.finalTotal = order.subtotal - order.totalCouponDiscount;

    if (refundAmount > 0) {
      order.refundDetails.amount = (order.refundDetails.amount || 0) + refundAmount;
      order.refundDetails.processedAt = new Date();
      order.refundDetails.method = 'wallet';
    }

    const stillReturnRequestedItems = order.items.filter(i => i.status === 'ReturnRequested');
    if (order.items.every(i => i.status === 'Returned')) {
      order.deliveryStatus = 'Returned';
      order.paymentStatus = 'Refunded';
      order.status = 'Refunded';
    } else if (stillReturnRequestedItems.length > 0) {
      order.deliveryStatus = 'ReturnRequested';
    } else if (activeItems.length > 0) {
      order.deliveryStatus = 'Delivered';
    }

    await order.save();
    console.log(` Item return approved for item ${item._id} in order ${order._id}`);
    res.json({ success: true, message: 'Item return approved successfully', alertType: 'success' });
  } catch (err) {
    console.error(' Error in approveItemReturn:', err);
    res.json({ success: false, message: 'Server error', alertType: 'error' });
  }
};

exports.rejectItemReturn = async (req, res) => {
  try {
    
    const order = await Order.findById(req.params.orderId);
    
    const item = order.items.id(req.params.itemId);
   
    const { rejectionReason } = req.body;
    if (!rejectionReason) {
      console.warn(' Rejection reason missing');
      return res.status(400).json({ success: false, message: 'Rejection reason is required', alertType: 'error' });
    }
    if (item.status !== 'ReturnRequested') {
      console.warn(` Item ${item._id} not in ReturnRequested status`);
      return res.status(400).json({ success: false, message: 'Item is not in return requested status', alertType: 'error' });
    }

    item.status = 'Active';
    item.returnApproved = false;
    item.returnRejectionReason = rejectionReason;
    item.returnRejected = true;

    await order.save();
    console.log(`Item return rejected for item ${item._id} in order ${order._id}`);
    res.json({ success: true, message: 'Item return rejected successfully', alertType: 'success' });
  } catch (err) {
    console.error(' Error in rejectItemReturn:', err);
    res.json({ success: false, message: 'Server error', alertType: 'error' });
  }
};
