const Order = require('../models/orderSchema');

const getBrandSoldCount = async () => {
  return await Order.aggregate([
    { $unwind: '$items' },
    { $match: { 'items.status': 'Active' } },

    // Join product info
    {
      $lookup: {
        from: 'products',
        localField: 'items.productId',
        foreignField: '_id',
        as: 'product'
      }
    },
    { $unwind: '$product' },

    // Group by brand
    {
      $group: {
        _id: '$product.brand',
        totalSold: { $sum: '$items.quantity' }
      }
    },

    // Join brand info
    {
      $lookup: {
        from: 'brands',
        localField: '_id',
        foreignField: '_id',
        as: 'brand'
      }
    },
    { $unwind: '$brand' },

    // Final shape
    {
      $project: {
        _id: 0,
        brand: '$brand',
        totalSold: 1
      }
    }
  ]);
};

module.exports = getBrandSoldCount;
