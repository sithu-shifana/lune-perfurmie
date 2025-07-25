const express = require('express');
const router = express.Router();

//controllers import
const userController = require('../controllers/user/userController');
const profileController=require('../controllers/user/profileController');
const addressController=require('../controllers/user/addressController')
const walletController=require('../controllers/user/walletController');
const wishlistController=require('../controllers/user/wishlistController');
const shopController=require('../controllers/user/shopController');
const cartController=require('../controllers/user/cartController');
const checkoutController=require('../controllers/user/checkoutController')
const orderController=require('../controllers/user/orderController')

//middlewares
const authValidation = require('../middlewares/user/authValidation');
const isAuthenticated=require('../middlewares/user/isAuthenticated');
const validateAddress=require('../middlewares/user/validateAddress');
const noCache = require('../middlewares/user/noCache');

//modules
const uploadProfile=require('../config/multer');

//home and shop routes
router.get('/',shopController.getHomePage)
router.get('/products',shopController.getShopPage)
router.get('/product-show/:id',shopController.getproductshowpage)

// Signup and Login routes
router.get('/signup', userController.getSignUp);
router.get('/login',userController.getLogin);
router.post('/api/signin', authValidation.validateSignIn, userController.submitSignup);
router.post('/api/login',authValidation.validateLogin,userController.login);
router.post('/logout',isAuthenticated,userController.logout);

// OTP verification routes
router.get('/verify-otp', userController.getVerifyotpPage);
router.post('/verify-otp', userController.submitOtp);
router.post('/resend-otp', userController.resendOtp);

// Forgot password routes
router.get('/forgot-password', userController.getForgotPassword);
router.post('/forgot-password', userController.submitForgotPassword);

// Password reset OTP routes
router.get('/verify-password-otp', userController.getPasswordOtpVerifyPage);
router.post('/verify-forgot-password-otp', userController.verifyForgotPasswordOtp);
router.post('/resend-forgot-password-otp', userController.resendForgotPasswordOtp);

// Reset password routes
router.get('/reset-password', userController.getResetPassword);
router.post('/reset-password', userController.resetPassword);


//google authentication
router.get('/auth/google', userController.googleAuthentication);
router.get('/auth/google/callback', userController.googleCallback);

//profile routes
router.get('/profile',isAuthenticated,noCache,profileController.getProfilePage);
router.put('/profile-Update',profileController.updateProfile)
router.post('/upload-profile-picture', uploadProfile.single('profilePicture'), profileController.uploadProfilePicture);
router.get('/get-referral-code', profileController.getReferralCode);
router.post('/change-password/validate',isAuthenticated, profileController.validatePassword);
router.post('/change-password',isAuthenticated, profileController.changePassword);

// otp routes 
router.post('/send-otp/current', profileController.sendCurrentEmailOtp);
router.post('/verify-otp/current', profileController.verifyCurrentEmailOtp);
router.post('/send-otp/new', profileController.sendNewEmailOtp);
router.post('/verify-otp/new', profileController.verifyNewEmailOtp);


//address routes
router.get('/addresses',isAuthenticated,addressController.getaddressPage);
router.post('/address-book-add', isAuthenticated,validateAddress,addressController.addAddress);
router.post('/set-default-address/:id',addressController.setDeafultAddress);
router.delete('/delete-address/:id', isAuthenticated, addressController.deleteAddress);
router.post('/edit-address/:id', isAuthenticated, validateAddress, addressController.editAddress);


//wallet routes
router.get('/wallet',isAuthenticated,walletController.getWalletPage);
router.post('/wallet/add-money', isAuthenticated, walletController.addMoney);
router.post('/wallet/deduct', isAuthenticated, walletController.withdrawMoney);


//wishlist
router.get('/wishlist',isAuthenticated,wishlistController.getWishlist)
router.post('/wishlist-toggle/:productId', isAuthenticated,wishlistController.toggleWishlist);
router.delete('/wishlist-remove/:productId',isAuthenticated, wishlistController.removeFromWishlist);
router.post('/cart/add/:productId',isAuthenticated,wishlistController.addToCart)

//cart routes
router.get('/cart',isAuthenticated,cartController.getCart);
router.post('/cart/update-quantity',isAuthenticated,cartController.updateQuantity)
router.delete('/cart/remove/:itemId', isAuthenticated, cartController.removeItem);
router.delete('/cart/clear', isAuthenticated, cartController.clearCart);
router.post('/cart-toggle/:productId', isAuthenticated, cartController.toggleCart);
router.get('/cart/check/:productId', isAuthenticated, cartController.checkCartStatus);

//checkout routes
router.get('/checkout',isAuthenticated,checkoutController.getCheckoutPage)
router.post('/select-address', isAuthenticated, checkoutController.selectAddress);
router.post('/address-add', isAuthenticated, validateAddress, checkoutController.addAddress);
router.post('/apply-coupon', isAuthenticated, checkoutController.applyCoupon);
router.post('/create-razorpay-order', isAuthenticated, checkoutController.createRazorpayOrder);
router.post('/verify-razorpay-payment', isAuthenticated, checkoutController.verifyRazorpayPayment)
router.get('/order-failed/:orderId',isAuthenticated,checkoutController.renderOrderFailed)
router.post('/place-order', checkoutController.placeOrder);
router.get('/order-confirmation/:orderId', checkoutController.getOrderSuccessPage);
router.post('/add-address',checkoutController.addAddress);
router.post('/update-order-failed', isAuthenticated, checkoutController.updateOrderFailed);


// //order routes
router.get('/orders', isAuthenticated, orderController.getOrderPage);
router.post('/orders/cancel-item/:orderId/:itemId', isAuthenticated, orderController.cancelItem);
router.post('/orders/return-item/:orderId/:itemId', isAuthenticated, orderController.requestReturn);
router.get('/user/order/:orderId/pdf', isAuthenticated, orderController.generateInvoicePDF);

//order failure route
router.post('/orders/retry-payment/:orderId', orderController.retryPayment);
router.post('/orders/retry-payment/razorpay/:orderId', orderController.createRazorpayRetryOrder);
router.post('/orders/verify-retry-payment/:orderId', orderController.verifyRazorpayRetryPayment);

module.exports = router;