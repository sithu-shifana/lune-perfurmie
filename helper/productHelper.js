const mongoose = require('mongoose');
const { calculateBestOffer } = require('./offerHelper');

const getProductWithOffers = async (productId, userId = null) => {
  const Product = mongoose.model('Product');
  const Wishlist = mongoose.model('Wishlist');
  const Cart = mongoose.model('Cart');

  try {
    const product = await Product.findById(productId)
      .populate('brand category')
      .lean();

    if (!product) {
      throw new Error(`Product with ID ${productId} not found`);
    }

    // Calculate offers for each variant
    const variantsWithOffers = await Promise.all(
      product.variants.map(async (variant) => {
        const offerDetails = await calculateBestOffer(product._id, variant.originalPrice);
        return {
          size: variant.size,
          stock: variant.stock,
          soldCount: variant.soldCount,
          originalPrice: variant.originalPrice,
          offerPrice: offerDetails.offerPrice,
          discount: offerDetails.discount,
          discountType: offerDetails.discountType || 'none',
          discountValue: isNaN(offerDetails.discountValue) ? 0 : Number(offerDetails.discountValue),
          discountPercentage: offerDetails.discountPercentage || 0,
          hasOffer: offerDetails.hasOffer,
          offerName: offerDetails.offerName
        };
      })
    );

    let isInWishlist = false;
    if (userId) {
      const wishlist = await Wishlist.findOne({ user: userId }).lean();
      if (wishlist) {
        isInWishlist = wishlist.items.some(item => item.product.toString() === productId.toString());
      }
    }

    if (userId) {
      const cart = await Cart.findOne({ user: userId }).lean();
      if (cart && cart.items.length > 0) {
        variantsWithOffers.forEach(variant => {
          const foundInCart = cart.items.find(
            item => item.product.toString() === productId.toString() &&
                    item.size === variant.size 
          );
            if (foundInCart) {
                 variant.isInCart = true;
                 variant.cartQuantity = foundInCart.quantity;
           } else {
                  variant.isInCart = false;
                  variant.cartQuantity = 0;
           }
        });
      } else {
        variantsWithOffers.forEach(variant => {
          variant.isInCart = false;
        });
      }
    }

    // Determine if the product has an active offer
    const hasOffer = variantsWithOffers.some(v => v.hasOffer);
    const bestVariantWithOffer = variantsWithOffers.find(v => v.hasOffer) || variantsWithOffers[0];

    const result = {
      _id: product._id,
      productName: product.productName,
      description: product.description,
      brand: product.brand,
      category: product.category,
      images: product.images,
      variants: variantsWithOffers,
      status: product.status,
      originalPrice: variantsWithOffers[0].originalPrice,
      offerPrice: variantsWithOffers[0].offerPrice,
      hasOffer,
      discountType: bestVariantWithOffer.discountType || 'none',
      discountValue: isNaN(bestVariantWithOffer.discountValue) ? 0 : Number(bestVariantWithOffer.discountValue),
      discountPercentage: bestVariantWithOffer.discountPercentage || 0,
      offerName: bestVariantWithOffer.offerName || null,
      isInWishlist: userId ? isInWishlist : undefined
    };

    return result;
  } catch (error) {
    console.error('Error in getProductWithOffers:', error.message);
    throw error;
  }
};

module.exports = {
  getProductWithOffers
};