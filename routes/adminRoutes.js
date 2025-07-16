const express=require('express');
const router=express.Router();

const authController=require('../controllers/admin/authController');
const customerController=require('../controllers/admin/customerController');
const categoryController=require('../controllers/admin/categoryController');
const brandController=require('../controllers/admin/brandControllers');
const productController=require('../controllers/admin/productControllers');
const offerController=require('../controllers/admin/offerManagement');
const coupenManagement=require('../controllers/admin/coupenController');
const orderController=require('../controllers/admin/orderController');
const cancelReturnController = require('../controllers/admin/cancelReturnController');
const salesReportController = require('../controllers/admin/salesreport');


const isAdmin = (req, res, next) => {
    if (!req.session.admin) {
        return res.redirect('/admin/login'); 
    }
    next();
};
const { uploadCategory, uploadBrand, uploadProduct } = require('../utils/multerCloudinary');
const catValidation=require('../middlewares/admin/categoryValidation');
const productValidation=require('../middlewares/admin/productValidation');
//auth controller
router.get('/login',authController.getAdminLoginPage);
router.post('/login',authController.loginAdmin);
router.get('/dashboard',isAdmin,authController.getDashboardPage);
router.post('/generate-ledger', authController.downloadLedgerPDF);
router.get('/logout',authController.adminlogOut);

//customer routes
router.get('/customerManagement',isAdmin,customerController.getCustomerPage);
router.get('/toggleBlock',isAdmin,customerController.toggleBlockCustomer);

//catgroy routes
router.get('/categoryManagement',isAdmin,categoryController.getCategoryPage);
router.get('/category-add',isAdmin,categoryController.getaddcategorypage);
router.post('/category-add',isAdmin, uploadCategory.single('image'),catValidation.validateCategoryAdd,categoryController.addCategory);
router.get('/category-edit/:id',isAdmin,categoryController.getCategoryEditPage);
router.post('/category-edit/:id',isAdmin,uploadCategory.single('image'),catValidation.validateCategoryEdit,categoryController.EditCategory);
router.put('/category/:id/toggle',isAdmin,categoryController.toggleStatus)

router.get('/brandManagement',isAdmin,brandController.getBrandPage);
router.get('/brand-add',isAdmin,brandController.getAddBrandPage)
router.post('/brand-add',isAdmin,uploadBrand.single('image'),brandController.addBrand)
router.get('/brand-edit/:id',isAdmin,brandController.getEditBrandPage);
router.post('/brand-edit/:id',uploadBrand.single('image'),isAdmin,brandController.editBrand);
// router.put('/brand/:id/toggle',isAdmin,brandController.toggleStatus)

//product routes
router.get('/productManagement',isAdmin,productController.getProductManagementPage);
router.get('/product-add',isAdmin,productController.getaddProductPage);
router.post('/product-add',isAdmin,uploadProduct,productController.addProduct)
router.get('/product-edit/:id',isAdmin,productController.showEditProductForm);
router.post('/product-edit/:id',isAdmin,uploadProduct,productController.updateProduct)


router.get('/offerManagement', offerController.getOfferPage);
router.get('/offer-add',isAdmin,offerController.getAddOfferForm);
router.post('/offer-add',isAdmin,offerController.addOffer);


router.get('/couponManagement',isAdmin,coupenManagement.getCouponManagement);
router.get('/coupon-add',isAdmin, coupenManagement.getAddCoupon);
router.post('/coupon-add',isAdmin,coupenManagement.postAddCoupon)
router.get('/coupon-edit/:id', isAdmin, coupenManagement.getEditCoupon);
router.put('/coupon-edit/:id', isAdmin, coupenManagement.postEditCoupon);
router.put('/coupon/:id/toggle', isAdmin, coupenManagement.toggleCoupon);


router.get('/orderManagement', orderController.getOrderManagement);
router.get('/view-order/:orderId', orderController.getViewOrder);
router.post('/orders/:orderId/delivery-status', orderController.updateDeliveryStatus);
router.post('/cancel-order/:orderId', orderController.cancelOrder);
router.get('/update-tracking/:orderId', orderController.getUpdateTracking);
router.post('/orders/update-tracking/:orderId', orderController.updateTracking);

//returns
// GET Routes
router.get('/manage-returns/:orderId', cancelReturnController.getManageReturns);
router.get('/view-returns/:orderId', cancelReturnController.getViewReturns);

// POST Routes
router.post('/orders/approve-return/:orderId', cancelReturnController.approveReturn);
router.post('/orders/reject-return/:orderId', cancelReturnController.rejectReturn);
router.post('/orders/approve-return-item/:orderId/:itemId', cancelReturnController.approveItemReturn);
router.post('/orders/reject-return-item/:orderId/:itemId', cancelReturnController.rejectItemReturn);

router.get('/sales-report/generate', isAdmin, salesReportController.generateSalesReport);
router.get('/sales-report/download-pdf', salesReportController.downloadPDFReport);
router.get('/sales-report/download-excel', salesReportController.downloadExcelReport);


module.exports=router;