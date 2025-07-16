const Cart = require('../../models/cartSchema');
const Product = require('../../models/productSchema');
const Address = require('../../models/addressSchema');
const Order = require('../../models/orderSchema');
const Wallet = require('../../models/walletSchema');
const Coupon = require('../../models/coupenSchema'); 
const { getProductWithOffers } = require('../../helper/productHelper');
const { prepareOrderForSave } = require('../../helper/orderHelper');

exports.getOrderPage=async(req,res)=>{
    try{
        const user=req.session.user?.id;
        const orders=await Order.find({userId:user})
        .populate('items.productId').sort({createdAt:-1})

         if (!orders || orders.length === 0) {
           console.log(`No orders found for user`);
           return res.render('dashboard/orders', { orders: [] }); // Send empty array to EJS
        }

        res.render('dashboard/orders',{
            orders
        })
    }catch(error){
         console.error('Error loading order page:', error);
        res.status(500).send('Internal Server Error');

    }
}


exports.getOrderTracking=async(req,res)=>{
    
}

exports.cancelItem = async (req, res) => {
  try {
    const userId = req.session.user?.id;
    const { orderId, itemId } = req.params;
    const { reason } = req.body;
  
    const order = await Order.findById(orderId);
    const item = order.items.id(itemId);
    
    if (!['Placed', 'Processing'].includes(order.deliveryStatus)) {
      return res.status(400).json({ success: false, message: 'Item cannot be cancelled at this stage' });
    }

const productBefore = await Product.findById(item.productId);
const variantBefore = productBefore.variants.find(v => v.size === item.variantSize);
console.log('Stock before cancellation:', variantBefore?.stock);

    const updatedProduct = await Product.findOneAndUpdate(
      { _id: item.productId },
      {
        $inc: { 'variants.$[elem].stock': item.quantity },
      },
      {
        arrayFilters: [{ 'elem.size': item.variantSize }],
        new: true,
      }
    );

    if (!updatedProduct) {
      return res.status(500).json({ success: false, message: 'Failed to update product stock' });
    }

    const updatedVariant = updatedProduct.variants.find(v => v.size === item.variantSize);
    console.log('Updated stock:', updatedVariant?.stock);

    const refundAmount = item.finalItemTotal - (item.couponDiscount * item.quantity);
    let description = `Money added to wallet by cancellation on ${itemId}`;

    const wallet = await Wallet.getOrCreate(userId);
   
    if (['ONLINE', 'WALLET'].includes(order.paymentMethod) && order.paymentStatus === 'Completed') {
      await wallet.addMoney(
        parseFloat(refundAmount),
        description||'Money added to wallet by cancellation');
    }

   
    item.status = 'Cancelled';
    item.cancellationReason = reason || '';
    item.isRefunded = ['WALLET', 'ONLINE'].includes(order.paymentMethod) && order.paymentStatus === 'Completed';

    const activeItems = order.items.filter(item => item.status === 'Active' || item.status === 'ReturnRequested');
    order.subtotal = activeItems.reduce((sum, item) => sum + item.finalItemTotal, 0);
    order.totalCouponDiscount = activeItems.reduce((sum, item) => sum + (item.couponDiscount * item.quantity), 0);
    order.finalTotal = order.subtotal - order.totalCouponDiscount;

    if (refundAmount > 0 && item.isRefunded) {
      order.refundDetails.amount = refundAmount;
      order.refundDetails.processedAt = new Date();
    }

    if (order.items.every(item => item.status === 'Cancelled')) {
      order.deliveryStatus = 'Cancelled';
      order.paymentStatus = 'Cancelled';
      order.status = 'Cancelled';
    }

    await order.save();

    res.json({
      success: true,
      message: item.isRefunded ? 'Item cancelled and money refunded successfully' : 'Item cancelled successfully',
      newBalance: wallet ? wallet.balance : undefined,
    });
  } catch (error) {
    console.error(`Error cancelling item: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel item. Please try again.',
    });
  }
};


exports.requestReturn = async (req, res) => {
  try {
    const userId = req.session.user?.id;
    const { orderId, itemId } = req.params;
    const { reason } = req.body;

    const order = await Order.findById(orderId);
    
   
    const item = order.items.id(itemId);
    if (!item) {
      return res.status(404).json({ message: 'Item not found in order' });
    }
    console.log(item)
   
    item.status = 'ReturnRequested';
    item.returnReason = reason;

    await order.save();

    return res.status(200).json({success: true, message: 'Return requested successfully', item });

  } catch (error) {
    console.error('Error in requestReturn:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
