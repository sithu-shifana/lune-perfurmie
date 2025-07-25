const Category = require('../../models/categorySchema');
const Product = require('../../models/productSchema');
const Wishlist = require('../../models/wishlistSchema');
const {  getProductsWithOffersAndWishlist, getFilterOptions } = require('../../helper/filterProducts');
const { getProductWithOffers } = require('../../helper/productHelper');


//get home page
exports.getHomePage = async (req, res) => {
  try {
    const categories = await Category.find({ status: 'listed' })
      .select('name _id imageUrl')
      .lean();

    const queryParams = { sort: 'newArrivals', page: 1, limit: 10 ,sortOrder: -1};
    const userId = req.session.user?.id;
    const productData = await getProductsWithOffersAndWishlist(queryParams, userId);

    const newlyArrivedProducts = productData.products.map(product => ({
      ...product,
      variant: product.variants[0],
      discountType: product.variants[0].discountType || 'none',
      discountValue: Number(product.variants[0].discountValue) || 0
    }));

    res.render('home', {
      categories,
      newlyArrivedProducts,
      csrfToken: req.csrfToken ? req.csrfToken() : undefined
    });
  } catch (error) {
    console.error('Error in getHomePage:', error.message);
    res.status(500).render('404', { message: 'Server Error' });
  }
};


// Get Shop Page
exports.getShopPage = async (req, res) => {
  try {
    const queryParams = {
      category: req.query.category,
      brand: req.query.brand,
      minPrice: req.query.minPrice,
      maxPrice: req.query.maxPrice,
      sort: req.query.sort,
      page: req.query.page || 1,
      search: req.query.search?.trim()
    };
    const userId = req.session.user?.id;

    const productResult = await getProductsWithOffersAndWishlist(queryParams, userId);//product accessing with offer and wishlist
    const { categories, brands } = await getFilterOptions(); //shop page filtering

    const products = productResult.products.map(product => ({
      ...product,
      variant: product.variants[0],
      discountType: product.variants[0].discountType || 'none',
      discountValue: Number(product.variants[0].discountValue) || 0
    }));

  
    res.render('shop', {
      products,
      categories,
      brands,
      query: {
        category: queryParams.category || '',
        brand: queryParams.brand || '',
        sort: queryParams.sort || '',
        search: queryParams.search || ''
      },
      minPrice: queryParams.minPrice || '',
      maxPrice: queryParams.maxPrice || '',
      currentPage: productResult.currentPage,
      totalPages: productResult.totalPages,
      totalProducts: productResult.totalProducts
    });
  } catch (error) {
    console.error('Error in getShopPage:', error.message);
    if (req.headers['x-requested-with'] === 'XMLHttpRequest' || 
        req.headers.accept?.includes('application/json')) {
      return res.status(500).json({ error: 'Server Error' });
    }
    res.status(500).render('404', { message: 'Server Error' });
  }
};



exports.getproductshowpage = async (req, res) => {
  try {
    const userId = req.session.user?.id;
    let productId=req.params.id;

    const product = await getProductWithOffers(productId, userId);
       
    if (!product) {
      return res.status(400).render('/products', { message: 'Product ID is missing' });
    }
   
    if (
       product.status === 'Unlisted' ||
       product.category?.status === 'unlisted' ||
       product.brand?.status === 'unlisted'
    ) {
      return res.redirect('/products');
    }

    product.variant = product.variants[0];
    product.discountType = product.variants[0].discountType || 'none';
    product.discountValue = Number(product.variants[0].discountValue) || 0;

    const similarQuery = {
      $or: [
        { category: product.category?._id },
        { brand: product.brand?._id }
      ],
      page: 1,
      limit: 8,
      sort: 'newArrivals'
    };
    const similarResult = await getProductsWithOffersAndWishlist(similarQuery, userId);

    const similarProducts = similarResult.products
      .filter(p => p._id.toString() !== productId)
      .slice(0, 4)
      .map(sp => ({
        ...sp,
        variant: sp.variants[0],
        discountType: sp.variants[0].discountType || 'none',
        discountValue: Number(sp.variants[0].discountValue) || 0
      }));

    res.render('product-show', {
      product,
      similarProducts,
      csrfToken: req.csrfToken ? req.csrfToken() : undefined
    });
  } catch (error) {
    console.error('Error in getproductshowpage:', error.message);
    res.status(500).render('404', { message: 'Server Error' });
  }
};