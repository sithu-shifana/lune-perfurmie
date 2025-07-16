const Cart = require('../../models/cartSchema');
const Product = require('../../models/productSchema');
const Wishlist = require('../../models/wishlistSchema');
const Offer = require('../../models/offerSchema');
const mongoose = require('mongoose'); // Add this import

const { getProductWithOffers } = require('../../helper/productHelper');

// Get cart page
exports.getCart = async (req, res) => {
  try {
    const userId = req.session.user?.id;
    const cart = await Cart.findOne({ user: userId }).populate('items.product');
    
    if (!cart || cart.items.length === 0) {
      return res.render('user/cart', {
        cartItems: [],
        totalPrice: 0,
        totalSavings: 0,
        subtotal: 0
      });
    }

    const cartItemsWithDetails = await Promise.all(
      cart.items.map(async (item) => {
        const productDetails = await getProductWithOffers(item.product, userId);
        const variant = productDetails.variants.find(v => v.size === item.variant);

        return {
          _id: item._id.toString(), // Use _id instead of id
          productId: productDetails._id,
          productName: productDetails.productName,
          image: productDetails.images[0]?.url || '',
          size: item.variant,
          quantity: item.quantity,
          originalPrice: variant.originalPrice,
          hasOffer: productDetails.hasOffer,
          offerPrice: variant.offerPrice,
          totalOriginal: variant.originalPrice * item.quantity,
          totalOffer: variant.offerPrice * item.quantity,
          saving: productDetails.hasOffer ? (variant.originalPrice - variant.offerPrice) : 0,
          totalSavings: productDetails.hasOffer ? (variant.originalPrice - variant.offerPrice) * item.quantity : 0,
          discountType: productDetails.discountType,
          discountValue: productDetails.discountValue,
          maxstock: variant.stock
        };
      })
    );

    const totalPrice = cartItemsWithDetails.reduce((acc, item) => acc + item.totalOriginal, 0);
    const subtotal = cartItemsWithDetails.reduce((acc, item) => acc + item.totalOffer, 0);
    const totalSavings = cartItemsWithDetails.reduce((acc, item) => acc + item.totalSavings, 0);

    res.render('user/cart', {
      cartItems: cartItemsWithDetails,
      totalPrice,
      totalSavings,
      subtotal
    });

  } catch (error) {
    console.error("Error loading cart:", error);
    res.status(500).send("Internal Server Error");
  }
};

exports.addToCart = async (req, res) => {
  try {
    const userId = req.session.user?.id;
    const { productId, size, quantity = 1 } = req.body;
    
    const productWithOffers = await getProductWithOffers(productId, userId);
    const variant = productWithOffers.variants.find(v => v.size === size);
    
    if (!variant) {
      return res.status(400).json({ 
        success: false, 
        message: 'Size not available' 
      });
    }

    let cart = await Cart.findOne({ user: userId });
    if (!cart) {
      cart = new Cart({ user: userId, items: [] });
    }

    const existingItem = cart.items.find(item => 
      item.product.toString() === productId && item.variant === size
    );

    if (existingItem) {
      const newQuantity = existingItem.quantity + parseInt(quantity);
      if (newQuantity > variant.stock) {
        return res.status(400).json({ 
          success: false, 
          message: `Cannot add more items. Maximum available: ${variant.stock}` 
        });
      }
      existingItem.quantity = newQuantity;
    } else {
      if (parseInt(quantity) > variant.stock) {
        return res.status(400).json({ 
          success: false, 
          message: `Cannot add items. Maximum available: ${variant.stock}` 
        });
      }
      cart.items.push({
        product: productId,
        variant: size, 
        quantity: parseInt(quantity)
      });
    }

    await cart.save();

    res.json({ 
      success: true, 
      message: 'Item added to cart successfully',
      cartCount: cart.items.reduce((sum, item) => sum + item.quantity, 0)
    });
  } catch (error) {
    console.error('addToCart - Error:', error);
    res.status(500).json({ success: false, message: 'Error adding item to cart' });
  }
};

exports.updateQuantity = async (req, res) => {
  try {
    const userId = req.session.user?.id;
    const { itemId, quantity } = req.body;

    console.log('updateQuantity called with:', { itemId, quantity, userId });

    // Validate input
    if (!itemId || !mongoose.Types.ObjectId.isValid(itemId)) {
      console.log('Invalid itemId:', itemId);
      return res.status(400).json({ success: false, message: 'Invalid item ID' });
    }
    
    const parsedQuantity = parseInt(quantity);
    if (isNaN(parsedQuantity) || parsedQuantity < 1) {
      return res.status(400).json({ success: false, message: 'Invalid quantity' });
    }

    // Find the cart of the user
    const cart = await Cart.findOne({ user: userId });
    if (!cart) {
      return res.status(404).json({ success: false, message: 'Cart not found' });
    }

    // Find the specific item in the cart using itemId (MongoDB ObjectId)
    const item = cart.items.find(i => i._id.toString() === itemId);
    if (!item) {
      console.log('Item not found. Available items:', cart.items.map(i => ({ 
        id: i._id.toString(), 
        product: i.product, 
        variant: i.variant 
      })));
      return res.status(404).json({ success: false, message: 'Item not found in cart' });
    }

    // Get product with offers
    const productWithOffers = await getProductWithOffers(item.product, userId);
    const selectedVariant = productWithOffers.variants.find(v => v.size === item.variant);

    if (!selectedVariant) {
      return res.status(400).json({ success: false, message: 'Size not available' });
    }

    // Check stock
    if (selectedVariant.stock < parsedQuantity) {
      return res.status(400).json({
        success: false,
        message: `Insufficient stock. Available: ${selectedVariant.stock}`
      });
    }

    // Update the quantity in the cart
    item.quantity = parsedQuantity;
    await cart.save();

    // Calculate totals
    const itemTotal = selectedVariant.offerPrice * parsedQuantity;
    const itemSavings = (selectedVariant.originalPrice - selectedVariant.offerPrice) * parsedQuantity;

    res.json({
      success: true,
      message: 'Quantity updated successfully',
      itemTotal,
      itemSavings,
      maxStock: selectedVariant.stock
    });
  } catch (error) {
    console.error('updateQuantity - Error:', error);
    res.status(500).json({ success: false, message: 'Error updating quantity' });
  }
};

exports.removeItem = async (req, res) => {
  try {
    const userId = req.session.user?.id;
    const { itemId } = req.params;
    
    console.log('removeItem called with:', { itemId, userId });
    
    if (!itemId || !mongoose.Types.ObjectId.isValid(itemId)) {
      return res.status(400).json({ success: false, message: 'Invalid item ID' });
    }
    
    const cart = await Cart.findOne({ user: userId });
    if (!cart) {
      return res.status(404).json({ success: false, message: 'Cart not found' });
    }
    
    const itemIndex = cart.items.findIndex(item => item._id.toString() === itemId);
    if (itemIndex === -1) {
      console.log('Item not found for removal. Available items:', cart.items.map(i => ({ 
        id: i._id.toString(), 
        product: i.product, 
        variant: i.variant 
      })));
      return res.status(404).json({ success: false, message: 'Item not found in cart' });
    }

    cart.items.splice(itemIndex, 1);
    await cart.save();

    res.json({
      success: true,
      message: 'Item removed from cart',
      remainingItems: cart.items.length
    });
  } catch (error) {
    console.error('removeItem - Error:', error);
    res.status(500).json({ success: false, message: 'Error removing item from cart' });
  }
};

exports.clearCart = async (req, res) => {
  try {
    const userId = req.session.user?.id;
    await Cart.findOneAndUpdate(
      { user: userId },
      { items: [] },
      { new: true }
    );

    res.json({ success: true, message: 'Cart cleared successfully' });
  } catch (error) {
    console.error('clearCart - Error:', error);
    res.status(500).json({ success: false, message: 'Error clearing cart' });
  }
};

exports.toggleCart = async (req, res) => {
  try {
    const userId = req.user?.id || req.session.user?.id;
    const { productId } = req.params;
    const { size, quantity = 1 } = req.body;

    const product = await Product.findById(productId).populate(['brand', 'category']);
    const selectedVariant = product.variants.find(v => v.size === size);
    
    // Check stock availability
    if (selectedVariant.stock < quantity) {
      return res.status(400).json({ 
        success: false, 
        message: `Only ${selectedVariant.stock} items available for size ${size}` 
      });
    }

    // Find or create cart
    let cart = await Cart.findOne({ user: userId });
    if (!cart) {
      cart = new Cart({ user: userId, items: [] });
    }

    const itemIndex = cart.items.findIndex(
      item => item.product.toString() === productId && item.variant === size
    );
    let isInCart = itemIndex > -1;

    if (isInCart) {
      cart.items.splice(itemIndex, 1);
    } else {
      cart.items.push({
        product: productId,
        variant: size,
        quantity,
        price: selectedVariant.offerPrice || selectedVariant.originalPrice,
      });
    }

    await cart.save();

    const cartCount = cart.items.reduce((sum, item) => sum + item.quantity, 0);

    res.json({
      success: true,
      isInCart: !isInCart,
      cartCount,
      message: isInCart ? 'Removed from cart' : 'Added to cart'
    });
  } catch (err) {
    console.error('Toggle cart error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

exports.checkCartStatus = async function (req, res) {
  try {
    const userId = req.session.user?.id;
    const { productId } = req.params;
    const { size } = req.query;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Please log in' });
    }

    if (!productId || !size) {
      return res.status(400).json({ success: false, message: 'Product ID and size are required' });
    }

    const cart = await Cart.findOne({ user: userId });
    const isInCart = cart && cart.items.some(
      (item) => item.product.toString() === productId && item.variant === size
    );

    const cartCount = cart ? cart.items.reduce((sum, item) => sum + item.quantity, 0) : 0;

    res.json({ success: true, isInCart, cartCount });
  } catch (error) {
    console.error('Check cart status error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};