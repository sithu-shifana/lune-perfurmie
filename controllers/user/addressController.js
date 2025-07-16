const User = require('../../models/userSchema');
const Address=require('../../models/addressSchema');

exports.getaddressPage=async(req,res)=>{
    try{
        const user=await User.findBySessionID(req.sessionID);

        const address=await Address.find({userId:user._id}).sort({isDefault:-1})
        res.render('dashboard/addressBook',{address})

    }catch(error){
       console.log(`error catching address Book`);
        res.status(500).send('Server Error');

    }
}


exports.addAddress=async(req,res)=>{
    try{
      const { name, phone, street, city, state, pinCode, country, isDefault } = req.body;
      
      const user=await User.findBySessionID(req.sessionID);
     
      const userId = req.session.user?.id;

      if(isDefault){
        await Address.updateMany({userId},{isDefault:false});
      }

       const address = new Address({
      userId,
      name,
      phone,
      street,
      city,
      state,
      pinCode,
      country: country || 'India',
      isDefault: isDefault || false,
    });

    const savedAddress = await address.save();
    res.status(201).json({ message: 'Address added successfully', address: savedAddress });


    }catch(error){
    console.error('Add address error:', error);
    res.status(400).json({ errors: { server: error.message } });
    }
}


exports.setDeafultAddress=async(req,res)=>{
  try{
    const addressId = req.params.id;
   
    const userId=req.session.user?.id

    const address=await Address.findOne({userId,_id:addressId})

    await Address.updateMany({userId},{isDefault:false});
    await Address.findByIdAndUpdate(addressId,{isDefault:true},{new:true});

    res.status(200).json({ message: 'Default address updated successfully' });

  }catch(error){
 
     console.error('Set default address error:', error);
    res.status(500).json({ message: 'Failed to update default address' });
  }
}


exports.deleteAddress=async(req,res)=>{
  try{
    const addressId=req.params.id;
    const userId=req.session.user?.id;
    const address=Address.findOne({_id:addressId,userId})
    
    await Address.findByIdAndDelete(addressId);
    res.status(200).json({ message: 'Address deleted successfully' });

  }catch(error){

      console.error('Delete address error:', error);
    res.status(500).json({ message: 'Failed to delete address' });

  }
}

exports.editAddress=async(req,res)=>{
  try{
      const addressId = req.params.id;
      const { name, phone, street, city, state, pinCode, country, isDefault } = req.body;
      const userId=req.session.use?.id

      const address=Address.findOne({_id:addressId,userId})

      const updatedAddress = await Address.findByIdAndUpdate(
      addressId,
      { name, phone, street, city, state, pinCode, country, isDefault },
      { new: true }

    );
      res.status(200).json({ message: 'Address updated successfully', address: updatedAddress });


  }catch{
      console.error('Edit address error:', error);
    res.status(400).json({ errors: { server: error.message } });

  }
}