const User = require('../../models/userSchema');
const Wallet = require('../../models/walletSchema');
const Razorpay = require('razorpay');
const crypto = require('crypto');

// Initialize Razorpay
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// Debug: Check if Razorpay keys are loaded
console.log('Razorpay Key ID:', process.env.RAZORPAY_KEY_ID ? 'Loaded' : 'Missing');
console.log('Razorpay Key Secret:', process.env.RAZORPAY_KEY_SECRET ? 'Loaded' : 'Missing');

//get wallet page
exports.getWalletPage = async (req, res) => {
  try {
    const userId = req.session.user?.id;
    let wallet = await Wallet.getOrCreate(userId);

    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;

    const sortedTransactions = wallet.transactions.sort(
      (a, b) => new Date(b.TransactionTime) - new Date(a.TransactionTime)
    );

    const paginatedTransactions = sortedTransactions.slice(skip, skip + limit);
    const totalPages = Math.ceil(sortedTransactions.length / limit);

    res.render('dashboard/wallet', {
      wallet: {
        ...wallet.toObject(),
        transactions: paginatedTransactions
      },
      user: req.session.user || { _id: userId },
      currentPage: page,
      perPage: limit,
      totalPages,
      razorpayKey: process.env.RAZORPAY_KEY_ID
    });
  } catch (error) {
    console.error('Error loading wallet page:', error);
    res.status(500).render('error', { message: 'Unable to load wallet' });
  }
};

exports.addMoney = async (req, res) => {
  try {
    
    const userId = req.session.user?.id;
    const { amount, description } = req.body;


    if (!amount || amount <= 0) {
      console.log('Invalid amount provided');
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid amount'
      });
    }

    if (amount > 50000) {
      console.log('Amount exceeds limit');
      return res.status(400).json({
        success: false,
        message: 'Maximum amount limit is ₹50,000'
      });
    }

   

const options = {
  amount: Math.round(amount * 100), 
  currency: 'INR',
  receipt: `wal_${userId.slice(0, 8)}_${Date.now()}`, 
};



    const order = await razorpay.orders.create(options);

    res.json({
      success: true,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      key: process.env.RAZORPAY_KEY_ID,
      description: description
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to initiate payment. Please try again.',
      error: error.message 
    });
  }
};

exports.verifyPayment = async (req, res) => {
  try {
    
    const userId = req.session.user?.id;
    const { 
      razorpay_payment_id, 
      razorpay_order_id, 
      razorpay_signature,
      amount,
      description 
    } = req.body;

    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest("hex");


    if (expectedSignature !== razorpay_signature) {
      console.log('Signature verification failed');
      return res.status(400).json({
        success: false,
        message: 'Payment verification failed'
      });
    }


    const wallet = await Wallet.getOrCreate(userId);
    await wallet.addMoney(
      parseFloat(amount),
      description || `Money added via Razorpay `,
    );


    res.json({
      success: true,
      message: 'Money added successfully',
      newBalance: wallet.balance
    });

  } catch (error) {
    console.error('Error verifying payment:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add money. Please try again.'
    });
  }
};


exports.withdrawMoney = async (req, res) => {
  try {
    const userId = req.session.user?.id;
    const { amount, description } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid amount'
      });
    }

    if (amount > 50000) {
      return res.status(400).json({
        success: false,
        message: 'Maximum amount limit is ₹50,000'
      });
    }

    const wallet = await Wallet.getOrCreate(userId);
    
    if (wallet.balance < amount) {
      return res.status(400).json({
        success: false,
        message: `Insufficient balance. Available: ₹${wallet.balance.toFixed(2)}`
      });
    }

    await wallet.deductMoney(
      parseFloat(amount),
      description || 'Money withdrawn from wallet',
    );

    res.json({
      success: true,
      message: 'Money withdrawn successfully',
      newBalance: wallet.balance
    });

  } catch (error) {
    console.log(`Error withdrawing money: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Failed to withdraw money. Please try again.'
    });
  }
};