const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const orderSchema = new mongoose.Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  addressId: { type: Schema.Types.ObjectId, ref: 'Address', required: true },
  items: [{
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    productName: { type: String, required: true },
    variantSize: { type: String, enum: ['50ml', '100ml', '150ml', '200ml'], required: true },
    quantity: { type: Number, required: true, min: 1, default: 1 },
    originalPrice: { type: Number, required: true, min: 0 }, // Per unit
    offerPrice: { type: Number, required: true, min: 0 }, // Per unit
    finalItemTotal: { type: Number, required: true, min: 0 }, // offerPrice * quantity
    couponDiscount: { type: Number, default: 0, min: 0 }, // Per-item coupon discount
    status: { type: String, enum: ['Active', 'Cancelled', 'Returned', 'ReturnRequested'], default: 'Active' },
    cancellationReason: { type: String, default: '' },
    returnReason: { type: String, default: '' },
    returnApproved:{type:Boolean,default:false},
    isRefunded: { type: Boolean, default: false },
    returnRejected:{type:Boolean,default:false},
    returnApproved: { type: Boolean, default: false },
    returnRejectionReason:{type:String,default:''}

  }],
  subtotal: { type: Number, required: true, min: 0, default: 0 }, 
  couponCode: { type: String, default: null }, 
  totalCouponDiscount: { type: Number, default: 0, min: 0 }, 
  finalTotal: { type: Number, required: true, min: 0, default: 0 },
  paymentMethod: { type: String, enum: ['COD', 'ONLINE', 'WALLET'], required: true },
  paymentStatus: { 
    type: String, 
    enum: ['Pending', 'Completed', 'Failed', 'Cancelled', 'Refunded'], 
    default: function() {
      return ['ONLINE', 'WALLET'].includes(this.paymentMethod) ? 'Completed' : 'Pending';
    }
  },
  status: {
    type: String,
    enum: ['Pending', 'Paid', 'Failed', 'Cancelled', 'Refunded'],
    default: function() {
      return ['ONLINE', 'WALLET'].includes(this.paymentMethod) ? 'Paid' : 'Pending';
    }
  },
  deliveryStatus: { 
    type: String, 
    enum: ['Placed', 'Processing', 'Shipped', 'Out for Delivery', 'Delivered', 'Cancelled', 'ReturnRequested', 'Returned'], 
    default: 'Placed' 
  },
  orderDate: { type: Date, default: Date.now },
  deliveryDate: { type: Date },
  refundDetails: {
    amount: { type: Number, default: 0 },
    method: { type: String, enum: ['wallet', 'original_payment'], default: 'wallet' },
    processedAt: { type: Date },
    transactionId: { type: String }
  }
}, { timestamps: true });


orderSchema.virtual('totalSavings').get(function () {
  let originalTotal = 0;

  this.items.forEach(item => {
    originalTotal += item.originalPrice * item.quantity;
  });

  const totalSavings = originalTotal - this.subtotal + this.totalCouponDiscount;

  return totalSavings;
});

orderSchema.set('toObject', { virtuals: true });
orderSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('Order', orderSchema);