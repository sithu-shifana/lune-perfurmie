const mongoose = require('mongoose');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const Cart = require('../../models/cartSchema');
const Product = require('../../models/productSchema');
const Address = require('../../models/addressSchema');
const Order = require('../../models/orderSchema');
const Wallet = require('../../models/walletSchema');
const Coupon = require('../../models/coupenSchema');
const { getProductWithOffers } = require('../../helper/productHelper');
const { prepareOrderForSave } = require('../../helper/orderHelper');

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});


//get checkout page
exports.getCheckoutPage = async (req, res) => {
  try {
    const userId = req.session.user?.id;
    const cart = await Cart.findOne({ user: userId }).populate({
      path: 'items.product',
      match: { status: 'listed' },
    });

    if (cart) {
      cart.items = cart.items.filter(item => item.product);
    }

    const addresses = await Address.find({ userId }) || [];
    let selectedAddressId = req.session.selectedAddress || (addresses.find(addr => addr.isDefault)?._id?.toString());

    if (!selectedAddressId && addresses.length > 0) {
      selectedAddressId = addresses[0]._id.toString();
    }

    if (!cart || !cart.items.length) {
      return res.render('user/checkout', {
        orderItems: [],
        total: 0,
        subtotal: 0,
        totalSavings: 0,
        addresses,
        selectedAddressId,
        walletBalance: 0,
        walletEnabled: false,
        codAvailable: false,
        activeCoupons: [],
        RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID,
      });
    }

    const orderItems = await Promise.all(
      cart.items.map(async (item) => {
        const productDetails = await getProductWithOffers(item.product, userId);
        const variant = productDetails.variants.find(v => v.size === item.variant);
        return {
          _id: item._id.toString(),
          productId: productDetails._id,
          productName: productDetails.productName,
          image: productDetails.images[0]?.url || '',
          size: item.variant,
          quantity: item.quantity,
          originalPrice: variant.originalPrice,
          hasOffer: productDetails.hasOffer,
          offerPrice: variant.offerPrice,
          totalPrice: variant.originalPrice * item.quantity,
          totalOffer: variant.offerPrice * item.quantity,
          Saving: productDetails.hasOffer ? (variant.originalPrice - variant.offerPrice) * item.quantity : 0,
        };
      })
    );

    const total = orderItems.reduce((acc, item) => acc + item.totalPrice, 0);
    const subtotal = orderItems.reduce((acc, item) => acc + item.totalOffer, 0);
    const totalSavings = orderItems.reduce((acc, item) => acc + item.Saving, 0);

    const wallet = await Wallet.findOne({ user: userId });
    const walletBalance = wallet ? wallet.balance : 0;
    const walletEnabled = walletBalance >= subtotal;
    const codAvailable = subtotal <= 10000;

    const activeCoupons = await Coupon.find({
      isActive: true,
      expiryDate: { $gt: new Date() },
      usedUsers: { $ne: userId },
    });

    res.render('user/checkout', {
      orderItems,
      total,
      subtotal,
      totalSavings,
      addresses,
      selectedAddressId,
      walletBalance,
      walletEnabled,
      codAvailable,
      activeCoupons,
      RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID,
    });
  } catch (error) {
    res.status(500).send('Internal Server Error');
  }
};


//add address in checkout
exports.addAddress = async (req, res) => {
  try {
    const userId = req.session.user?.id;
    const { name, phone, street, city, state, pinCode } = req.body;

    const newAddress = new Address({
      userId,
      name,
      phone,
      street,
      city,
      state,
      pinCode,
      country: 'India',
    });

    const savedAddress = await newAddress.save();
    req.session.selectedAddress = savedAddress._id.toString();

    res.status(200).json({ success: true, message: 'Address saved successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to save address' });
  }
};


//select address 
exports.selectAddress = async (req, res) => {
  try {
    const { addressId } = req.body;
    const address = await Address.findById(addressId);
    if (!address) {
      return res.status(400).json({ success: false, message: 'Invalid address' });
    }
    req.session.selectedAddress = addressId;
    res.status(200).json({ success: true, message: 'Address selected' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to select address' });
  }
};


//apply coupon
exports.applyCoupon = async (req, res) => {
  try {
    const userId = req.session.user?.id;
    const { couponCode } = req.body;

    const cart = await Cart.findOne({ user: userId }).populate('items.product');
    if (!cart || cart.items.length === 0) {
      return res.json({ success: false, message: 'Cart is empty.' });
    }

    const coupon = await Coupon.findOne({ code: couponCode.trim(), isActive: true });
    if (!coupon) {
      return res.json({ success: false, message: 'Invalid or inactive coupon.' });
    }
    if (coupon.expiryDate < new Date()) {
      return res.json({ success: false, message: 'Coupon expired.' });
    }
    if (coupon.usedUsers.includes(userId)) {
      return res.json({ success: false, message: 'Already used this coupon.' });
    }

    const items = await Promise.all(
      cart.items.map(async (item) => {
        const productDetails = await getProductWithOffers(item.product, userId);
        const variant = productDetails.variants.find(v => v.size === item.variant);
        return {
          productId: productDetails._id,
          productName: productDetails.productName,
          variantSize: item.variant,
          quantity: item.quantity,
          originalPrice: variant.originalPrice,
          offerPrice: variant.offerPrice,
          finalItemTotal: variant.offerPrice * item.quantity,
          offerSavings: productDetails.hasOffer ? (variant.originalPrice - variant.offerPrice) * item.quantity : 0,
        };
      })
    );

    try {
      const order = { items };
      const updatedOrder = prepareOrderForSave(order, coupon);

      
      const subtotal = updatedOrder.items.reduce((sum, item) => sum + item.finalItemTotal, 0);
      const finalTotal = subtotal - updatedOrder.totalCouponDiscount;
      const totalOfferSavings = updatedOrder.items.reduce((sum, item) => sum + (item.offerSavings || 0), 0);
      const totalSavings = totalOfferSavings + updatedOrder.totalCouponDiscount;

      req.session.appliedCoupon = {
        code: coupon.code,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
      };
      req.session.couponDiscount = updatedOrder.totalCouponDiscount;

      res.json({
        success: true,
        message: `Coupon "${coupon.code}" applied successfully!`,
        couponDiscount: coupon.discountValue,
        finalTotal: Math.round(finalTotal * 100) / 100,
        subtotal: Math.round(subtotal * 100) / 100,
        totalSavings: Math.round(totalSavings * 100) / 100,
        offerSavings: Math.round(totalOfferSavings * 100) / 100,
        items: updatedOrder.items.map(item => ({
          productId: item.productId,
          variantSize: item.variantSize,
          quantity: item.quantity,
          couponDiscount: item.couponDiscount,
          offerSavings: item.offerSavings || 0,
        })),
      });
    } catch (error) {
      return res.json({ success: false, message: error.message });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

//remove coupon
exports.removeCoupon = async (req, res) => {
  try {
    req.session.appliedCoupon = null;
    req.session.couponDiscount = 0;

    res.json({
      success: true,
      message: 'Coupon removed successfully!',
    });
  } catch (error) {
    console.error('Error removing coupon:', error);
    res.status(500).json({ success: false, message: 'Error removing coupon' });
  }
};

//place order
exports.placeOrder = async (req, res) => {
  try {
    const userId = req.session.user?.id;
    const { addressId, paymentMethod, couponCode } = req.body;


    const cart = await Cart.findOne({ user: userId }).populate('items.product');
    if (!cart || cart.items.length === 0) {
      return res.status(400).json({ success: false, message: 'Cart is empty' });
    }

    const items = await Promise.all(
      cart.items.map(async (item) => {
        const productDetails = await getProductWithOffers(item.product, userId);
        const variantBefore = productDetails.variants.find(v => v.size === item.variant);
        if (!variantBefore) {
          throw new Error(`Variant not found for size ${item.variant}`);
        }


        if (variantBefore.stock < item.quantity) {
          throw new Error(`Insufficient stock for ${productDetails.productName} [Size: ${item.variant}]`);
        }

        const updatedProduct = await Product.findOneAndUpdate(
          { _id: item.product },
          { $inc: { 'variants.$[elem].stock': -item.quantity } },
          { arrayFilters: [{ 'elem.size': item.variant }], new: true }
        );

        if (!updatedProduct) {
          throw new Error(`Failed to update stock for product ${item.product}`);
        }


        return {
          productId: updatedProduct._id,
          productName: updatedProduct.productName,
          variantSize: item.variant,
          quantity: item.quantity,
          originalPrice: variantBefore.originalPrice,
          offerPrice: variantBefore.offerPrice,
          finalItemTotal: variantBefore.offerPrice * item.quantity,
          couponDiscount: 0,
        };
      })
    );

    let coupon = null;
    if (couponCode) {
      coupon = await Coupon.findOne({ code: couponCode.trim(), isActive: true });
      if (!coupon) {
        return res.status(400).json({ success: false, message: 'Invalid or inactive coupon' });
      }
      if (coupon.expiryDate < new Date()) {
        return res.status(400).json({ success: false, message: 'Coupon expired' });
      }
      if (coupon.usedUsers.includes(userId)) {
        return res.status(400).json({ success: false, message: 'Coupon already used' });
      }
    }

    const orderData = { items, paymentMethod };
    const updatedOrder = prepareOrderForSave(orderData, coupon);

    const address = await Address.findById(addressId);
    if (!address) {
      return res.status(400).json({ success: false, message: 'Invalid address' });
    }

    let newOrder = new Order({
      userId,
      addressId: address._id,
      items: updatedOrder.items,
      subtotal: updatedOrder.subtotal,
      couponCode: updatedOrder.couponCode,
      totalCouponDiscount: updatedOrder.totalCouponDiscount,
      finalTotal: updatedOrder.finalTotal,
      paymentMethod,
      paymentStatus: updatedOrder.paymentStatus,
      status: updatedOrder.status,
      deliveryStatus: 'Placed',
    });

    if (paymentMethod === 'WALLET') {
      const wallet = await Wallet.getOrCreate(userId);
      if (wallet.balance < updatedOrder.subtotal) {
        return res.status(400).json({ success: false, message: 'Insufficient wallet balance' });
      }
      await wallet.deductMoney(
        updatedOrder.subtotal,
        `Order payment for Order ID: #${newOrder._id.toString().slice(-8).toUpperCase()}`
      );
    }

    if (coupon) {
      coupon.usedUsers.push(userId);
      await coupon.save();
    }

    await newOrder.save();
   

    cart.items = [];
    await cart.save();

    const io = req.app.get('io');
    io.emit('order-placed', { orderId: newOrder._id });

    res.status(200).json({ success: true, orderId: newOrder._id, message: 'Order placed successfully' });
  } catch (err) {
    console.error('Error placing order:', err.message || err);
    res.status(500).json({ success: false, message: err.message || 'Internal Server Error' });
  }
};

//get order succuss page
exports.getOrderSuccessPage = async (req, res) => {
  try {
    const userId = req.session.user?.id;
    const { orderId } = req.params;

    const order = await Order.findOne({ _id: orderId, userId }).populate('addressId');
    if (!order) {
      return res.status(404).render('user/error', { message: 'Order not found' });
    }

    const orderItems = await Promise.all(
      order.items.map(async (item) => {
        const product = await Product.findById(item.productId);
        return {
          productId: item.productId,
          productName: item.productName,
          image: product?.images[0]?.url || '',
          variantSize: item.variantSize,
          quantity: item.quantity,
          originalPrice: item.originalPrice,
          offerPrice: item.offerPrice,
          couponDiscount: item.couponDiscount,
          finalItemTotal: item.finalItemTotal - item.couponDiscount,
          status: item.status,
        };
      })
    );

    const orderDate = order.orderDate.toLocaleDateString();
    const estimatedDeliveryDate = new Date(order.orderDate);
    estimatedDeliveryDate.setDate(estimatedDeliveryDate.getDate() + 7);

    res.render('user/order-success', {
      order,
      orderItems,
      orderDate,
      estimatedDeliveryDate: estimatedDeliveryDate.toLocaleDateString(),
      address: order.addressId,
    });
  } catch (error) {
    console.error('Error loading order success page:', error);
    res.status(500).render('user/error', { message: 'Internal Server Error' });
  }
};

//create razorpya for order
exports.createRazorpayOrder = async (req, res) => {
  try {
    const userId = req.session.user?.id;
    const { addressId, couponCode } = req.body;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }

    const cart = await Cart.findOne({ user: userId }).populate({
      path: 'items.product',
      match: { status: 'listed' },
    });

    if (!cart || cart.items.length === 0) {
      return res.status(400).json({ success: false, message: 'Cart is empty' });
    }

    cart.items = cart.items.filter(item => item.product);

    const address = await Address.findById(addressId);
    if (!address) {
      return res.status(400).json({ success: false, message: 'Invalid address' });
    }

    const items = await Promise.all(
      cart.items.map(async (item) => {
        const productDetails = await getProductWithOffers(item.product, userId);
        const variant = productDetails.variants.find(v => v.size === item.variant);
        if (!variant) {
          throw new Error(`Variant ${item.variant} not found for product ${productDetails.productName}`);
        }
        return {
          productId: productDetails._id,
          productName: productDetails.productName,
          variantSize: item.variant,
          quantity: item.quantity,
          originalPrice: variant.originalPrice,
          offerPrice: variant.offerPrice,
          finalItemTotal: variant.offerPrice * item.quantity,
          offerSavings: productDetails.hasOffer ? (variant.originalPrice - variant.offerPrice) * item.quantity : 0,
        };
      })
    );

    let coupon = null;
    if (couponCode) {
      coupon = await Coupon.findOne({ code: couponCode.trim(), isActive: true });
      if (!coupon) {
        return res.status(400).json({ success: false, message: 'Invalid or inactive coupon' });
      }
      if (coupon.expiryDate < new Date()) {
        return res.status(400).json({ success: false, message: 'Coupon expired' });
      }
      if (coupon.usedUsers.includes(userId)) {
        return res.status(400).json({ success: false, message: 'Coupon already used' });
      }
    }

    const orderData = { items, paymentMethod: 'RAZORPAY' };
    const updatedOrder = prepareOrderForSave(orderData, coupon);

    const subtotal = updatedOrder.items.reduce((sum, item) => sum + item.finalItemTotal, 0);
    const totalCouponDiscount = updatedOrder.totalCouponDiscount || 0;
    const finalTotal = subtotal - totalCouponDiscount;

    const newOrder = new Order({
      userId,
      addressId,
      items: updatedOrder.items,
      subtotal,
      couponCode: coupon ? coupon.code : null,
      totalCouponDiscount,
      finalTotal,
      paymentMethod: 'RAZORPAY',
      paymentStatus: 'Pending',
      status: 'Pending',
      deliveryStatus: 'Placed',
      orderDate: new Date(),
    });

    await newOrder.save();
    req.session.orderId = newOrder._id;

    const options = {
      amount: Math.round(finalTotal * 100),
      currency: 'INR',
      receipt: newOrder._id.toString(),
    };

    const razorpayOrder = await razorpay.orders.create(options).catch(err => {
      throw new Error(`Razorpay order creation failed: ${err.message}`);
    });

    newOrder.razorpayOrderId = razorpayOrder.id;
    await newOrder.save();

    res.json({
      success: true,
      razorpayOrder: {
        id: razorpayOrder.id,
        amount: razorpayOrder.amount,
        currency: razorpayOrder.currency,
      },
      orderId: newOrder._id,
    });
  } catch (err) {
    console.error('Error creating Razorpay order:', err);
    res.status(500).json({ success: false, message: err.message || 'Internal server error' });
  }
};

//verify razorpay for order
exports.verifyRazorpayPayment = async (req, res) => {
  try {
    const userId = req.session.user?.id;
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!userId || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ success: false, message: 'Missing required payment details' });
    }

    const generatedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    const order = await Order.findOne({ razorpayOrderId: razorpay_order_id });
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found', orderId: req.session.orderId });
    }

    if (generatedSignature !== razorpay_signature) {
      order.paymentStatus = 'Failed';
      order.status = 'Failed';
      await order.save();
      return res.status(400).json({ success: false, message: 'Invalid payment signature', orderId: order._id });
    }

    const payment = await razorpay.payments.fetch(razorpay_payment_id).catch(err => {
      throw new Error(`Failed to fetch payment details: ${err.message}`);
    });

    if (payment.status !== 'captured') {
      order.paymentStatus = 'Failed';
      order.status = 'Failed';
      await order.save();
      return res.status(400).json({ success: false, message: 'Payment not captured', orderId: order._id });
    }

    for (const item of order.items) {
      const product = await Product.findById(item.productId);
      if (!product) {
        throw new Error(`Product not found: ${item.productId}`);
      }

      const variantBefore = product.variants.find(v => v.size === item.variantSize);
      if (!variantBefore) {
        throw new Error(`Variant not found for size ${item.variantSize}`);
      }


      if (variantBefore.stock < item.quantity) {
        order.paymentStatus = 'Failed';
        order.status = 'Failed';
        await order.save();
        return res.status(400).json({ success: false, message: `Insufficient stock for ${product.productName} [Size: ${item.variantSize}]`, orderId: order._id });
      }

      const updatedProduct = await Product.findOneAndUpdate(
        { _id: item.productId },
        { $inc: { 'variants.$[elem].stock': -item.quantity } },
        { arrayFilters: [{ 'elem.size': item.variantSize }], new: true }
      );

    }

    order.paymentStatus = 'Completed';
    order.status = 'Paid';
    order.razorpayPaymentId = razorpay_payment_id;
    await order.save();

    if (order.couponCode) {
      const coupon = await Coupon.findOne({ code: order.couponCode });
      if (coupon && !coupon.usedUsers.includes(userId)) {
        coupon.usedUsers.push(userId);
        await coupon.save();
      }
    }

    const cart = await Cart.findOne({ user: userId });
    if (cart) {
      cart.items = [];
      await cart.save();
    }

    req.session.order = null;
    req.session.orderId = null;
    req.session.appliedCoupon = null;
    req.session.couponDiscount = 0;

    const io = req.app.get('io');
    io.emit('order-placed', { orderId: order._id });

    res.json({ success: true, message: 'Order placed successfully', orderId: order._id });
  } catch (error) {
    console.error('Error verifying Razorpay payment:', error.message || error);
    const order = await Order.findOne({ razorpayOrderId: razorpay_order_id });
    if (order) {
      order.paymentStatus = 'Failed';
      order.status = 'Failed';
      await order.save();
    }
    res.status(500).json({ success: false, message: error.message || 'Failed to verify payment', orderId: order?._id });
  }
};


//update order failed after order saved
exports.updateOrderFailed = async (req, res) => {
  try {
    const { orderId } = req.body;
    const userId = req.session.user?.id;

    if (!orderId || !userId) {
      return res.status(400).json({ success: false, message: 'Missing orderId or user not authenticated' });
    }

    const order = await Order.findById(orderId);
    if (!order || order.userId.toString() !== userId) {
      return res.status(404).json({ success: false, message: 'Order not found or unauthorized' });
    }

    order.paymentStatus = 'Failed';
    order.status = 'Failed';
    order.deliveryStatus='Failed';
    await order.save();

    const cart = await Cart.findOne({ user: userId });
    if (cart) {
      cart.items = [];
      await cart.save();
    }

    res.json({ success: true, message: 'Order status updated to Failed and cart cleared' });
  } catch (error) {
    console.error('Error updating order status:', error);
    res.status(500).json({ success: false, message: 'Failed to update order status' });
  }
};

//get order failure page
exports.renderOrderFailed = async (req, res) => {
  try {
    const { orderId } = req.params; 
    const userId = req.session.user?.id;

   

    const order = await Order.findById(orderId)
      .populate('items.productId')
      .populate('addressId');

    if (!order || order.userId.toString() !== userId) {
      return res.redirect('/home?error=Order+not+found+or+unauthorized');
    }

    const orderItems = order.items.map(item => ({
      productId: item.productId._id,
      productName: item.productName,
      variantSize: item.variantSize,
      quantity: item.quantity,
      offerPrice: item.offerPrice,
      originalPrice: item.originalPrice,
      finalItemTotal: item.finalItemTotal,
      couponDiscount: item.couponDiscount,
      status: item.status,
      image: item.productId.images?.[0]?.url || '/images/placeholder.jpg', 
    }));

    const address = {
      name: order.addressId.name,
      street: order.addressId.street,
      city: order.addressId.city,
      state: order.addressId.state,
      pinCode: order.addressId.pinCode,
      country: order.addressId.country,
      phone: order.addressId.phone,
    };

    const orderDate = order.orderDate.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' });
    const estimatedDeliveryDate = order.deliveryDate
      ? order.deliveryDate.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })
      : null;

    res.render('user/order-failed', {
      order,
      orderItems,
      address,
      orderDate,
      estimatedDeliveryDate,
    });
  } catch (error) {
    console.error('Error rendering order failure page:', error);
    res.redirect('/home?error=Failed+to+load+order+failure+page');
  }
};
