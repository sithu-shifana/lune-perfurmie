const Product = require('../../models/productSchema');
const Brand = require('../../models/brandSchema');
const Category = require('../../models/categorySchema');
const Offer = require('../../models/offerSchema');
const Order = require('../../models/orderSchema');
const Wishlist = require('../../models/wishlistSchema');
const Cart = require('../../models/cartSchema');
const mongoose = require('mongoose');
const { getProductsWithOffersAndWishlist, getFilterOptions } = require('../../helper/filterProducts');
const { getProductWithOffers } = require('../../helper/productHelper');
const { getProductPageHelper } = require('../../helper/productPageHelper');
const { productCache, filterCache } = require('../../helper/cache');

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

    console.time('fetchBrandsCategories');
    const listedBrands = await Brand.find({ status: 'listed' }).distinct('_id').read('primary');
    const listedCategories = await Category.find({ status: 'listed' }).distinct('_id').read('primary');
    console.timeEnd('fetchBrandsCategories');

    console.time('countProducts');
    const totalProducts = await Product.countDocuments({
      ...query,
      brand: { $in: listedBrands },
      category: { $in: listedCategories },
    });
    console.timeEnd('countProducts');

    if (page < 1 || (totalProducts > 0 && page > Math.ceil(totalProducts / limit))) {
      return res.status(404).render('404', { message: 'Invalid page number' });
    }

    console.time('fetchProducts');
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
      .sort({ createdAt: -1 })
      .read('primary');
    console.timeEnd('fetchProducts');

    const filteredProducts = products.filter((product) => product.brand && product.category);

    console.time('applyOffers');
    const productsWithOffers = await Promise.all(
      filteredProducts.map(async (product) => {
        try {
          const productWithOffer = await getProductPageHelper(product._id);
          return productWithOffer;
        } catch (error) {
          console.warn(`Product ${product._id} skipped: ${error.message}`);
          return {
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
          };
        }
      })
    );
    console.timeEnd('applyOffers');

    res.render('admin/products/productManagement', {
      totalProducts,
      products: productsWithOffers.filter((product) => product !== null),
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
    console.time('fetchAddPageData');
    const brands = await Brand.find({ status: 'listed' }).read('primary');
    const categories = await Category.find({ status: 'listed' }).read('primary');
    console.timeEnd('fetchAddPageData');
     
    res.render('admin/products/product-add', {
      brands,
      categories,
    });
  } catch (error) {
    console.error('Error fetching brands or categories in product add page:', error.message);
    res.status(500).render('404', { message: 'Error loading add product page' });
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

    console.time('addProduct');
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
    console.timeEnd('addProduct');
    
    res.redirect('/admin/productManagement');
    
  } catch (error) {
    console.error('Product Adding error:', error);
    
    const brands = await Brand.find({ status: 'listed' }).read('primary');
    const categories = await Category.find({ status: 'listed' }).read('primary');
    
    return res.status(500).render('admin/products/product-add', {
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
    console.time('fetchEditProduct');
    const product = await Product.findById(req.params.id)
      .populate('brand', 'name')
      .populate('category', 'name')
      .read('primary');
    const brands = await Brand.find({ status: 'listed' }).read('primary');
    const categories = await Category.find({ status: 'listed' }).read('primary');
    console.timeEnd('fetchEditProduct');

    const oldInput = {
      productName: product.productName,
      description: product.description,
      brand: product.brand._id.toString(),
      category: product.category._id.toString(),
      fragranceType: product.fragranceType || '',
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

    // Invalidate product cache
    console.log(`Invalidating cache for product_${productId}`);
    const cacheKeys = productCache.keys();
    const keysDeleted = [];
    cacheKeys.forEach(key => {
      if (key.startsWith(`product_${productId}_`)) {
        productCache.del(key);
        keysDeleted.push(key);
      }
    });
    productCache.del(`product_${productId}_no-user`);
    keysDeleted.push(`product_${productId}_no-user`);
    console.log(`Cleared cache keys: ${keysDeleted.join(', ') || 'none'}`);

    // Invalidate filter cache
    console.time('fetchExistingProduct');
    const existingProduct = await Product.findById(productId).lean().read('primary');
    console.timeEnd('fetchExistingProduct');
    if (existingProduct?.brand.toString() !== brand || existingProduct?.category.toString() !== category) {
      filterCache.del('filterOptions');
      console.log('Cleared filterOptions cache');
    }

    res.redirect('/admin/productManagement');
  } catch (error) {
    console.error('Product update error:', error);

    console.time('fetchErrorData');
    const [brands, categories, existingProduct] = await Promise.all([
      Brand.find({ status: 'listed' }).lean().read('primary'),
      Category.find({ status: 'listed' }).lean().read('primary'),
      Product.findById(productId).populate('brand', 'name').populate('category', 'name').lean().read('primary')
    ]);
    console.timeEnd('fetchErrorData');

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
    
    console.time(`getProductDetails:${productId}`);
    const product = await getProductWithOffers(productId);
    console.timeEnd(`getProductDetails:${productId}`);

    if (!product) {
      return res.status(404).render('admin/error', { message: 'Product not found' });
    }

    console.time(`fetchOrderStats:${productId}`);
    const totalBuyers = await Order.distinct('user', {
      'items.product': productId,
      orderStatus: { $in: ['delivered', 'shipped', 'processing'] }
    }).read('primary').then(users => users.length);

    const totalUserWishlist = await Wishlist.countDocuments({
      'items.product': productId
    }).read('primary');

    const totalUserCart = await Cart.countDocuments({
      'items.product': productId
    }).read('primary');
    console.timeEnd(`fetchOrderStats:${productId}`);

    console.time(`fetchSalesData:${productId}`);
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
    ]).read('primary');
    console.timeEnd(`fetchSalesData:${productId}`);

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
    console.error('Error in getProductDetails:', error.message);
    res.status(500).render('admin/error', { 
      message: 'An error occurred while fetching product details' 
    });
  }
};

exports.toggleProducts = async (req, res) => {
  try {
    console.time('toggleProduct');
    const product = await Product.findById(req.params.id).read('primary');
    product.status = product.status === 'listed' ? 'unlisted' : 'listed';
    await product.save();
    console.timeEnd('toggleProduct');

    // Invalidate cache
    console.log(`Invalidating cache for product_${product._id} on toggle`);
    const cacheKeys = productCache.keys();
    const keysDeleted = [];
    cacheKeys.forEach(key => {
      if (key.startsWith(`product_${product._id}_`)) {
        productCache.del(key);
        keysDeleted.push(key);
      }
    });
    productCache.del(`product_${product._id}_no-user`);
    keysDeleted.push(`product_${product._id}_no-user`);
    console.log(`Cleared cache keys: ${keysDeleted.join(', ') || 'none'}`);

    if (product.status === 'unlisted') {
      console.time('updateCartWishlist');
      await Cart.updateMany({}, {
        $pull: { items: { product: product._id } }
      }).read('primary');

      await Wishlist.updateMany({}, {
        $pull: { items: { product: product._id } }
      }).read('primary');
      console.timeEnd('updateCartWishlist');
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