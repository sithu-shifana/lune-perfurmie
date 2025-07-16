const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true ,trim: true},
  description: { type: String, default: '' },
  imageUrl: { type: String, required: true },
  imagePublicId: { type: String, required: true },
  status: { type: String, enum: ['listed', 'unlisted'], default: 'listed' }
}, { timestamps: true });

module.exports = mongoose.model('Category', categorySchema);