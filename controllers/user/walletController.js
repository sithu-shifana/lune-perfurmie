const User = require('../../models/userSchema');
const Wallet = require('../../models/walletSchema');
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
      user: { _id: userId },
      currentPage: page,
      perPage: limit,
      totalPages
    });
  } catch (error) {
    res.status(500).render('error', { message: 'Unable to load wallet' });
  }
};



exports.addMoney=async(req,res)=>{

  try{
     const userId=req.session.user?.id;
     const {amount,description}=req.body;

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
    await wallet.addMoney(
      parseFloat(amount),
      description||'Money added to wallet',
    )

    
    res.json({ 
            success: true, 
            message: 'Money added successfully',
            newBalance: wallet.balance
        });

  }catch(error){
      console.log(`Error adding money: ${error.message}`);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to add money. Please try again.' 
        });
  }
 
}

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
    const result = await wallet.deductMoney(
      parseFloat(amount),
      description || 'Money withdraw from wallet',
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