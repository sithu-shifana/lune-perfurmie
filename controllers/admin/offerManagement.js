const Product = require('../../models/productSchema');
const Brand = require('../../models/brandSchema');
const Category = require('../../models/categorySchema');
const Offer = require('../../models/offerSchema');
const mongoose = require('mongoose');

exports.getOfferPage = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 5;
    const skip = (page - 1) * limit;
    const search = (req.query.search || '').trim();
    const discountType = req.query.discountType || '';

    // Validate discountType
    const validDiscountTypes = ['', 'percentage', 'flat'];
    if (discountType && !validDiscountTypes.includes(discountType)) {
      throw new Error('Invalid discount type');
    }

    // Build query
    let query = {};
    if (search) {
      query.title = { $regex: search, $options: 'i' }; // Changed from query.name
    }
    if (discountType) {
      query.discountType = discountType;
    }

    // Fetch offers
    const offers = await Offer.find(query)
      .populate('product', 'productName') // Changed from applicableProducts
      .populate('category', 'name')
      .populate('brand', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    // Add isCurrentlyActive based on isActive and date range
    const now = new Date();
    const offersWithStatus = offers.map(offer => ({
      ...offer.toObject(),
      isCurrentlyActive: offer.isActive && offer.startDate <= now && offer.endDate >= now
    }));

    // Count total offers for pagination
    const totalOffers = await Offer.countDocuments(query);
    const totalPages = Math.ceil(totalOffers / limit);

    res.render('admin/offer/offerManagement', {
      offers: offersWithStatus,
      totalOffers,
      currentPage: page,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
      nextPage: page + 1,
      prevPage: page - 1,
      search,
      discountType,
      limit,
      error: null
    });
  } catch (error) {
    console.error('Error fetching offers:', error);
    res.redirect(`/admin/offerManagement?error=${encodeURIComponent('Error loading offer management page')}`);
  }
};

exports.getAddOfferForm = async (req, res) => {
  try {
    const products = await Product.find({ status: 'listed' }).populate('brand').lean();
    const categories = await Category.find({ status: 'listed' }).lean();
    const brands = await Brand.find({ status: 'listed' }).lean();
    
    res.render('admin/offer/offer-add', { products, categories, brands });
  } catch (error) {
    console.error('Error loading offer form:', error);
    res.status(500).send('Failed to load the offer form');
  }
};

exports.addOffer = async (req, res) => {
  try {
    const {
      name,
      description,
      discountType,
      discountValue,
      maxDiscountPercentage,
      startDate,
      expiryDate,
      applicableProducts,
      category,
      brand
    } = req.body;

    // Basic validation
    if (!name) {
      return res.status(400).json({ errorType: 'name', error: 'Name is required' });
    }

    if (!discountType) {
      return res.status(400).json({ errorType: 'discountType', error: 'Valid discount type is required (percentage or fixed)' });
    }

    if (!discountValue || discountValue < 0.01) {
      return res.status(400).json({ errorType: 'discountValue', error: 'Discount value must be at least 0.01' });
    }

    if (discountType === 'percentage' && (maxDiscountPercentage < 0 || maxDiscountPercentage > 100)) {
      return res.status(400).json({ errorType: 'maxDiscountPercentage', error: 'Maximum discount percentage must be between 0% and 100%' });
    }

    if (!startDate) {
      return res.status(400).json({ errorType: 'startDate', error: 'Start date is required' });
    }

    if (!expiryDate) {
      return res.status(400).json({ errorType: 'expiryDate', error: 'Expiry date is required' });
    }

    if (new Date(expiryDate) < new Date(startDate)) {
      return res.status(400).json({ errorType: 'expiryDate', error: 'Expiry date must be after start date' });
    }

    // Check if offer name already exists
    const existingOffer = await Offer.findOne({ name });
    if (existingOffer) {
      return res.status(400).json({ errorType: 'name', error: 'This offer name is already taken' });
    }

    // Validate at least one of products, category, or brand is provided
    if (!applicableProducts && !category && !brand) {
      return res.status(400).json({ errorType: 'top', error: 'Please select products, category, or brand for this offer' });
    }

    // Base offer data
    let offerData = {
      name,
      description: description || '',
      discountType,
      discountValue,
      maxDiscountPercentage: discountType === 'percentage' ? maxDiscountPercentage : undefined,
      startDate,
      expiryDate,
      isActive: true
    };

    // Handle product-specific offers
    if (applicableProducts) {
      const productIds = Array.isArray(applicableProducts) ? applicableProducts : [applicableProducts];
      const foundProducts = await Product.find({ 
        _id: { $in: productIds },
        status: 'listed'
      }).select('_id');
      if (foundProducts.length !== productIds.length) {
        return res.status(400).json({ errorType: 'applicableProducts', error: 'One or more selected products are not available or unlisted' });
      }
      offerData.applicableProducts = foundProducts.map(p => p._id);
    }

    // Handle category offers
    if (category) {
      const foundCategory = await Category.findOne({ 
        _id: category,
        status: 'listed'
      });
      if (!foundCategory) {
        return res.status(400).json({ errorType: 'category', error: 'Selected category is not available or unlisted' });
      }
      offerData.category = foundCategory._id;
    }

    // Handle brand offers
    if (brand) {
      const foundBrand = await Brand.findOne({ 
        _id: brand,
        status: 'listed'
      });
      if (!foundBrand) {
        return res.status(400).json({ errorType: 'brand', error: 'Selected brand is not available or unlisted' });
      }
      offerData.brand = foundBrand._id;
    }

    // Save the offer
    const offer = new Offer(offerData);
    await offer.save();

    return res.status(201).json({ message: 'Offer added successfully' });
  } catch (error) {
    console.error('Error adding offer:', error);
    if (error.name === 'ValidationError') {
      const firstError = Object.values(error.errors)[0];
      return res.status(400).json({ errorType: firstError.path, error: firstError.message });
    }
    return res.status(500).json({ errorType: 'top', error: 'Something went wrong on the server' });
  }
};

exports.toggleOffer = async (req, res) => {
  try {
    const offer = await Offer.findById(req.params.id);
    if (!offer) {
      return res.status(404).json({ error: 'Offer not found' });
    }
    offer.isActive = !offer.isActive;
    await offer.save();
    res.json({
      isActive: offer.isActive,
      message: `Offer ${offer.isActive ? 'activated' : 'deactivated'} successfully`
    });
  } catch (error) {
    console.error('Error toggling offer:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.deleteOffer = async (req, res) => {
  try {
    const offer = await Offer.findByIdAndDelete(req.params.id);
    if (!offer) {
      return res.status(404).json({ error: 'Offer not found' });
    }
    res.json({ message: 'Offer deleted successfully' });
  } catch (error) {
    console.error('Error deleting offer:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.getAddOfferForm = async (req, res) => {
  try {
    const products = await Product.find({ status: 'listed' }).populate('brand').lean();
    const categories = await Category.find({ status: 'listed' }).lean();
    const brands = await Brand.find({ status: 'listed' }).lean();
    
    res.render('admin/offer/offer-add', { products, categories, brands });
  } catch (error) {
    console.error('Error loading offer form:', error);
    res.status(500).send('Failed to load the offer form');
  }
};



exports.addOffer = async (req, res) => {
  try {
    const {
      title,
      description,
      discountType,
      discountValue,
      startDate,
      endDate,
      product,
      category,
      brand
    } = req.body;

    // Basic validation
    if (!title) {
      return res.status(400).json({ errorType: 'title', error: 'Title is required' });
    }

    if (!discountType || !['percentage', 'flat'].includes(discountType)) {
      return res.status(400).json({ errorType: 'discountType', error: 'Valid discount type is required (percentage or flat)' });
    }

    if (!discountValue || discountValue < 0.01) {
      return res.status(400).json({ errorType: 'discountValue', error: 'Discount value must be at least 0.01' });
    }

    if (!startDate) {
      return res.status(400).json({ errorType: 'startDate', error: 'Start date is required' });
    }

    if (!endDate) {
      return res.status(400).json({ errorType: 'endDate', error: 'Expiry date is required' });
    }

    if (new Date(endDate) < new Date(startDate)) {
      return res.status(400).json({ errorType: 'endDate', error: 'Expiry date must be after start date' });
    }

    // Check if offer title already exists
    const existingOffer = await Offer.findOne({ title });
    if (existingOffer) {
      return res.status(400).json({ errorType: 'title', error: 'This offer title is already taken' });
    }

    // Base offer data
    let offerData = {
      title,
      description: description || '',
      discountType,
      discountValue,
      startDate,
      endDate,
      isActive: true
    };

    // Determine offer type based on which field is provided
    let offerType = '';
    if (product) {
      offerType = 'product';
    } else if (category) {
      offerType = 'category';
    } else if (brand) {
      offerType = 'brand';
    }

    // Validate based on determined offer type
    if (offerType === 'product') {
      // Ensure product is selected and valid
      if (!product || !mongoose.isValidObjectId(product)) {
        return res.status(400).json({ errorType: 'product', error: 'Please select a valid product' });
      }

      // Check if the selected product is listed
      const foundProduct = await Product.findOne({ 
        _id: product,
        status: 'listed'
      }).select('_id');

      if (!foundProduct) {
        return res.status(400).json({ errorType: 'product', error: 'Selected product is not available or unlisted' });
      }

      offerData.product = foundProduct._id;
    } else if (offerType === 'category') {
      // Ensure category is selected
      if (!category || !mongoose.isValidObjectId(category)) {
        return res.status(400).json({ errorType: 'category', error: 'Please select a valid category' });
      }

      // Check if category is listed
      const foundCategory = await Category.findOne({ 
        _id: category,
        status: 'listed'
      });

      if (!foundCategory) {
        return res.status(400).json({ errorType: 'category', error: 'Selected category is not available or unlisted' });
      }

      offerData.category = foundCategory._id;
    } else if (offerType === 'brand') {
      // Ensure brand is selected
      if (!brand || !mongoose.isValidObjectId(brand)) {
        return res.status(400).json({ errorType: 'brand', error: 'Please select a valid brand' });
      }

      // Check if brand is listed
      const foundBrand = await Brand.findOne({ 
        _id: brand,
        status: 'listed'
      });

      if (!foundBrand) {
        return res.status(400).json({ errorType: 'brand', error: 'Selected brand is not available or unlisted' });
      }

      offerData.brand = foundBrand._id;
    } else {
      return res.status(400).json({ errorType: 'top', error: 'Please select a product, category, or brand for this offer' });
    }

    // Save the offer
    const offer = new Offer(offerData);
    await offer.save();

    return res.status(201).json({ message: 'Offer added successfully' });

  } catch (error) {
    console.error('Error adding offer:', error);
    if (error.name === 'ValidationError') {
      const firstError = Object.values(error.errors)[0];
      return res.status(400).json({ errorType: firstError.path, error: firstError.message });
    }
    return res.status(500).json({ errorType: 'top', error: 'Something went wrong on the server' });
  }
};

// Toggle offer status
exports.toggleOffer = async (req, res) => {
  try {
    const offer = await Offer.findById(req.params.id);
    if (!offer) {
      return res.status(404).json({ error: 'Offer not found' });
    }
    offer.isActive = !offer.isActive;
    await offer.save();
    res.json({
      isActive: offer.isActive,
      message: `Offer ${offer.isActive ? 'activated' : 'deactivated'} successfully`
    });
  } catch (error) {
    console.error('Error toggling offer:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Delete offer
exports.deleteOffer = async (req, res) => {
  try {
    const offer = await Offer.findByIdAndDelete(req.params.id);
    if (!offer) {
      return res.status(404).redirect('/admin/offerManagement?error=Offer not found');
    }
    res.redirect('/admin/offerManagement?success=Offer deleted successfully');
  } catch (error) {
    console.error('Error deleting offer:', error);
    res.status(500).redirect('/admin/offerManagement?error=Server error');
  }
};