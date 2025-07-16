const mongoose = require('mongoose');
const Order = require('../models/orderSchema');

const prepareOrderForSave = (order, coupon = null) => {
  // Calculate finalItemTotal for each item
  order.items.forEach(item => {
    item.finalItemTotal = item.offerPrice * item.quantity;
    item.couponDiscount = item.couponDiscount || 0; // Ensure couponDiscount exists
    // Preserve offerSavings if it exists
    item.offerSavings = item.offerSavings || 0;
  });

  // Calculate coupon discounts if coupon is provided
  if (coupon) {
    const subtotalBeforeDiscount = order.items.reduce((sum, item) => sum + item.finalItemTotal, 0);

    // Validate minimum purchase
    if (subtotalBeforeDiscount < coupon.minPurchase) {
      throw new Error(`To use this coupon, minimum purchase must be ₹${coupon.minPurchase.toLocaleString()}`);
    }

    let totalDiscount = 0;
    if (coupon.discountType === 'flat') {
      // FIXED: Calculate total cart value for proportional distribution
      const totalCartValue = order.items.reduce((sum, item) => 
        sum + (item.offerPrice * item.quantity), 0);
      
      order.items.forEach(item => {
        const itemTotalValue = item.offerPrice * item.quantity;
        const itemProportion = itemTotalValue / totalCartValue;
        const itemTotalDiscount = coupon.discountValue * itemProportion;
        const itemCouponDiscount = itemTotalDiscount / item.quantity; // Per unit
        item.couponDiscount = Math.round(itemCouponDiscount * 100) / 100;
      });
      
      totalDiscount = order.items.reduce((sum, item) => sum + (item.couponDiscount * item.quantity), 0);
    } else if (coupon.discountType === 'percentage') {
      // Store per-unit percentage discount
      order.items.forEach(item => {
        const itemTotal = item.offerPrice * item.quantity;
        const itemDiscount = (coupon.discountValue / 100) * itemTotal;
        item.couponDiscount = Math.round((itemDiscount / item.quantity) * 100) / 100; // Per-unit discount
      });
      totalDiscount = order.items.reduce((sum, item) => sum + (item.couponDiscount * item.quantity), 0);
    }

    // Apply maxDiscount cap if applicable
    if (coupon.maxDiscount && totalDiscount > coupon.maxDiscount) {
      const scaleFactor = coupon.maxDiscount / totalDiscount;
      order.items.forEach(item => {
        item.couponDiscount = Math.round(item.couponDiscount * scaleFactor * 100) / 100; // Scale per-unit discount
      });
      totalDiscount = coupon.maxDiscount;
    }

    order.totalCouponDiscount = Math.round(totalDiscount * 100) / 100;
    order.couponCode = coupon.code;
  } else {
    // Reset coupon fields if no coupon
    order.items.forEach(item => { item.couponDiscount = 0; });
    order.totalCouponDiscount = 0;
    order.couponCode = null;
  }

  // Calculate subtotal: sum of finalItemTotal for Active/ReturnRequested items
  // This is the subtotal BEFORE coupon discount
  order.subtotal = order.items.reduce((sum, item) => {
    if (!item.status || ['Active', 'ReturnRequested'].includes(item.status)) {
      return sum + item.finalItemTotal;
    }
    return sum;
  }, 0);

  order.subtotal = Math.round(order.subtotal * 100) / 100;

  // Calculate coupon discount only for Active/ReturnRequested items
  const activeCouponDiscount = order.items.reduce((sum, item) => {
    if (!item.status || ['Active', 'ReturnRequested'].includes(item.status)) {
      return sum + (item.couponDiscount * item.quantity);
    }
    return sum;
  }, 0);

  // Update statuses
  if (order.paymentMethod === 'COD' && order.deliveryStatus === 'Delivered' && order.paymentStatus === 'Pending') {
    order.paymentStatus = 'Completed';
    order.status = 'Paid';
  }

  const activeItems = order.items.filter(item => item.status === 'Active');
  const cancelledItems = order.items.filter(item => item.status === 'Cancelled');
  const returnedItems = order.items.filter(item => item.status === 'Returned');
  const returnRequestedItems = order.items.filter(item => item.status === 'ReturnRequested');

  if (order.items.every(item => item.status === 'Cancelled')) {
    order.deliveryStatus = 'Cancelled';
    order.paymentStatus = 'Cancelled';
    order.status = 'Cancelled';
  } else if (order.items.every(item => item.status === 'Returned')) {
    order.deliveryStatus = 'Returned';
    order.paymentStatus = 'Refunded';
    order.status = 'Refunded';
  } else if (returnRequestedItems.length > 0) {
    order.deliveryStatus = 'ReturnRequested';
  } else if (activeItems.length > 0 && order.deliveryStatus === 'Delivered') {
    order.deliveryStatus = 'Delivered';
  }

  // Set delivery date
  if (order.isModified && order.isModified('deliveryStatus') && order.deliveryStatus === 'Delivered' && !order.deliveryDate) {
    order.deliveryDate = new Date();
  }

  // Calculate final total: subtotal minus coupon discount (only for active items)
  order.finalTotal = Math.round((order.subtotal - activeCouponDiscount) * 100) / 100;

  return order;
};

const orderMethods = {
  canBeReturned(order) {
    if (order.deliveryStatus !== 'Delivered' || !order.deliveryDate) return false;
    const threeDaysAfterDelivery = new Date(order.deliveryDate);
    threeDaysAfterDelivery.setDate(threeDaysAfterDelivery.getDate() + 3);
    return new Date() <= threeDaysAfterDelivery;
  }
};

module.exports = { prepareOrderForSave, orderMethods };