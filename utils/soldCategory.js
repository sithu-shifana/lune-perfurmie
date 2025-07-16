const Category = require('../models/categorySchema');
const Product = require('../models/productSchema');
const Order = require('../models/orderSchema');

const getCategorySoldCount = async () => {
  const categories = await Category.find({});

  const categorySales = await Promise.all(
    categories.map(async (cat) => {
      const products = await Product.find({ category: cat._id }, { _id: 1 });
      const productIds = products.map(p => p._id);

      let totalSold = 0;

      if (productIds.length > 0) {
        const sold = await Order.aggregate([
          { $unwind: '$items' },
          { $match: { 'items.status': 'Active', 'items.productId': { $in: productIds } } },
          {
            $group: {
              _id: null,
              totalSold: { $sum: '$items.quantity' }
            }
          }
        ]);

        totalSold = sold[0]?.totalSold || 0;
      }

      return {
        category: cat,
        totalSold
      };
    })
  );

  return categorySales;
};

module.exports = getCategorySoldCount;
