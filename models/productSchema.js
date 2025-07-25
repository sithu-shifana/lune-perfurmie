const mongoose = require('mongoose');
const { getProductWithOffers } = require('../helper/productHelper');

const productSchema = new mongoose.Schema({
  productName: { type: String, required: true },
  fragranceType:{type:String},
  description: { type: String, required: true },

  brand: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', required: true },
  category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },

  variants: [{
    size: { type: String, enum: ['50ml', '100ml', '150ml', '200ml'], required: true },
    stock: { type: Number, required: true, min: 0 },
    originalPrice: { type: Number, required: true, min: 0 },
    soldCount: { type: Number, default: 0 }
  }],

  images: [{ url: String, publicId: String }],
  status: { type: String, enum: ['listed', 'unlisted'], default: 'listed' }
}, { timestamps: true });

productSchema.statics.getProductWithOffers = async function(productId) {
  return await getProductWithOffers(productId);
};

module.exports = mongoose.model('Product', productSchema);