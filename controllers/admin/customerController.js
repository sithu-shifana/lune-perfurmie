const User=require('../../models/userSchema');
const mongoose = require('mongoose');


exports.getCustomerPage=async(req,res)=>{
    try{
        let search = (req.query.search || "").trim();
        let query = {};
        
        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } }
            ];
        }

        let page=parseInt(req.query.page)||1;
        const limit=5;

        const user=await User.find(query)
        .sort({createAt:-1})
        .limit(limit)
        .skip((page-1)*limit);

        customerCount=await User.countDocuments();
        filteredCount=await User.countDocuments(query);

        res.render('admin/customer/customerManagement', {  
            customerCount,
            data: user,
            totalPages: Math.ceil(filteredCount / limit),
            currentPage: page,
            search
        });
    }catch(error){
        console.error('Error in getCustomerPage:', error.message);
        res.status(500).render('error', { message: 'An error occurred while fetching customers' });

    }
}


exports.toggleBlockCustomer = async (req, res) => {
  try {
    const { id, action } = req.query;

   

    const user = await User.findByIdAndUpdate(
      id,
      { isBlocked: action === 'block' },
      { new: true }
    );

    if (action === 'block') {
      const sessionCollection = mongoose.connection.collection('sessions');
      await sessionCollection.deleteMany({ "session.user._id": id }); 
    }

    return res.redirect('/admin/customerManagement');

  } catch (error) {
    console.error(error);
    return res.status(500).render('error', { message: 'Internal Server Error' });
  }
};
