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

    // Get IDs of listed brands and categories
    const listedBrands = await Brand.find({ status: 'listed' }).distinct('_id');
    const listedCategories = await Category.find({ status: 'listed' }).distinct('_id');

    // Count products with listed brand and category
    const totalProducts = await Product.countDocuments({
      ...query,
      brand: { $in: listedBrands },
      category: { $in: listedCategories },
    });

    console.log(`Total products before filtering: ${totalProducts}, page: ${page}, limit: ${limit}`);

    // Validate page number
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

    // Filter out products where brand or category population failed
    const filteredProducts = products.filter((product) => product.brand && product.category);

    console.log(`Filtered products count: ${filteredProducts.length}`);

    // Fetch products with offers, handling both errors and null returns
    const productsWithOffers = [];
    for (const product of filteredProducts) {
      try {
        const productWithOffer = await getProductPageHelper(product._id);
        if (productWithOffer) {
          // Only push valid products with offers
          productsWithOffers.push(productWithOffer);
        } else {
          console.warn(`Product ${product._id} skipped (unlisted or invalid)`);
        }
      } catch (error) {
        console.error(`Error fetching offer for product ${product._id}:`, error.message);
        // Include product without offers if getProductWithOffers fails
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

    console.log(`Products with offers count: ${productsWithOffers.length}`);

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

exports.getaddProductPage=async(req,res)=>{
    try{
        const brands = await Brand.find({ status: 'listed' });
        const categories = await Category.find({ status: 'listed' });
         
        res.render('admin/products/product-add', {
            brands,
            categories,
        });
    }catch(error){
           console.error('Error fetching brands or categories in product add page:', error.message);
    }
}


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

    // Map images from processed images
    const images = req.processedImages.map(img => ({
      url: img.url,
      publicId: img.publicId
    }));

    // Prepare variants for schema
    const formattedVariants = variants.map(variant => ({
      size: variant.size,
      stock: Number(variant.stock) || 0,
      originalPrice: Number(variant.originalPrice) || 0,
      offerPrice: Number(variant.originalPrice) || 0
    }));

    // Create new product
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
    
    // Success response
    res.redirect('/admin/productManagement');
    
  } catch (error) {
    console.error('Product Adding error:', error);
    
    // Get brands and categories for error rendering
    const Brand = require('../models/Brand');
    const Category = require('../models/Category');
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
      .populate('category', 'name')
    const brands = await Brand.find({ status: 'listed' });
    const categories = await Category.find({ status: 'listed' });

    if (!product) {
      return res.status(404).render('404', {
        message: 'Product not found'
      });
    }

    // Format oldInput for the form
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

    // Validate product ID
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).render('admin/pageNotFound', {
        message: 'Invalid product ID',
        layout: 'layouts/admin',
      });
    }

    // Get existing product
    const existingProduct = await Product.findById(productId)
      .populate('brand', 'name')
      .populate('category', 'name');
    
    if (!existingProduct) {
      return res.status(404).render('admin/pageNotFound', {
        message: 'Product not found',
        layout: 'layouts/admin'
      });
    }

    // Prepare images array - use new images if provided, otherwise keep existing
    let images = existingProduct.images;
    if (req.processedImages && req.processedImages.length > 0) {
      images = req.processedImages.map(img => ({
        url: img.url,
        publicId: img.publicId
      }));
    }

    // Prepare variants for schema
    const formattedVariants = variants.map(variant => ({
      size: variant.size,
      stock: Number(variant.stock) || 0,
      originalPrice: Number(variant.originalPrice) || 0,
      offerPrice: Number(variant.originalPrice) || 0
    }));

    // Update product
    const updatedProduct = await Product.findByIdAndUpdate(
      productId,
      {
        productName: productName.trim(),
        description: description.trim(),
        brand: new mongoose.Types.ObjectId(brand),
        category: new mongoose.Types.ObjectId(category),
        fragranceType: fragranceType || '',
        variants: formattedVariants,
        images,
        updatedAt: new Date()
      },
      { new: true, runValidators: true }
    );

    if (!updatedProduct) {
      throw new Error('Failed to update product');
    }

    // Success response
    res.redirect('/admin/productManagement');

  } catch (error) {
    console.error('Product update error:', error);

    // Get brands and categories for error rendering
    const brands = await Brand.find({ status: 'listed' });
    const categories = await Category.find({ status: 'listed' });

    // Prepare oldInput for form re-rendering
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

    // Render edit form with error
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
    
    // Get product with offers using the helper function
    const product = await getProductWithOffers(productId);
    
    if (!product) {
       console.log(`error no product`)      
    }

    const totalBuyers = await Order.distinct('user', {
      'items.product': productId,
      orderStatus: { $in: ['delivered', 'shipped', 'processing'] }
    }).then(users => users.length);

    if (!totalBuyers) {
       console.log(`error no total`)      
    }
    const totalUserWishlist = await Wishlist.countDocuments({
      'items.product': productId
    });

    const totalUserCart = await Cart.countDocuments({
      'items.product': productId
    });

    // Calculate total units sold and revenue
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


