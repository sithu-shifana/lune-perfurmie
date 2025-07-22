const Coupon = require('../../models/coupenSchema');
const User = require('../../models/userSchema');
const crypto = require('crypto');

const generateUniqueCode = async () => {
  let code;
  let isUnique = false;
  while (!isUnique) {
    code = `REF${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    const existingCoupon = await Coupon.findOne({ code });
    if (!existingCoupon) {
      isUnique = true;
    }
  }
  return code;
};

exports.getCouponManagement = async (req, res) => {
  try {
    const searchQuery = req.query.search || '';
    const page = parseInt(req.query.page) || 1;
    const limit = 5;
    const skip = (page - 1) * limit;

    const filter = {
      code: { $regex: searchQuery.trim(), $options: 'i' }
    };

    const totalCoupons = await Coupon.countDocuments(filter);

    const coupons = await Coupon.find(filter)
      .skip(skip)
      .limit(limit)
      .lean(); 

    res.render('admin/coupon/couponManagement', {
      title: 'Coupon Management',
      coupons,
      totalCoupons,
      searchQuery,
      currentPage: page,
      totalPages: Math.ceil(totalCoupons / limit),
      error: null
    });
  } catch (error) {
    console.error('Error fetching coupon management page', error);
    res.render('admin/coupon/couponManagement', {
      title: 'Coupon Management',
      coupons: [],
      totalCoupons: 0,
      searchQuery: '',
      currentPage: 1,
      totalPages: 1,
      error: 'Failed to load coupons'
    });
  }
};


exports.getAddCoupon = (req, res) => {
  try {
    res.render('admin/coupon/coupon-add', { title: 'Add Coupon', error: null });
  } catch (error) {
    console.error('Error fetching add coupon page', error);
    res.render('admin/coupon/coupon-add', { title: 'Add Coupon', error: 'Failed to load page' });
  }
};

exports.postAddCoupon = async (req, res) => {
  try {
    const { code, discountType, discountValue, maxDiscount, minPurchase, expiryDate, isReferral } = req.body;

    // Validate inputs
    if (!discountType) {
      return res.status(400).json({ errorType: 'discountType', error: 'Discount type is required' });
    }
    if (!['flat', 'percentage'].includes(discountType)) {
      return res.status(400).json({ errorType: 'discountType', error: 'Invalid discount type' });
    }
    if (!code && !isReferral) {
      return res.status(400).json({ errorType: 'code', error: 'Coupon code is required' });
    }
    if (!discountValue && !isReferral) {
      return res.status(400).json({ errorType: 'discountValue', error: 'Discount value is required' });
    }
    if (!minPurchase && !isReferral) {
      return res.status(400).json({ errorType: 'minPurchase', error: 'Minimum purchase is required' });
    }
    if (!expiryDate && !isReferral) {
      return res.status(400).json({ errorType: 'expiryDate', error: 'Expiry date is required' });
    }
    if (discountType === 'percentage' && !maxDiscount) {
      return res.status(400).json({ errorType: 'maxDiscount', error: 'Max discount is required for percentage coupons' });
    }

    // Check for duplicate code
    if (code) {
      const existingCoupon = await Coupon.findOne({ code });
      if (existingCoupon) {
        return res.status(400).json({ errorType: 'code', error: 'Coupon code already exists' });
      }
    }

    const couponData = {
      code: isReferral ? await generateUniqueCode() : code,
      discountType,
      discountValue: isReferral ? 100 : parseFloat(discountValue),
      maxDiscount: discountType === 'percentage' ? parseFloat(maxDiscount) : null,
      minPurchase: isReferral ? 500 : parseFloat(minPurchase),
      expiryDate: isReferral ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) : new Date(expiryDate),
      isActive: true, // Explicitly set to true
      isReferral: isReferral === true
    };

    const coupon = new Coupon(couponData);
    await coupon.save();
    return res.status(200).json({ message: 'Coupon added successfully' });
  } catch (error) {
    console.error('Error adding coupon', error);
    if (error.code === 11000 && error.keyPattern.code) {
      return res.status(400).json({ errorType: 'code', error: 'Coupon code already exists' });
    }
    return res.status(500).json({ errorType: 'top', error: 'Failed to add coupon' });
  }
};

exports.getEditCoupon = async (req, res) => {
  try {
    const coupon = await Coupon.findById(req.params.id);
    if (!coupon) {
      return res.redirect('/admin/couponManagement');
    }
    res.render('admin/coupon/coupon-edit', { title: 'Edit Coupon', coupon, error: null });
  } catch (error) {
    console.error('Error fetching edit coupon page', error);
    res.redirect('/admin/couponManagement');
  }
};

exports.postEditCoupon = async (req, res) => {
  try {
    const couponId = req.params.id;
    const { code, discountType, discountValue, maxDiscount, minPurchase, expiryDate, isReferral } = req.body;

    // Validate inputs
    if (!discountType) {
      return res.status(400).json({ errorType: 'discountType', error: 'Discount type is required' });
    }
    if (!['flat', 'percentage'].includes(discountType)) {
      return res.status(400).json({ errorType: 'discountType', error: 'Invalid discount type' });
    }
    if (!code && !isReferral) {
      return res.status(400).json({ errorType: 'code', error: 'Coupon code is required' });
    }
    if (!discountValue && !isReferral) {
      return res.status(400).json({ errorType: 'discountValue', error: 'Discount value is required' });
    }
    if (!minPurchase && !isReferral) {
      return res.status(400).json({ errorType: 'minPurchase', error: 'Minimum purchase is required' });
    }
    if (!expiryDate && !isReferral) {
      return res.status(400).json({ errorType: 'expiryDate', error: 'Expiry date is required' });
    }
    if (discountType === 'percentage' && !maxDiscount) {
      return res.status(400).json({ errorType: 'maxDiscount', error: 'Max discount is required for percentage coupons' });
    }

    // Check for duplicate code
    if (code) {
      const existingCoupon = await Coupon.findOne({ code, _id: { $ne: couponId } });
      if (existingCoupon) {
        return res.status(400).json({ errorType: 'code', error: 'Coupon code already exists' });
      }
    }

    const couponData = {
      code: isReferral ? code || await generateUniqueCode() : code,
      discountType,
      discountValue: isReferral ? 100 : parseFloat(discountValue),
      maxDiscount: discountType === 'percentage' ? parseFloat(maxDiscount) : null,
      minPurchase: isReferral ? 500 : parseFloat(minPurchase),
      expiryDate: isReferral ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) : new Date(expiryDate),
      isReferral: isReferral === true,
      isActive: true // Default to true unless toggled
    };

    const coupon = await Coupon.findByIdAndUpdate(couponId, couponData, { new: true });
    if (!coupon) {
      return res.status(404).json({ errorType: 'top', error: 'Coupon not found' });
    }

    return res.status(200).json({ message: 'Coupon updated successfully' });
  } catch (error) {
    console.error('Error updating coupon', error);
    if (error.code === 11000 && error.keyPattern.code) {
      return res.status(400).json({ errorType: 'code', error: 'Coupon code already exists' });
    }
    return res.status(500).json({ errorType: 'top', error: 'Failed to update coupon' });
  }
};

exports.toggleCoupon = async (req, res) => {
  try {
    const couponId = req.params.id;
    if (!couponId) {
      return res.status(400).json({ error: 'Coupon ID is required' });
    }

    const coupon = await Coupon.findById(couponId);
    if (!coupon) {
      return res.status(404).json({ error: 'Coupon not found' });
    }

    coupon.isActive = !coupon.isActive;
    await coupon.save();

    console.log('Toggled coupon:', coupon); // Debug log

    res.json({
      message: `Coupon ${coupon.isActive ? 'activated' : 'deactivated'} successfully`,
      isActive: coupon.isActive
    });
  } catch (error) {
    console.error('Error toggling coupon:', error);
    res.status(500).json({ error: 'Failed to toggle coupon' });
  }
};

