const mongoose = require('mongoose');


const calculateBestOffer = async (productId, originalPrice) => {
  try {
    const Product = mongoose.model('Product');
    const Offer = mongoose.model('Offer');
    
    const product = await Product.findById(productId)
      .populate('brand category', '_id');

    if (!product) {
      throw new Error(`Product with ID ${productId} not found`);
    }

    const now = new Date();

    const activeOffers = await Offer.find({
      isActive: true,
      startDate: { $lte: now },
      endDate: { $gte: now },
      $or: [
        { product: product._id },
        { brand: product.brand?._id },
        { category: product.category?._id }
      ]
    });

    if (!activeOffers.length) {
      return {
        originalPrice,
        offerPrice: originalPrice,
        discount: 0,
        discountType: null,
        discountValue: 0,
        discountPercentage: 0,
        hasOffer: false,
        offerName: null
      };
    }

    let bestOffer = null;
    let maxDiscount = 0;

    for (const offer of activeOffers) {
      let discountAmount = 0;

      if (offer.discountType === 'percentage') {
        discountAmount = (originalPrice * offer.discountValue) / 100;
      } else if (offer.discountType === 'flat' || offer.discountType === 'fixed') {
        discountAmount = isNaN(offer.discountValue) || offer.discountValue == null ? 0 : Number(offer.discountValue);
      }

      if (discountAmount > maxDiscount) {
        maxDiscount = discountAmount;
        bestOffer = offer;
      }
    }

    if (!bestOffer) {
      return {
        originalPrice,
        offerPrice: originalPrice,
        discount: 0,
        discountType: null,
        discountValue: 0,
        discountPercentage: 0,
        hasOffer: false,
        offerName: null
      };
    }

    const discount = maxDiscount;
    const offerPrice = Math.max(0, originalPrice - discount);

    const discountPercentage = discount > 0 ? Math.round((discount / originalPrice) * 100) : 0;

    return {
      originalPrice,
      offerPrice,
      discount,
      discountType: bestOffer.discountType,
      discountValue: isNaN(bestOffer.discountValue) || bestOffer.discountValue == null ? 0 : Number(bestOffer.discountValue),
      discountPercentage,
      hasOffer: true,
      offerName: bestOffer.title
    };

  } catch (error) {
    console.error('Error calculating best offer:', error);
    throw error;
  }
};

module.exports = {
  calculateBestOffer
};
