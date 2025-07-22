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
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

// getCheckoutPage (unchanged)
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

    // Fetch addresses
    const addresses = await Address.find({ userId }) || [];
    let selectedAddressId = req.session.selectedAddress || (addresses.find(addr => addr.isDefault)?._id?.toString());

    // Fallback to first address if no default or session address is set
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
        codAvailable: false, // COD disabled for empty cart
        activeCoupons: [],
        RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID
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
          Saving: productDetails.hasOffer ? (variant.originalPrice - variant.offerPrice) * item.quantity : 0
        };
      })
    );

    const total = orderItems.reduce((acc, item) => acc + item.totalPrice, 0);
    const subtotal = orderItems.reduce((acc, item) => acc + item.totalOffer, 0);
    const totalSavings = orderItems.reduce((acc, item) => acc + item.Saving, 0);

    // Fetch wallet balance
    const wallet = await Wallet.findOne({ user: userId });
    const walletBalance = wallet ? wallet.balance : 0;
    const walletEnabled = walletBalance >= subtotal;

    // Determine if COD is available (disabled if subtotal < 10000)
    const codAvailable = subtotal >= 10000;

    // Fetch active coupons
    const activeCoupons = await Coupon.find({
      isActive: true,
      expiryDate: { $gt: new Date() },
      usedUsers: { $ne: userId }
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
      RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID
    });
  } catch (error) {
    console.error('Error loading checkout:', error);
    res.status(500).send('Internal Server Error');
  }
};

// addAddress (unchanged)
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
      country: 'India'
    });

    const savedAddress = await newAddress.save();
    req.session.selectedAddress = savedAddress._id.toString();

    res.status(200).json({ success: true, message: 'Address saved successfully' });
  } catch (error) {
    console.error('Error saving address:', error);
    res.status(500).json({ success: false, message: 'Failed to save address' });
  }
};

// selectAddress (unchanged)
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
    console.error('Error selecting address:', error);
    res.status(500).json({ success: false, message: 'Failed to select address' });
  }
};

// applyCoupon (unchanged)
exports.applyCoupon = async (req, res) => {
  try {
    const userId = req.session.user?.id;
    const { couponCode } = req.body;

    console.log('Applying coupon:', couponCode);

    const cart = await Cart.findOne({ user: userId }).populate('items.product');
    if (!cart || cart.items.length === 0) {
      return res.json({ success: false, message: 'Cart is empty.' });
    }

    const coupon = await Coupon.findOne({ code: couponCode.trim(), isActive: true });
    if (!coupon) {
      console.log('Coupon not found or inactive:', couponCode);
      return res.json({ success: false, message: 'Invalid or inactive coupon.' });
    }
    if (coupon.expiryDate < new Date()) {
      console.log('Coupon expired:', couponCode);
      return res.json({ success: false, message: 'Coupon expired.' });
    }
    if (coupon.usedUsers.includes(userId)) {
      console.log('Coupon already used by user:', userId);
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
          offerSavings: productDetails.hasOffer ? (variant.originalPrice - variant.offerPrice) * item.quantity : 0
        };
      })
    );

    try {
      const order = { items };
      const updatedOrder = prepareOrderForSave(order, coupon);

      console.log('Coupon applied successfully:', {
        couponCode: coupon.code,
        totalCouponDiscount: coupon.discountValue,
        items: updatedOrder.items.map(item => ({
          productId: item.productId,
          quantity: item.quantity,
          price: item.offerPrice,
          couponDiscount: item.couponDiscount
        }))
      });

      const subtotal = updatedOrder.items.reduce((sum, item) => sum + item.finalItemTotal, 0);
      const finalTotal = subtotal - updatedOrder.totalCouponDiscount;
      const totalOfferSavings = updatedOrder.items.reduce((sum, item) => sum + (item.offerSavings || 0), 0);
      const totalSavings = totalOfferSavings + updatedOrder.totalCouponDiscount;

      req.session.appliedCoupon = {
        code: coupon.code,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue
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
          offerSavings: item.offerSavings || 0
        }))
      });
    } catch (error) {
      console.error('Error in prepareOrderForSave:', error.message);
      return res.json({ success: false, message: error.message });
    }
  } catch (err) {
    console.error('Error applying coupon:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// removeCoupon (unchanged)
exports.removeCoupon = async (req, res) => {
  try {
    req.session.appliedCoupon = null;
    req.session.couponDiscount = 0;

    res.json({
      success: true,
      message: 'Coupon removed successfully!'
    });
  } catch (error) {
    console.error('Error removing coupon:', error);
    res.status(500).json({ success: false, message: 'Error removing coupon' });
  }
};

exports.placeOrder = async (req, res) => {
  try {
    const userId = req.session.user?.id;
    const { addressId, paymentMethod, couponCode } = req.body;

    console.log('Placing order with:', { addressId, paymentMethod, couponCode });

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

        // ✅ Log before stock
        console.log(`Before stock for ${productDetails.productName} [Size: ${item.variant}]:`, variantBefore.stock);

        // ❗ Optional: Check stock availability
        if (variantBefore.stock < item.quantity) {
          throw new Error(`Insufficient stock for ${productDetails.productName} [Size: ${item.variant}]`);
        }

        // ✅ Reduce stock
        const updatedProduct = await Product.findOneAndUpdate(
          { _id: item.product },
          {
            $inc: { 'variants.$[elem].stock': -item.quantity }
          },
          {
            arrayFilters: [{ 'elem.size': item.variant }],
            new: true
          }
        );

        if (!updatedProduct) {
          throw new Error(`Failed to update stock for product ${item.product}`);
        }

        const variantAfter = updatedProduct.variants.find(v => v.size === item.variant);
        console.log(`After stock for ${updatedProduct.productName} [Size: ${item.variant}]:`, variantAfter?.stock);

        return {
          productId: updatedProduct._id,
          productName: updatedProduct.productName,
          variantSize: item.variant,
          quantity: item.quantity,
          originalPrice: variantBefore.originalPrice,
          offerPrice: variantBefore.offerPrice,
          finalItemTotal: variantBefore.offerPrice * item.quantity,
          couponDiscount: 0 // default, updated later
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
      deliveryStatus: 'Placed'
    });

    if (paymentMethod === 'WALLET') {
      const wallet = await Wallet.getOrCreate(userId);
      if (wallet.balance < updatedOrder.subtotal) {
        return res.status(400).json({ success: false, message: 'Insufficient wallet balance' });
      }
      await wallet.deductMoney(updatedOrder.subtotal,
         `Order payment for Order ID: #${newOrder._id.toString().slice(-8).toUpperCase()}`
        );
    }


    if (coupon) {
      coupon.usedUsers.push(userId);
      await coupon.save();
      console.log('Coupon marked as used:', coupon.code);
    }

    await newOrder.save();
    console.log('Order saved:', {
      orderId: newOrder._id,
      couponCode: newOrder.couponCode,
      totalCouponDiscount: newOrder.totalCouponDiscount,
      items: newOrder.items.map(item => ({
        productId: item.productId,
        couponDiscount: item.couponDiscount
      }))
    });

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
          status: item.status
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
      address: order.addressId
    });
  } catch (error) {
    console.error('Error loading order success page:', error);
    res.status(500).render('user/error', { message: 'Internal Server Error' });
  }
};

// createRazorpayOrder (fixed)
exports.createRazorpayOrder = async (req, res) => {
  try {
    const userId = req.session.user?.id;
    const { addressId, couponCode } = req.body;

    console.log('Creating Razorpay order with:', { addressId, couponCode });

    // Validate user
    if (!userId) {
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }

    // Fetch and validate cart
    const cart = await Cart.findOne({ user: userId }).populate({
      path: 'items.product',
      match: { status: 'listed' },
    });

    if (!cart || cart.items.length === 0) {
      return res.redirect('/cart');
    }

    cart.items = cart.items.filter(item => item.product);

    // Validate address
    const address = await Address.findById(addressId); // Fixed typo: cofnst -> const
    if (!address) {
      return res.status(400).json({ success: false, message: 'Invalid address' });
    }

    // Prepare order items
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

    // Validate coupon if provided
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

    // Prepare order data
    const orderData = { items, paymentMethod: 'RAZORPAY' };
    const updatedOrder = prepareOrderForSave(orderData, coupon);

    const subtotal = updatedOrder.items.reduce((sum, item) => sum + item.finalItemTotal, 0);
    const totalCouponDiscount = updatedOrder.totalCouponDiscount || 0;
    const finalTotal = subtotal - totalCouponDiscount;

    // Store order data in session
    req.session.order = {
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
    };

    // Create Razorpay order
    const options = {
      amount: Math.round(finalTotal * 100), // Convert to paise
      currency: 'INR',
      receipt: `receipt_order_${Math.floor(Math.random() * 1000000)}`,
    };

    const razorpayOrder = await razorpay.orders.create(options).catch(err => {
      throw new Error(`Razorpay order creation failed: ${err.message}`);
    });

    res.json({
      success: true,
      razorpayOrder: {
        id: razorpayOrder.id,
        amount: razorpayOrder.amount,
        currency: razorpayOrder.currency,
      },
    });
  } catch (err) {
    console.error('Error creating Razorpay order:', err);
    res.status(500).json({ success: false, message: err.message || 'Internal server error' });
  }
};


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

    if (generatedSignature !== razorpay_signature) {
      return res.status(400).json({ success: false, message: 'Invalid payment signature' });
    }

    const payment = await razorpay.payments.fetch(razorpay_payment_id).catch(err => {
      throw new Error(`Failed to fetch payment details: ${err.message}`);
    });

    if (payment.status !== 'captured') {
      return res.status(400).json({ success: false, message: 'Payment not captured' });
    }

    const orderData = req.session.order;
    if (
      !orderData ||
      !orderData.items ||
      !orderData.subtotal ||
      !orderData.addressId ||
      orderData.paymentMethod !== 'RAZORPAY'
    ) {
      return res.status(400).json({ success: false, message: 'Invalid or missing order details in session' });
    }

    const address = await Address.findById(orderData.addressId);
    if (!address) {
      return res.status(400).json({ success: false, message: 'Invalid address' });
    }

    // ✅ STOCK REDUCTION SECTION
    for (const item of orderData.items) {
      const product = await Product.findById(item.productId);

      if (!product) {
        throw new Error(`Product not found: ${item.productId}`);
      }

      const variantBefore = product.variants.find(v => v.size === item.variantSize);
      if (!variantBefore) {
        throw new Error(`Variant not found for size ${item.variantSize}`);
      }

      console.log(`Before stock for ${product.productName} [Size: ${item.variantSize}]:`, variantBefore.stock);

      if (variantBefore.stock < item.quantity) {
        throw new Error(`Insufficient stock for ${product.productName} [Size: ${item.variantSize}]`);
      }

      const updatedProduct = await Product.findOneAndUpdate(
        { _id: item.productId },
        {
          $inc: { 'variants.$[elem].stock': -item.quantity }
        },
        {
          arrayFilters: [{ 'elem.size': item.variantSize }],
          new: true
        }
      );

      const variantAfter = updatedProduct.variants.find(v => v.size === item.variantSize);
      console.log(`After stock for ${product.productName} [Size: ${item.variantSize}]:`, variantAfter?.stock);
    }

    // ✅ CREATE ORDER
    const newOrder = new Order({
      userId,
      addressId: orderData.addressId,
      items: orderData.items,
      subtotal: orderData.subtotal,
      couponCode: orderData.couponCode || null,
      totalCouponDiscount: orderData.totalCouponDiscount || 0,
      finalTotal: orderData.finalTotal,
      paymentMethod: 'RAZORPAY',
      paymentStatus: 'Completed',
      status: 'Paid',
      deliveryStatus: 'Placed',
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
    });

    await newOrder.save();

    if (orderData.couponCode) {
      const coupon = await Coupon.findOne({ code: orderData.couponCode });
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
    req.session.appliedCoupon = null;
    req.session.couponDiscount = 0;

    const io = req.app.get('io');
    io.emit('order-placed', { orderId: newOrder._id });

    res.json({ success: true, message: 'Order placed successfully', orderId: newOrder._id });
  } catch (error) {
    console.error('Error verifying Razorpay payment:', error.message || error);
    res.status(500).json({ success: false, message: error.message || 'Failed to verify payment' });
  }
};
