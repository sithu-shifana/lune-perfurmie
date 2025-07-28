const Product = require('../../models/productSchema');
const Brand = require('../../models/brandSchema');
const Category = require('../../models/categorySchema');
const Offer = require('../../models/offerSchema');
const Order = require('../../models/orderSchema');
const Wishlist = require('../../models/wishlistSchema');
const Cart = require('../../models/cartSchema');
const mongoose = require('mongoose');

const {
  getProductsWithOffersAndWishlist,
  getFilterOptions
} = require('../../helper/filterProducts');
const { getProductWithOffers } = require('../../helper/productHelper');
const { getProductPageHelper } = require('../../helper/productPageHelper');
const NodeCache = require('node-cache');
const productCache = new NodeCache({ stdTTL: 600 }); // Match productHelper
const filterCache = new NodeCache({ stdTTL: 3600 }); // Match filterProducts

exports.getProductManagementPage = async (req, res) => {
  try {
    const search = (req.query.search || '').trim();
    const page = parseInt(req.query.page) || 1;
    const limit = 5;
    let query = {};

    if (search) {
      const flexibleRegex = search.replace(/\s+/g, '.*');
      query = {
        productName: { $regex: flexibleRegex, $options: 'i' },
      };
    }

    const listedBrands = await Brand.find({ status: 'listed' }).distinct('_id');
    const listedCategories = await Category.find({ status: 'listed' }).distinct('_id');

    const totalProducts = await Product.countDocuments({
      ...query,
      brand: { $in: listedBrands },
      category: { $in: listedCategories },
    });

    if (page < 1 || (totalProducts > 0 && page > Math.ceil(totalProducts / limit))) {
      return res.status(404).render('404', { message: 'Invalid page number' });
    }

    const products = await Product.find({
      ...query,
      brand: { $in: listedBrands },
      category: { $in: listedCategories },
    })
      .populate({
        path: 'brand',
        match: { status: 'listed' },
        select: 'name',
      })
      .populate({
        path: 'category',
        match: { status: 'listed' },
        select: 'name',
      })
      .skip((page - 1) * limit)
      .limit(limit)
      .sort({ createdAt: -1 });

    const filteredProducts = products.filter((product) => product.brand && product.category);

    const productsWithOffers = [];
    for (const product of filteredProducts) {
      try {
        const productWithOffer = await getProductPageHelper(product._id);
        if (productWithOffer) {
          productsWithOffers.push(productWithOffer);
        } else {
          console.warn(`Product ${product._id} skipped (unlisted or invalid)`);
        }
      } catch (error) {
        productsWithOffers.push({
          _id: product._id,
          productName: product.productName,
          description: product.description,
          brand: product.brand,
          category: product.category,
          images: product.images,
          variants: product.variants.map((variant) => ({
            size: variant.size,
            stock: variant.stock,
            soldCount: variant.soldCount,
            originalPrice: variant.originalPrice,
            offerPrice: variant.originalPrice,
            discount: 0,
            discountType: null,
            hasOffer: false,
            offerName: null,
          })),
          status: product.status,
        });
      }
    }

    res.render('admin/products/productManagement', {
      totalProducts,
      products: productsWithOffers.filter((product) => product !== null), // Ensure no null products
      search,
      currentPage: page,
      totalPages: Math.ceil(totalProducts / limit) || 1,
      limit,
    });
  } catch (error) {
    console.error('Error fetching products:', error.message, error.stack);
    res.status(500).render('404', { message: 'Error loading product management page' });
  }
};

exports.getaddProductPage = async (req, res) => {
  try {
    const brands = await Brand.find({ status: 'listed' });
    const categories = await Category.find({ status: 'listed' });
     
    res.render('admin/products/product-add', {
      brands,
      categories,
    });
  } catch (error) {
    console.error('Error fetching brands or categories in product add page:', error.message);
  }
};

exports.addProduct = async (req, res) => {
  try {
    const {
      productName,
      description,
      brand,
      category,
      fragranceType,
      variants
    } = req.body;

    const images = req.processedImages.map(img => ({
      url: img.url,
      publicId: img.publicId
    }));

    const formattedVariants = variants.map(variant => ({
      size: variant.size,
      stock: Number(variant.stock) || 0,
      originalPrice: Number(variant.originalPrice) || 0,
      offerPrice: Number(variant.originalPrice) || 0
    }));

    const newProduct = new Product({
      productName: productName.trim(),
      description: description.trim(),
      brand: new mongoose.Types.ObjectId(brand),
      category: new mongoose.Types.ObjectId(category),
      fragranceType: fragranceType || '',
      variants: formattedVariants,
      images
    });

    await newProduct.save();
    
    res.redirect('/admin/productManagement');
    
  } catch (error) {
    console.error('Product Adding error:', error);
    
    const brands = await Brand.find({ status: 'listed' });
    const categories = await Category.find({ status: 'listed' });
    
    return res.status(500).render('admin/product-add', {
      errors: { general: 'Error adding perfume. Please try again.' },
      oldInput: {
        ...req.body,
        variants: req.body.variants || [
          { size: '50ml', originalPrice: '', stock: '0' },
          { size: '100ml', originalPrice: '', stock: '0' },
          { size: '150ml', originalPrice: '', stock: '0' },
          { size: '200ml', originalPrice: '', stock: '0' }
        ]
      },
      brands,
      categories
    });
  }
};

exports.showEditProductForm = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id)
      .populate('brand', 'name')
      .populate('category', 'name');
    const brands = await Brand.find({ status: 'listed' });
    const categories = await Category.find({ status: 'listed' });

    const oldInput = {
      productName: product.productName,
      description: product.description,
      brand: product.brand._id.toString(),
      category: product.category._id.toString(),
      fragranceType: product.fragranceType || '', // Changed from color to fragranceType
      variants: product.variants.map(variant => ({
        size: variant.size,
        originalPrice: variant.originalPrice.toString(),
        stock: variant.stock.toString(),
      }))
    };

    res.render('admin/products/product-edit', {
      product,
      brands,
      categories,
      errors: {},
      oldInput
    });
  } catch (error) {
    console.error('Error fetching product for edit:', error.message);
    res.status(500).render('admin/pageNotFound', {
      message: 'Error loading edit product form',
      error: error.message
    });
  }
};

exports.updateProduct = async (req, res) => {
  try {
    const productId = req.params.id;
    const {
      productName,
      description,
      brand,
      category,
      fragranceType,
      variants
    } = req.body;

    // Format variants
    const formattedVariants = variants.map(variant => ({
      size: variant.size,
      stock: Number(variant.stock) || 0,
      originalPrice: Number(variant.originalPrice) || 0,
      offerPrice: Number(variant.originalPrice) || 0
    }));

    // Update product
    console.time('updateProduct');
    const updatedProduct = await Product.findByIdAndUpdate(
      productId,
      {
        productName: productName.trim(),
        description: description.trim(),
        brand: new mongoose.Types.ObjectId(brand),
        category: new mongoose.Types.ObjectId(category),
        fragranceType: fragranceType || '',
        variants: formattedVariants,
        images: req.processedImages?.length > 0
          ? req.processedImages.map(img => ({
              url: img.url,
              publicId: img.publicId
            }))
          : undefined
      },
      { new: true, runValidators: true, readPreference: 'primary' }
    ).populate('brand', 'name').populate('category', 'name');
    console.timeEnd('updateProduct');

    if (!updatedProduct) {
      throw new Error('Failed to update product');
    }

    // Invalidate product cache for all user variations
    productCache.keys().forEach(key => {
      if (key.startsWith(`product_${productId}_`)) {
        productCache.del(key);
      }
    });

    // Invalidate filter cache
    const existingProduct = await Product.findById(productId).lean();
    if (existingProduct?.brand.toString() !== brand || existingProduct?.category.toString() !== category) {
      filterCache.del('filterOptions');
    }

    // Explicitly clear cache for anonymous users
    productCache.del(`product_${productId}_no-user`); // Clear for non-logged-in users
    // Add more specific user IDs if needed, e.g., productCache.del(`product_${productId}_${userId}`);

    res.redirect('/admin/productManagement');
  } catch (error) {
    console.error('Product update error:', error);

    const [brands, categories, existingProduct] = await Promise.all([
      Brand.find({ status: 'listed' }).lean().read('primary'),
      Category.find({ status: 'listed' }).lean().read('primary'),
      Product.findById(productId).populate('brand', 'name').populate('category', 'name').lean().read('primary')
    ]);

    const oldInput = {
      productName: req.body.productName,
      description: req.body.description,
      brand: req.body.brand,
      category: req.body.category,
      fragranceType: req.body.fragranceType || '',
      variants: req.body.variants || [
        { size: '50ml', originalPrice: '', stock: '0' },
        { size: '100ml', originalPrice: '', stock: '0' },
        { size: '150ml', originalPrice: '', stock: '0' },
        { size: '200ml', originalPrice: '', stock: '0' }
      ]
    };

    res.status(500).render('admin/products/product-edit', {
      product: existingProduct,
      brands,
      categories,
      errors: { general: 'Error updating product. Please try again.' },
      oldInput,
      layout: 'layouts/admin'
    });
  }
};

exports.getProductDetails = async (req, res) => {
  try {
    const productId = req.params.id;
    
    const product = await getProductWithOffers(productId);
    

    const totalBuyers = await Order.distinct('user', {
      'items.product': productId,
      orderStatus: { $in: ['delivered', 'shipped', 'processing'] }
    }).then(users => users.length);

    
    const totalUserWishlist = await Wishlist.countDocuments({
      'items.product': productId
    });

    const totalUserCart = await Cart.countDocuments({
      'items.product': productId
    });

    const salesData = await Order.aggregate([
      {
        $match: {
          orderStatus: { $in: ['delivered', 'shipped', 'processing'] },
          'items.product': new mongoose.Types.ObjectId(productId)
        }
      },
      {
        $unwind: '$items'
      },
      {
        $match: {
          'items.product': new mongoose.Types.ObjectId(productId)
        }
      },
      {
        $group: {
          _id: null,
          totalUnitsSold: { $sum: '$items.quantity' },
          totalRevenue: { $sum: { $multiply: ['$items.quantity', '$items.price'] } }
        }
      }
    ]);

    const totalUnitsSold = salesData.length > 0 ? salesData[0].totalUnitsSold : 0;
    const totalRevenue = salesData.length > 0 ? salesData[0].totalRevenue : 0;

    res.render('admin/products/product-detail', {
      product,
      totalBuyers,
      totalUserWishlist,
      totalUserCart,
      totalUnitsSold,
      totalRevenue
    });

  } catch (error) {
    console.log('Error in getProductDetails:', error);
    res.status(500).render('admin/error', { 
      message: 'An error occurred while fetching product details' 
    });
  }
};

exports.toggleProducts = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    product.status = product.status === 'listed' ? 'unlisted' : 'listed';
    await product.save();

    if (product.status === 'unlisted') {
      await Cart.updateMany({}, {
        $pull: { items: { product: product._id } }
      });

      await Wishlist.updateMany({}, {
        $pull: { items: { product: product._id } }
      });
    }

    const io = req.app.get('io');
    io.emit('product-toggled', {
      productId: product._id,
      newStatus: product.status
    });

    res.json({
      success: true,
      status: product.status,
      message: `Product successfully ${product.status}`
    });

  } catch (error) {
    console.error('Error toggling Product status:', error);
    return res.status(500).json({ 
      success: false,
      error: 'Server error' 
    });
  }
};