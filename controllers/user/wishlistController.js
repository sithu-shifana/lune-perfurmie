const Wishlist = require('../../models/wishlistSchema');
const Product = require('../../models/productSchema');
const Cart=require('../../models/cartSchema')

exports.getWishlist = async (req, res) => {
    try {

        const userId = req.session.user?.id;
        let wishlist = await Wishlist.findOne({ user: userId }) 
            .populate({
                path: 'items.product',
                match: { status: 'listed' },
                populate: [
                    { path: 'brand', match: { status: 'listed' } },
                    { path: 'category', match: { status: 'listed' } }
                ]
            });


        const wishlistWithOffers = { items: [] };
        if (wishlist && wishlist.items.length > 0) {
            for (let item of wishlist.items) {
                if (item.product) {
                    const productWithOffers = await Product.getProductWithOffers(item.product._id);
                    if (productWithOffers) {
                        wishlistWithOffers.items.push({
                            product: productWithOffers,
                            addedAt: item.addedAt
                        });
                    }
                }
            }
        }

        res.render('wishlist', { wishlist: wishlistWithOffers });
    } catch (error) {
        console.error('getWishlist - Error:', error);
        res.status(500).render('error', { message: 'Error loading wishlist' });
    }
};


exports.toggleWishlist = async (req, res) => {
  try {
    const productId = req.params.productId;
    const userId =req.session.user?.id ;

    let wishlist = await Wishlist.findOne({ user: userId });
    
    if (!wishlist) {
       wishlist = new Wishlist({
         user: userId,
         items: []
       });
    }

    const alreadyInWishlist = wishlist.items.some(
      item => item.product.toString() === productId
    );

    if (alreadyInWishlist) {
      wishlist.items = wishlist.items.filter(
        item => item.product.toString() !== productId
      );
    } else {
      wishlist.items.push({ product: productId });
    }

      await wishlist.save();

    return res.json({ success: true,isInWishlist: !alreadyInWishlist} );
  } catch (error) {
    console.error('toggleWishlist - Error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};



exports.removeFromWishlist = async (req, res) => {
  try {
    const { productId } = req.params;
    const userId = req.session.user?.id;

    const wishlist = await Wishlist.findOne({ user: userId });

    wishlist.items = wishlist.items.filter(item => item.product.toString() !== productId);
    await wishlist.save();

    res.json({ success: true, message: 'Product removed from wishlist' });

  } catch (err) {
    console.error('Error removing product from wishlist:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};


exports.addToCart = async (req, res) => {
  try {
    const userId =req.session.user?.id
    const { productId } = req.params;
    const { variant, quantity } = req.body;

   
    if (!variant) {
      return res.status(400).json({ success: false, message: 'Variant is required' });
    }

const product = await Product.findOne({ _id: productId, status: 'listed' })
  .populate({
    path: 'brand',
    match: { status: 'listed' },
    select: 'name _id'
  })
  .populate({
    path: 'category',
    match: { status: 'listed' },
    select: 'name _id'
  });
  
    //stock for selected variant
    const selectedVariant = product.variants.find(v => v.size === variant);
    if (!selectedVariant || selectedVariant.stock < quantity) {
      return res.status(400).json({ success: false, message: 'Selected variant is out of stock' });
    }

    let cart = await Cart.findOne({ user: userId });
    if (!cart) {
      cart = new Cart({ user: userId, items: [] });
    }

    const existingItem = cart.items.find(
      item => item.product.toString() === productId && item.variant === variant
    );

    if (existingItem) {
      existingItem.quantity += quantity;
    } else {
      cart.items.push({ 
        product: productId, 
        variant, 
        quantity,
      });
    }

    await cart.save();

    const wishlistUpdate = await Wishlist.updateOne(
      { user: userId },
      { $pull: { items: { product: productId } } }
    );

    const removedFromWishlist = wishlistUpdate.modifiedCount > 0;

    return res.json({ 
      success: true, 
      message: 'Item added to cart', 
      removedFromWishlist 
    });
  } catch (err) {
    console.error('Add to cart error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};