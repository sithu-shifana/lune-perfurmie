const Cart = require('../../models/cartSchema');
const Product = require('../../models/productSchema');
const Address = require('../../models/addressSchema');
const Order = require('../../models/orderSchema');
const Wallet = require('../../models/walletSchema');
const Coupon = require('../../models/coupenSchema'); 
const { getProductWithOffers } = require('../../helper/productHelper');
const { prepareOrderForSave } = require('../../helper/orderHelper');
const PDFDocument = require('pdfkit');
const mongoose = require('mongoose');
const path = require('path');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

//get order page
exports.getOrderPage = async (req, res) => {
    try {
        const user = req.session.user?.id;
        const orders = await Order.find({ userId: user })
            .populate('addressId')
            .populate('items.productId').sort({ createdAt: -1 });

        if (!orders || orders.length === 0) {
            return res.render('dashboard/orders', { orders: [] }); 
        }

        const wallet= Wallet.findOne({userId:user});
        const walletBalance=wallet?.balance??0;

        res.render('dashboard/orders', {
            orders,
            walletBalance
        });
    } catch (error) {
        console.error('Error loading order page:', error);
        res.status(500).send('Internal Server Error');
    }
};


//cancel individual item before shipping
exports.cancelItem = async (req, res) => {
    try {
        const userId = req.session.user?.id;
        const { orderId, itemId } = req.params;
        const { reason } = req.body;
  
        const order = await Order.findById(orderId);
        const item = order.items.id(itemId);
        
        if (!['Placed', 'Processing'].includes(order.deliveryStatus)) {
            return res.status(400).json({ success: false, message: 'Item cannot be cancelled at this stage' });
        }

        const productBefore = await Product.findById(item.productId);

        const updatedProduct = await Product.findOneAndUpdate(
            { _id: item.productId },
            {
                $inc: { 'variants.$[elem].stock': item.quantity },
            },
            {
                arrayFilters: [{ 'elem.size': item.variantSize }],
                new: true,
            }
        );

        if (!updatedProduct) {
            return res.status(500).json({ success: false, message: 'Failed to update product stock' });
        }


        const refundAmount = item.finalItemTotal - (item.couponDiscount * item.quantity);

        const wallet = await Wallet.getOrCreate(userId);
   
        if (['RAZORPAY', 'WALLET'].includes(order.paymentMethod) && order.paymentStatus === 'Completed') {
            await wallet.addMoney(
                parseFloat(refundAmount),
               `Refund for cancelled order #${order._id.toString().slice(-8).toUpperCase()}`,

        )}

        item.status = 'Cancelled';
        item.cancellationReason = reason || '';
        item.isRefunded = ['WALLET', 'RAZORPAY'].includes(order.paymentMethod) && order.paymentStatus === 'Completed';

        const activeItems = order.items.filter(item => item.status === 'Active' || item.status === 'ReturnRequested');
        order.subtotal = activeItems.reduce((sum, item) => sum + item.finalItemTotal, 0);
        order.totalCouponDiscount = activeItems.reduce((sum, item) => sum + (item.couponDiscount * item.quantity), 0);
        order.finalTotal = order.subtotal - order.totalCouponDiscount;

        if (refundAmount > 0 && item.isRefunded) {
            order.refundDetails.amount = refundAmount;
            order.refundDetails.processedAt = new Date();
        }

        if (order.items.every(item => item.status === 'Cancelled')) {
            order.deliveryStatus = 'Cancelled';
            order.paymentStatus = 'Cancelled';
            order.status = 'Cancelled';
        }

        await order.save();

        res.json({
            success: true,
            message: item.isRefunded ? 'Item cancelled and money refunded successfully' : 'Item cancelled successfully',
            newBalance: wallet ? wallet.balance : undefined,
        });
    } catch (error) {
        console.error(`Error cancelling item: ${error.message}`);
        res.status(500).json({
            success: false,
            message: 'Failed to cancel item. Please try again.',
        });
    }
};


//return request 
exports.requestReturn = async (req, res) => {
    try {
        const userId = req.session.user?.id;
        const { orderId, itemId } = req.params;
        const { reason } = req.body;

        const order = await Order.findById(orderId);
        
        const item = order.items.id(itemId);
          
        item.status = 'ReturnRequested';
        item.returnReason = reason;

        await order.save();

        return res.status(200).json({ success: true, message: 'Return requested successfully', item });
    } catch (error) {
        console.error('Error in requestReturn:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

exports.generateInvoicePDF = async (req, res) => {
    try {
        const orderId = req.params.orderId;
        const userId = req.session.user?.id;

        const order = await Order.findById(orderId)
            .populate('userId', 'name email phone')
            .populate('addressId', 'name phone street city state pinCode country')
            .populate('items.productId', 'name images');

                if (order.userId._id.toString() !== userId.toString()) {
            return res.status(403).json({ success: false, message: 'Unauthorized access to this order' });
        }

        const doc = new PDFDocument({
            size: 'A4',
            margin: 50,
            bufferPages: true,
        });

        doc.registerFont('NotoSans', path.join(__dirname, '../../fonts/NotoSans-Regular.ttf'));

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=invoice-${order._id.toString().slice(-8).toUpperCase()}.pdf`);

        doc.pipe(res);


        doc.font('NotoSans').fontSize(20).fillColor('#2c3e50').text('Invoice', 50, 50);
        doc.fontSize(12).fillColor('#6c757d').text('Lune Perfurmie', 50, 80);
        doc.text('123 kinfra, Calicut, India', 50, 95);
        doc.text('Email: luneperfumie@company.com | Phone: +1234567890', 50, 110);

        doc.moveTo(50, 130).lineTo(550, 130).strokeColor('#e9ecef').lineWidth(1).stroke();

        doc.font('NotoSans').fontSize(14).fillColor('#2c3e50').text('Order Details', 50, 150);
        doc.fontSize(10).fillColor('#495057');
        doc.text(`Order ID: #${order._id.toString().slice(-8).toUpperCase()}`, 50, 170);
        doc.text(`Order Date: ${order.orderDate ? new Date(order.orderDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A'}`, 50, 185);
        if (order.deliveryDate) {
            doc.text(`Delivered On: ${new Date(order.deliveryDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`, 50, 200);
        }
        doc.text(`Delivery Status: ${order.deliveryStatus}`, 50, 215);

        doc.font('NotoSans').fontSize(12).fillColor('#2c3e50').text('Customer Details', 300, 150);
        doc.fontSize(10).fillColor('#495057');
        doc.text(`Name: ${order.userId.name || 'N/A'}`, 300, 170);
        doc.text(`Email: ${order.userId.email || 'N/A'}`, 300, 185);
        doc.text(`Phone: ${order.userId.phone || 'N/A'}`, 300, 200);

        doc.font('NotoSans').fontSize(12).fillColor('#2c3e50').text('Delivery Address', 300, 230);
        doc.fontSize(10).fillColor('#495057');
        doc.text(`${order.addressId.name || 'N/A'}`, 300, 250);
        doc.text(`${order.addressId.street || 'N/A'}, ${order.addressId.city || 'N/A'}`, 300, 265);
        doc.text(`${order.addressId.state || 'N/A'}, ${order.addressId.pinCode || 'N/A'}`, 300, 280);
        doc.text(`${order.addressId.country || 'N/A'}`, 300, 295);

        doc.moveTo(50, 315).lineTo(550, 315).strokeColor('#e9ecef').lineWidth(1).stroke();

        doc.font('NotoSans').fontSize(12).fillColor('#2c3e50').text('Items Ordered', 50, 330);
        const tableTop = 350;
        doc.fontSize(10).fillColor('#2c3e50');
        doc.text('Product', 50, tableTop);
        doc.text('Variant', 200, tableTop);
        doc.text('Quantity', 250, tableTop);
        doc.text('Unit Price', 300, tableTop);
        doc.text('Total', 350, tableTop);
        doc.text('Status', 400, tableTop);
        doc.moveTo(50, tableTop + 15).lineTo(550, tableTop + 15).strokeColor('#e9ecef').lineWidth(1).stroke();

        let y = tableTop + 25;
        order.items.forEach((item, index) => {
            doc.font('NotoSans').fontSize(10).fillColor('#495057');
            doc.text(item.productName || 'Unknown Product', 50, y, { width: 140, ellipsis: true });
            doc.text(item.variantSize || 'N/A', 200, y);
            doc.text(item.quantity || 1, 250, y);
            doc.text(`\u20B9${(item.offerPrice || 0).toLocaleString('en-IN')}`, 300, y);
            doc.text(`\u20B9${(item.offerPrice * item.quantity).toLocaleString('en-IN')}`, 350, y);
            doc.text(item.status, 400, y);
            if (item.status === 'Cancelled' && item.cancellationReason) {
                doc.fontSize(8).fillColor('#dc3545').text(`Reason: ${item.cancellationReason}`, 400, y + 10, { width: 140, ellipsis: true });
                y += 10;
            } else if (item.status === 'Returned' || item.status === 'ReturnRequested') {
                doc.fontSize(8).fillColor('#fd7e14').text(`Reason: ${item.returnReason || 'N/A'}`, 400, y + 10, { width: 140, ellipsis: true });
                if (item.returnApproved !== undefined) {
                    doc.text(`Return: ${item.returnApproved ? 'Approved' : 'Rejected'}`, 400, y + 20, { width: 140, ellipsis: true });
                    if (!item.returnApproved && item.returnRejectionReason) {
                        doc.text(`Rejection: ${item.returnRejectionReason}`, 400, y + 30, { width: 140, ellipsis: true });
                        y += 20;
                    }
                    y += 10;
                }
            }
            y += 30;
            if (index < order.items.length - 1) {
                doc.moveTo(50, y - 5).lineTo(550, y - 5).strokeColor('#e9ecef').lineWidth(0.5).stroke();
            }
        });

        // Payment Summary
        const summaryTop = y + 20;
        doc.font('NotoSans').fontSize(12).fillColor('#2c3e50').text('Payment Summary', 50, summaryTop);
        doc.fontSize(10).fillColor('#495057');
        doc.text(`Subtotal: \u20B9${(order.subtotal || 0).toLocaleString('en-IN')}`, 50, summaryTop + 20);
        if (order.totalCouponDiscount > 0) {
            doc.fillColor('#28a745').text(`Coupon Discount: -\u20B9${order.totalCouponDiscount.toLocaleString('en-IN')}`, 50, summaryTop + 35);
        }
        doc.fillColor('#495057').text(`Final Total: \u20B9${(order.finalTotal || 0).toLocaleString('en-IN')}`, 50, summaryTop + 50);
        doc.text(`Payment Method: ${order.paymentMethod === 'RAZORPAY' ? 'GPay/Online' : order.paymentMethod === 'WALLET' ? 'Wallet' : 'Cash on Delivery'}`, 50, summaryTop + 65);
        doc.text(`Payment Status: ${order.paymentStatus === 'Completed' ? 'Paid' : order.paymentStatus}`, 50, summaryTop + 80);
        if (order.paymentStatus === 'Refunded' && order.refundDetails && order.refundDetails.amount > 0) {
            doc.fillColor('#28a745').text(`Refund: \u20B9${order.refundDetails.amount.toLocaleString('en-IN')} processed on ${order.refundDetails.processedAt ? new Date(order.refundDetails.processedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A'}`, 50, summaryTop + 95);
        }

        // Footer
        doc.moveTo(50, summaryTop + 120).lineTo(550, summaryTop + 120).strokeColor('#e9ecef').lineWidth(1).stroke();
        doc.font('NotoSans').fontSize(10).fillColor('#6c757d').text('Thank you for your purchase!', 50, summaryTop + 140, { align: 'center' });
        doc.text('Contact us at luneperfumie@company.com for any queries.', 50, summaryTop + 155, { align: 'center' });

        // Finalize PDF
        doc.end();
    } catch (error) {
        console.error('Error generating invoice PDF:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
};




//retry payemnt for payment failure
exports.retryPayment = async (req, res) => {
  try {
    const userId = req.session.user?.id;
    const { orderId } = req.params;
   
    const { addressId, couponCode, paymentMethod } = req.body;

    const order = await Order.findOne({ _id: orderId, userId });
   
    const address = await Address.findById(addressId);
    if (!address) {
      return res.status(400).json({ success: false, message: 'Invalid address' });
    }

    let coupon = null;
    if (couponCode) {
      coupon = await Coupon.findOne({ code: couponCode, isActive: true });
      if (!coupon) {
        return res.status(400).json({ success: false, message: 'Invalid or inactive coupon' });
      }
      if (coupon.expiryDate < new Date()) {
        return res.status(400).json({ success: false, message: 'Coupon expired' });
      }
      if (coupon.usedUsers.includes(userId)) {
        return res.status(400).json({ success: false, message: 'Coupon already used' });
      }
    }

    order.paymentMethod = paymentMethod;
    order.addressId = addressId;
    order.couponCode = coupon ? coupon.code : null;
    order.totalCouponDiscount = coupon ? coupon.discountValue : 0;
    order.finalTotal = order.subtotal - (coupon ? coupon.discountValue : 0);
    order.paymentStatus = 'Completed';
    order.status = 'Paid';
    order.deliveryStatus = 'Placed';
    order.failureReason = null;

    if (paymentMethod === 'WALLET') {
      const wallet = await Wallet.findOne({ user: userId });
      if (!wallet || wallet.balance < order.finalTotal) {
        return res.status(400).json({ success: false, message: 'Insufficient wallet balance' });
      }
      await wallet.deductMoney(
        order.finalTotal,
        `Retry payment for Order ID: #${order._id.toString().slice(-8).toUpperCase()}`
      );
      order.paymentStatus = 'Completed';
      order.status = 'Paid';
    } else if (paymentMethod === 'COD') {
      if (order.finalTotal > 10000) {
        return res.status(400).json({ success: false, message: 'COD not available for orders above ₹10,000' });
      }
      order.paymentStatus = 'Pending';
      order.status = 'Pending';
    }
   
    if (coupon) {
      coupon.usedUsers.push(userId);
      await coupon.save();
    }
  
    await order.save();
    console.log(order);

    res.status(200).json({ success: true, message: 'Order updated successfully', orderId: order._id });
  } catch (error) {
    console.error('Error in retry payment:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};


//create razorpay for payemnt retry
exports.createRazorpayRetryOrder = async (req, res) => {
  try {
    const userId = req.session.user?.id;
    const { orderId } = req.params;
    const { addressId, couponCode } = req.body;

    const order = await Order.findOne({ _id: orderId, userId });
    

    if (order.paymentStatus !== 'Failed' && order.status !== 'Failed') {
      return res.status(400).json({ success: false, message: 'Order is not eligible for retry payment' });
    }

    const address = await Address.findById(addressId);
    if (!address) {
      return res.status(400).json({ success: false, message: 'Invalid address' });
    }

    let coupon = null;
    if (couponCode) {
      coupon = await Coupon.findOne({ code: couponCode, isActive: true });
      if (!coupon) {
        return res.status(400).json({ success: false, message: 'Invalid or inactive coupon' });
      }
      if (coupon.expiryDate < new Date()) {
        return res.status(400).json({ success: false, message: 'Coupon expired' });
      }
      if (coupon.usedUsers.includes(userId)) {
        return res.status(400).json({ success: false, message: 'Coupon already used' });
      }
    }

    order.paymentMethod = 'RAZORPAY';
    order.addressId = addressId;
    order.couponCode = coupon ? coupon.code : null;
    order.totalCouponDiscount = coupon ? coupon.discountValue : 0;
    order.finalTotal = order.subtotal - (coupon ? coupon.discountValue : 0);
    order.paymentStatus = 'Completed';
    order.status = 'Paid';
    order.deliveryStatus = 'Placed';
    order.failureReason = null;

    const options = {
      amount: Math.round(order.finalTotal * 100),
      currency: 'INR',
      receipt: order._id.toString(),
    };

    const razorpayOrder = await razorpay.orders.create(options);
    order.razorpayOrderId = razorpayOrder.id;
    await order.save();

    if (coupon) {
      coupon.usedUsers.push(userId);
      await coupon.save();
    }

    res.status(200).json({
      success: true,
      razorpayOrder: {
        id: razorpayOrder.id,
        amount: razorpayOrder.amount,
        currency: razorpayOrder.currency,
      },
      orderId: order._id,
    });
  } catch (error) {
    console.error('Error creating Razorpay retry order:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};


//veyrfy razorpay for payment retry
exports.verifyRazorpayRetryPayment = async (req, res) => {
  try {
    const userId = req.session.user?.id;
    const { orderId } = req.params;
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    const order = await Order.findOne({ _id: orderId, userId });
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const generatedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (generatedSignature !== razorpay_signature) {
      order.paymentStatus = 'Failed';
      order.status = 'Failed';
      order.failureReason = 'Invalid payment signature';
      await order.save();
      return res.status(400).json({ success: false, message: 'Invalid payment signature', orderId });
    }

    const payment = await razorpay.payments.fetch(razorpay_payment_id);
    if (payment.status !== 'captured') {
      order.paymentStatus = 'Failed';
      order.status = 'Failed';
      order.failureReason = 'Payment not captured';
      await order.save();
      return res.status(400).json({ success: false, message: 'Payment not captured', orderId });
    }

    order.paymentStatus = 'Completed';
    order.status = 'Paid';
    order.razorpayPaymentId = razorpay_payment_id;
    await order.save();

    res.status(200).json({ success: true, message: 'Payment verified successfully', orderId });
  } catch (error) {
    console.error('Error verifying Razorpay retry payment:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};