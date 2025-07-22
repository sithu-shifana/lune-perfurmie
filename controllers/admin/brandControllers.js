const Brand=require('../../models/brandSchema');
const Product=require('../../models/productSchema')
const cloudinary = require('../../config/cloudinary');
const Cart=require('../../models/cartSchema');
const Wishlist=require('../../models/wishlistSchema');

exports.getBrandPage = async (req, res) => {
  try {
    let query = {};
    let searchQuery = (req.query.search || '').trim();

    if (searchQuery) {
      query = { name: { $regex: searchQuery, $options: 'i' } };
    }

    const page = parseInt(req.query.page) || 1;
    const limit = 6; // Brands per page

    const totalBrands = await Brand.countDocuments(query); // use filtered count
    const totalPages = Math.ceil(totalBrands / limit);

    const brands = await Brand.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    res.render('admin/brand/brandManagement', {
      brands,
      searchQuery,
      totalBrands,
      currentPage: page,
      totalPages
    });
  } catch (error) {
    console.error('Error in getBrandPage:', error);
    res.status(500).send("Server Error");
  }
};


exports.getAddBrandPage=async(req,res)=>{
    try{
        res.render('admin/brand/brand-add');

    }catch(error){
        console.error('Error loading add brand page:', error);
        res.redirect('404');

    }
}


 exports.getEditBrandPage=async(req,res)=>{
    try{
      const brandId = req.params.id;
      const brand = await Brand.findById(brandId);

      res.render('admin/brand/brand-edit',{brand})

    }catch(error){

      console.error('Error loading add brand Edit page:', error);
    }
  }

  exports.addBrand=async(req,res)=>{
    try{
        const { name } = req.body;

        if (!name) {
        return res.status(400).json({ error: 'Brand name is required' });
      }
      if (!req.file) {
        return res.status(400).json({ error: 'Brand logo is required' });
      }

     const existingBrand = await Brand.findOne({
        name: { $regex: `^${name}$`, $options: 'i' },
      });

      if (existingBrand) {
        return res.status(400).json({ error: 'Brand already exists' });
      }

     const result = await cloudinary.uploader.upload(req.file.path);
      
     const newBrand = new Brand({
      name: name,
      imageUrl: result.secure_url,
      imagePublicId: result.public_id,
      status: 'listed'
    });

    await newBrand.save();

    return res.status(200).json({ message: "Category added successfully" });

    }catch(error){

        console.error('Error adding category:', error);
        return res.status(500).json({ errorType: "top", error: "An error occurred while adding the category" });
    }
  }

    exports.editBrand=async(req,res)=>{
      try{
         const brandId = req.params.id;
         const { name } = req.body;

      const brand = await Brand.findById(brandId);
     
      const existingBrand=await Brand.findOne({name,_id:{$ne:brandId}})
      if (existingBrand) {
        return res.status(400).json({ error: 'Brand already exists' });
      }
     
       brand.name = name;
       
       if (req.file) {
        // Delete old image from Cloudinary
        if (brand.imagePublicId) {
            await cloudinary.uploader.destroy(brand.imagePublicId);
        }
          
        const result = await cloudinary.uploader.upload(req.file.path);
        
              brand.imageUrl = result.secure_url;
              brand.imagePublicId = result.public_id;

       }
       await brand.save();
       return res.json({ message: 'Brand updated successfully' });


    }catch{
      console.error('Error updating brand:', error);
      return res.status(500).json({ error: 'brand updating error' });
    }
  }


  exports.toggleBrand = async (req, res) => {
    try {
      const brand = await Brand.findById(req.params.id);
      brand.status = brand.status === 'listed' ? 'unlisted' : 'listed';
      await brand.save();
  
      if (brand.status === 'unlisted') {
        const products = await Product.find({ brand: brand._id }, '_id');
        const productIds = products.map(p => p._id);
  
        await Cart.updateMany({}, {
          $pull: {
            items: {
              product: { $in: productIds }
            }
          }
        });
  
        await Wishlist.updateMany({}, {
          $pull: {
            items: {
              product: { $in: productIds }
            }
          }
        });
      }
  
    const io = req.app.get('io');
io.emit('brand-toggled', {
  brandId: brand._id,
  newStatus: brand.status
});

res.json({
  success: true,
  status: brand.status,
  message: `Brand successfully ${brand.status}`
});

  
    } catch (error) {
      console.error('Error toggling brand status:', error);
      return res.status(500).json({ 
        success: false,
        error: 'Server error' 
      });
    }
  };