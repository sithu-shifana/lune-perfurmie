const mongoose = require('mongoose');
const Order = require('../models/orderSchema');
const NodeCache = require('node-cache');

const cache = new NodeCache({ stdTTL: 3600 }); // Cache for 1 hour

function calculateItemPricing(item) {
  if (item.originalPrice < 0 || item.offerPrice < 0 || item.quantity < 0) {
    throw new Error('Invalid item pricing or quantity');
  }
  item.priceAfterCoupon = item.offerPrice - (item.couponDiscount || 0);
  item.finalItemTotal = item.priceAfterCoupon * item.quantity;
  item.itemSavings = (item.originalPrice - item.offerPrice) * item.quantity;
}

const prepareOrderForSave = (order, coupon = null) => {
  console.time('prepareOrderForSave');
  try {
    // Process items
    order.items.forEach(item => {
      calculateItemPricing(item);
      item.couponDiscount = item.couponDiscount || 0;
      item.offerSavings = item.offerSavings || 0;
    });

    let totalCouponDiscount = 0;
    if (coupon) {
      const subtotalBeforeDiscount = order.items.reduce((sum, item) => sum + item.finalItemTotal, 0);

      if (subtotalBeforeDiscount < coupon.minPurchase) {
        throw new Error(`To use this coupon, minimum purchase must be ₹${coupon.minPurchase.toLocaleString()}`);
      }

      if (coupon.discountType === 'flat') {
        const totalCartValue = order.items.reduce((sum, item) => sum + (item.offerPrice * item.quantity), 0);
        order.items.forEach(item => {
          const itemTotalValue = item.offerPrice * item.quantity;
          const itemProportion = itemTotalValue / totalCartValue;
          const itemTotalDiscount = coupon.discountValue * itemProportion;
          item.couponDiscount = Math.round(itemTotalDiscount / item.quantity * 100) / 100;
        });
        totalCouponDiscount = order.items.reduce((sum, item) => sum + (item.couponDiscount * item.quantity), 0);
      } else if (coupon.discountType === 'percentage') {
        order.items.forEach(item => {
          const itemTotal = item.offerPrice * item.quantity;
          const itemDiscount = (coupon.discountValue / 100) * itemTotal;
          item.couponDiscount = Math.round(itemDiscount / item.quantity * 100) / 100;
        });
        totalCouponDiscount = order.items.reduce((sum, item) => sum + (item.couponDiscount * item.quantity), 0);
      }

      if (coupon.maxDiscount && totalCouponDiscount > coupon.maxDiscount) {
        const scaleFactor = coupon.maxDiscount / totalCouponDiscount;
        order.items.forEach(item => {
          item.couponDiscount = Math.round(item.couponDiscount * scaleFactor * 100) / 100;
        });
        totalCouponDiscount = coupon.maxDiscount;
      }

      order.totalCouponDiscount = Math.round(totalCouponDiscount * 100) / 100;
      order.couponCode = coupon.code;
    } else {
      order.items.forEach(item => { item.couponDiscount = 0; });
      order.totalCouponDiscount = 0;
      order.couponCode = null;
    }

    // Calculate subtotal and active coupon discount
    let subtotal = 0;
    let activeCouponDiscount = 0;
    for (const item of order.items) {
      if (!item.status || ['Active', 'ReturnRequested'].includes(item.status)) {
        subtotal += item.finalItemTotal;
        activeCouponDiscount += item.couponDiscount * item.quantity;
      }
    }
    order.subtotal = Math.round(subtotal * 100) / 100;
    order.totalCouponDiscount = Math.round(activeCouponDiscount * 100) / 100;

    // Update payment and order status
    if (order.paymentMethod === 'COD' && order.deliveryStatus === 'Delivered' && order.paymentStatus === 'Pending') {
      order.paymentStatus = 'Completed';
      order.status = 'Paid';
    }

    // Status checks
    const activeItems = order.items.filter(item => item.status === 'Active');
    if (order.items.every(item => item.status === 'Cancelled')) {
      order.deliveryStatus = 'Cancelled';
      order.paymentStatus = 'Cancelled';
      order.status = 'Cancelled';
      return order;
    }
    if (order.items.every(item => item.status === 'Returned')) {
      order.deliveryStatus = 'Returned';
      order.paymentStatus = 'Refunded';
      order.status = 'Refunded';
      return order;
    }
    if (order.items.some(item => item.status === 'ReturnRequested')) {
      order.deliveryStatus = 'ReturnRequested';
    } else if (activeItems.length > 0 && order.deliveryStatus === 'Delivered') {
      order.deliveryStatus = 'Delivered';
    }

    if (order.isModified && order.isModified('deliveryStatus') && order.deliveryStatus === 'Delivered' && !order.deliveryDate) {
      order.deliveryDate = new Date();
    }

    order.finalTotal = Math.round((order.subtotal - order.totalCouponDiscount) * 100) / 100;

    return order;
  } finally {
    console.timeEnd('prepareOrderForSave');
  }
};

const orderMethods = {
  canBeReturned(order) {
    if (order.deliveryStatus !== 'Delivered' || !order.deliveryDate) return false;
    const threeDaysAfterDelivery = new Date(order.deliveryDate);
    threeDaysAfterDelivery.setDate(threeDaysAfterDelivery.getDate() + 3);
    return new Date() <= threeDaysAfterDelivery;
  }
};

module.exports = {
  prepareOrderForSave,
  orderMethods,
  calculateItemPricing
};