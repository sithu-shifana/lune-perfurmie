// models/offerSchema.js
const mongoose = require('mongoose');

const offerSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: String,

  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', default: null },
  category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null },
  brand: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', default: null },

  discountType: { type: String, enum: ['percentage', 'flat', 'fixed'], required: true },
  discountValue: { type: Number, required: true },

  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  
  isActive: { type: Boolean, default: true }
}, {
  timestamps: true
});

module.exports = mongoose.model('Offer', offerSchema);