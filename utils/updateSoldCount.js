const Order = require('../models/orderSchema'); 

// Product Sold Count
const getProductSoldCount = async () => {
  return await Order.aggregate([
    { $unwind: '$items' },
    { $match: { 'items.status': 'Active' } },
    {
      $group: {
        _id: '$items.productId',
        totalSold: { $sum: '$items.quantity' }
      }
    },
    {
      $lookup: {
        from: 'products',
        localField: '_id',
        foreignField: '_id',
        as: 'product'
      }
    },
    { $unwind: '$product' }
  ]);
};

// Variant Sold Count
const getVariantSoldCount = async () => {
  return await Order.aggregate([
    { $unwind: '$items' },
    { $match: { 'items.status': 'Active' } },
    {
      $group: {
        _id: {
          productId: '$items.productId',
          variantSize: '$items.variantSize'
        },
        totalSold: { $sum: '$items.quantity' }
      }
    },
    {
      $lookup: {
        from: 'products',
        localField: '_id.productId',
        foreignField: '_id',
        as: 'product'
      }
    },
    { $unwind: '$product' }
  ]);
};

module.exports = {
  getProductSoldCount,
  getVariantSoldCount
};
