const Product = require('../models/productSchema');
const Category = require('../models/categorySchema');
const Brand = require('../models/brandSchema');
const Wishlist = require('../models/wishlistSchema');
const { getProductWithOffers } = require('./productHelper');

const buildFilterQuery = (queryParams) => {
    const { category, brand, minPrice, maxPrice, search } = queryParams;
    const query = { status: 'listed' };
    if (category) query.category = category;
    if (brand) query.brand = brand;

    if (search) {
        const trimmedSearch = search.trim();
        const fuzzySearch = trimmedSearch.split(' ').join('.*');
        const searchRegex = new RegExp(fuzzySearch, 'i');
        query.$or = [
            { productName: searchRegex },
            { description: searchRegex }
        ];
    }
    
    return { query, priceFilter: { minPrice, maxPrice } };
};

const getSortOption = (sort) => {
    switch (sort) {
        case 'priceLowHigh':
            return { 'variants.offerPrice': 1 };
        case 'priceHighLow':
            return { 'variants.offerPrice': -1 };
        case 'nameAZ':
            return { productName: 1 };
        case 'nameZA':
            return { productName: -1 };
        case 'newArrivals':
            return { createdAt: -1 };
        default:
            return { createdAt: -1 };
    }
};

const getProductsWithOffersAndWishlist = async (queryParams, userId) => {
    const { query, priceFilter } = buildFilterQuery(queryParams);
    const sortOption = getSortOption(queryParams.sort);
    const page = Number(queryParams.page) || 1;
    const limit = 12;
    const skip = (page - 1) * limit;
    
    try {
        console.time('fetchProducts');
        let products = await Product.find(query)
            .populate({
                path: 'brand',
                match: { status: 'listed' },
                select: 'name _id'
            })
            .populate({
                path: 'category',
                match: { status: 'listed' },
                select: 'name _id'
            })
            .sort(sortOption)
            .lean()
            .read('primary');
        console.timeEnd('fetchProducts');

        products = products.filter(product => product.brand && product.category);

        console.time('applyOffers');
        const productsWithOffers = await Promise.all(products.map(async (product) => {
            console.time(`getProductWithOffers:${product._id}`);
            const productWithOffers = await getProductWithOffers(product._id);
            console.timeEnd(`getProductWithOffers:${product._id}`);
            
            if (productWithOffers) {
                return {
                    ...productWithOffers,
                    minOriginalPrice: Math.min(...productWithOffers.variants.map(v => v.originalPrice)),
                    minOfferPrice: Math.min(...productWithOffers.variants.map(v => v.offerPrice)),
                    hasOffer: productWithOffers.variants.some(v => v.hasOffer),
                    discountType: productWithOffers.variants.find(v => v.hasOffer)?.discountType || 'none',
                    appliedDiscount: productWithOffers.variants.find(v => v.hasOffer)?.discountValue || 0
                };
            }
            return null;
        }));
        console.timeEnd('applyOffers');
        
        const validProducts = productsWithOffers.filter(p => p !== null);

        let filteredProducts = validProducts;
        if (priceFilter.minPrice || priceFilter.maxPrice) {
            filteredProducts = validProducts.filter(product => {
                const price = product.minOfferPrice;
                const minPrice = priceFilter.minPrice ? Number(priceFilter.minPrice) : 0;
                const maxPrice = priceFilter.maxPrice ? Number(priceFilter.maxPrice) : Infinity;
                return price >= minPrice && price <= maxPrice;
            });
        }

        const totalProducts = filteredProducts.length;
        const paginatedProducts = filteredProducts.slice(skip, skip + limit);

        console.time('fetchWishlist');
        let wishlistedProductIds = [];
        if (userId) {
            const wishlist = await Wishlist.findOne({ user: userId }).lean().read('primary');
            if (wishlist) {
                wishlistedProductIds = wishlist.items.map(item => item.product.toString());
            }
        }
        console.timeEnd('fetchWishlist');

        const productsWithWishlist = paginatedProducts.map(product => ({
            ...product,
            isInWishlist: wishlistedProductIds.includes(product._id.toString())
        }));

        return {
            products: productsWithWishlist,
            totalProducts,
            totalPages: Math.ceil(totalProducts / limit),
            currentPage: page
        };
    } catch (error) {
        throw new Error('Error getting products with offers: ' + error.message);
    }
};

const getFilterOptions = async () => {
    try {
        const cache = require('node-cache');
        const filterCache = new cache({ stdTTL: 3600 });
        const cacheKey = 'filterOptions';
        let filterOptions = filterCache.get(cacheKey);
        if (!filterOptions) {
            console.time('fetchFilterOptions');
            const [categories, brands] = await Promise.all([
                Category.find({ status: 'listed' }).select('name _id').lean().read('primary'),
                Brand.find({ status: 'listed' }).select('name _id').lean().read('primary')
            ]);
            console.timeEnd('fetchFilterOptions');
            filterOptions = { categories, brands };
            filterCache.set(cacheKey, filterOptions);
        }
        return filterOptions;
    } catch (error) {
        throw new Error('Error getting filter options: ' + error.message);
    }
};

module.exports = {
    buildFilterQuery,
    getSortOption,
    getProductsWithOffersAndWishlist,
    getFilterOptions
};