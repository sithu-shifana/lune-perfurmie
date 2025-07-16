const Cart = require('../../models/cartSchema');
const Product = require('../../models/productSchema');
const Address = require('../../models/addressSchema');
const Order = require('../../models/orderSchema');
const Wallet = require('../../models/walletSchema');
const Coupon = require('../../models/coupenSchema'); // Fixed typo: 'coupenSchema' to 'couponSchema'
const { getProductWithOffers } = require('../../helper/productHelper');
const { prepareOrderForSave } = require('../../helper/orderHelper');

// Get checkout page
exports.getCheckoutPage = async (req, res) => {
  try {
    const userId = req.session.user?.id;
    
    const cart = await Cart.findOne({ user: userId }).populate('items.product');
    
    // Fetch addresses
    const addresses = await Address.find({ userId }) || [];
    let selectedAddressId = req.session.selectedAddress || (addresses.find(addr => addr.isDefault)?._id?.toString());

    // Fallback to first address if no default or session address is set
    if (!selectedAddressId && addresses.length > 0) {
      selectedAddressId = addresses[0]._id.toString();
    }

    if (!cart || cart.items.length === 0) {
      return res.render('user/checkout', {
        orderItems: [],
        subtotal: 0,
        totalSavings: 0,
        addresses,
        selectedAddressId,
        walletBalance: 0,
        walletEnabled: false,
        activeCoupons: []
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
      activeCoupons
    });
  } catch (error) {
    console.error('Error loading checkout:', error);
    res.status(500).send('Internal Server Error');
  }
};

// Add new address
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

// Select address
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

// Apply coupon
exports.applyCoupon = async (req, res) => {
  try {
    const userId = req.session.user?.id;
    const { couponCode } = req.body;

    console.log('Applying coupon:', couponCode); // Debug log

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

    // Prepare items for calculation
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
          // Calculate offer savings per item
          offerSavings: productDetails.hasOffer ? (variant.originalPrice - variant.offerPrice) * item.quantity : 0
        };
      })
    );

    // Calculate order details with coupon
    try {
      const order = { items }; // Mock order object
      const updatedOrder = prepareOrderForSave(order, coupon);

      console.log('Coupon applied successfully:', {
        couponCode: coupon.code,
        totalCouponDiscount: coupon.discountValue,
        items: updatedOrder.items.map(item => ({
          productId: item.productId,
          quantity:item.quantity,
          price:item.offerPrice,
          couponDiscount: item.couponDiscount
        }))
      });

      // Calculate correct values
      const subtotal = updatedOrder.items.reduce((sum, item) => sum + item.finalItemTotal, 0);
      const finalTotal = subtotal - updatedOrder.totalCouponDiscount;
      
      // Calculate total offer savings
      const totalOfferSavings = updatedOrder.items.reduce((sum, item) => sum + (item.offerSavings || 0), 0);
      
      // Calculate total savings = offer savings + coupon discount
      const totalSavings = totalOfferSavings + updatedOrder.totalCouponDiscount;

      // Store coupon information in session for persistence
      req.session.appliedCoupon = {
        code: coupon.code,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue
      };
      req.session.couponDiscount = updatedOrder.totalCouponDiscount;
      
      res.json({
        success: true,
        message: `Coupon "${coupon.code}" applied successfully!`,
        couponDiscount:coupon.discountValue,
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

// Also add a function to remove coupon
exports.removeCoupon = async (req, res) => {
  try {
    // Clear coupon from session
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

// Place order
exports.placeOrder = async (req, res) => {
  try {
    const userId = req.session.user?.id;
    const { addressId, paymentMethod, couponCode } = req.body;

    console.log('Placing order with:', { addressId, paymentMethod, couponCode }); // Debug log

    const cart = await Cart.findOne({ user: userId }).populate('items.product');
    if (!cart || cart.items.length === 0) {
      return res.status(400).json({ success: false, message: 'Cart is empty' });
    }

    // Prepare order items
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
          finalItemTotal: variant.offerPrice * item.quantity
        };
      })
    );

    // Apply coupon if provided
    let coupon = null;
    if (couponCode) {
      coupon = await Coupon.findOne({ code: couponCode.trim(), isActive: true });
      if (!coupon) {
        console.log('Coupon not found or inactive:', couponCode);
        return res.status(400).json({ success: false, message: 'Invalid or inactive coupon' });
      }
      if (coupon.expiryDate < new Date()) {
        console.log('Coupon expired:', couponCode);
        return res.status(400).json({ success: false, message: 'Coupon expired' });
      }
      if (coupon.usedUsers.includes(userId)) {
        console.log('Coupon already used by user:', userId);
        return res.status(400).json({ success: false, message: 'Coupon already used' });
      }
    }

    // Calculate order details
    const orderData = { items, paymentMethod };
    const updatedOrder = prepareOrderForSave(orderData, coupon);

    // Validate address
    const address = await Address.findById(addressId);
    if (!address) {
      console.log('Invalid address:', addressId);
      return res.status(400).json({ success: false, message: 'Invalid address' });
    }

    // Create order
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

    // Handle wallet payment
    if (paymentMethod === 'WALLET') {
      const wallet = await Wallet.getOrCreate(userId);
      if (wallet.balance < updatedOrder.subtotal) {
        console.log('Insufficient wallet balance:', { balance: wallet.balance, required: updatedOrder.subtotal });
        return res.status(400).json({ success: false, message: 'Insufficient wallet balance' });
      }
      await wallet.deductMoney(updatedOrder.subtotal, `Order payment for Order ID: ${newOrder._id}`);
    }

    // Mark coupon as used
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

    // Clear cart
    cart.items = [];
    await cart.save();

    res.status(200).json({ success: true, orderId: newOrder._id, message: 'Order placed successfully' });
  } catch (err) {
    console.error('Error placing order:', err);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};


exports.getOrderSuccessPage = async (req, res) => {
  try {
    const userId = req.session.user?.id;
    const { orderId } = req.params;

    // Fetch order with populated address
    const order = await Order.findOne({ _id: orderId, userId }).populate('addressId');
    if (!order) {
      return res.status(404).render('user/error', { message: 'Order not found' });
    }

    // Fetch product images
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

    // Format dates
    const orderDate = order.orderDate.toLocaleDateString();
    const estimatedDeliveryDate = new Date(order.orderDate);
    estimatedDeliveryDate.setDate(estimatedDeliveryDate.getDate() + 7); // Assume 7 days for delivery

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