// ===== CONTROLLER =====
// controllers/productController.js
const { getProductWithOffers } = require('../helpers/productHelper');

exports.getProductById = async (req, res) => {
  try {
    const { id } = req.params;
    const product = await getProductWithOffers(id);
    
    res.render('product', { product });
  } catch (error) {
    res.status(500).send('Error: ' + error.message);
  }
};

exports.getAllProducts = async (req, res) => {
  try {
    const Product = require('../models/productSchema');
    const products = await Product.find({ status: 'listed' }).populate('brand category');
    
    const productsWithOffers = await Promise.all(
      products.map(async (product) => await getProductWithOffers(product._id))
    );
    
    res.render('products', { products: productsWithOffers });
  } catch (error) {
    res.status(500).send('Error: ' + error.message);
  }
};

// ===== ROUTE =====
// routes/productRoutes.js
const express = require('express');
const router = express.Router();
const { getProductById, getAllProducts } = require('../controllers/productController');

router.get('/', getAllProducts);
router.get('/:id', getProductById);

module.exports = router;
