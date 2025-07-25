const Product = require('../../models/productSchema');
const Brand = require('../../models/brandSchema');
const Category = require('../../models/categorySchema');
const mongoose = require('mongoose');

exports.productValidate = async (req, res, next) => {
  try {
    const {
      productName,
      description,
      brand,
      category,
      variants
    } = req.body;

    const errors = {};

    if (!productName || productName.trim() === '') {
      errors.productName = 'Perfume name is required';
    }

    if (!description || description.trim() === '') {
      errors.description = 'Description is required';
    }

    if (!brand || brand.trim() === '') {
      errors.brand = 'Brand is required';
    }

    if (!category || category.trim() === '') {
      errors.category = 'Category is required';
    }

    if (!req.processedImages || req.processedImages.length !== 3) {
      errors.images = 'Please upload exactly 3 images with 1:1 ratio (600x600px recommended)';
    }

    if (!variants || !Array.isArray(variants) || variants.length !== 4) {
      errors.variants = 'All variant fields (50ml, 100ml, 150ml, 200ml) are required';
    } else {
      const allowedSizes = ['50ml', '100ml', '150ml', '200ml'];
      let hasValidVariant = false;
      let variantErrors = [];

      variants.forEach((variant, index) => {
        const stock = Number(variant.stock) || 0;
        const originalPrice = Number(variant.originalPrice) || 0;
        const size = variant.size;

        if (!allowedSizes.includes(size)) {
          variantErrors.push(`Invalid size for variant ${index + 1}`);
          return;
        }

        if (stock > 0 && originalPrice <= 0) {
          variantErrors.push(`Price for ${size} must be greater than 0 when stock is provided`);
        }

        if (originalPrice > 0 && stock <= 0) {
          variantErrors.push(`Stock for ${size} must be greater than 0 when price is provided`);
        }

        if (stock > 0 && originalPrice > 0) {
          hasValidVariant = true;
        }
      });

      if (variantErrors.length > 0) {
        errors.variants = variantErrors[0]; 
      }

      if (!hasValidVariant && !errors.variants) {
        errors.variants = 'At least one variant must have both stock and price greater than 0';
      }
    }

    if (productName && productName.trim() !== '') {
      const existingProduct = await Product.findOne({
        productName: { $regex: new RegExp(`^${productName.trim()}$`, 'i') }
      });
      
      if (existingProduct) {
        errors.productName = 'A perfume with this name already exists';
      }
    }

    if (brand && brand.trim() !== '') {
      const brandExists = await Brand.findOne({ 
        _id: brand, 
        status: 'listed' 
      });
      
      if (!brandExists) {
        errors.brand = 'Selected brand does not exist or is not active';
      }
    }

    if (category && category.trim() !== '') {
      const categoryExists = await Category.findOne({ 
        _id: category, 
        status: 'listed' 
      });
      
      if (!categoryExists) {
        errors.category = 'Selected category does not exist or is not active';
      }
    }

    if (Object.keys(errors).length > 0) {
      const brands = await Brand.find({ status: 'listed' });
      const categories = await Category.find({ status: 'listed' });
      
      return res.status(400).render('admin/product-add', {
        errors,
        oldInput: {
          ...req.body,
          variants: variants || [
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

    next();

  } catch (error) {
    console.error('Validation error:', error);
    
    const brands = await Brand.find({ status: 'listed' });
    const categories = await Category.find({ status: 'listed' });
    
    return res.status(500).render('admin/product-add', {
      errors: { general: 'Validation error occurred' },
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