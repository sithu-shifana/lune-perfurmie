const Category=require('../../models/categorySchema');
const cloudinary = require('../../config/cloudinary'); // adjust path accordingly

exports.getCategoryPage=async(req,res)=>{
    try{
        let query={};
        let searchQuery=(req.query.search||'').trim();
        let page=parseInt(req.query.page)||1;
        let limit=4;
        let skip=(page-1)*limit;

        if(searchQuery){
            query = { name: { $regex: searchQuery, $options: 'i' } }; // Case-insensitive search
         }
        const totalCategory = await Category.countDocuments(searchQuery);
        const categories = await Category.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

        const totalPages=Math.ceil(totalCategory/limit)

        res.render('admin/category/categoryManagement',{
            categories,
            totalCategory,
            searchQuery,
            currentPage:page,
            totalPages
        })

    }catch(error){
          console.error('Error fetching categories:', error);
        res.status(500).send('Server error');

    }
}


exports.getaddcategorypage=async(req,res)=>{
    try{
        res.render('admin/category/category-add');
    }catch(error){
          console.error('Error fetching category add page',error);
        res.status(500).send('Server error');
    }
}


exports.addCategory=async(req,res)=>{
    try{
    const { name, description } = req.body;

    const existingCategory = await Category.findOne({ 
      name: { $regex: new RegExp(`^${name}$`, 'i') } 
    });

    if (existingCategory) {
      return res.status(400).json({ errorType: "top", error: "Category already exists" });
    }

    const result = await cloudinary.uploader.upload(req.file.path);

    const newCategory = new Category({
      name: name,
      description: description || '',
      imageUrl: result.secure_url,
      imagePublicId: result.public_id,
      status: 'listed'
    });

    await newCategory.save();

    return res.status(200).json({ message: "Category added successfully" });

    }catch(error){
       console.error('Error adding category:', error);
        return res.status(500).json({ errorType: "top", error: "An error occurred while adding the category" });
    }
}

exports.getCategoryEditPage=async(req,res)=>{
    try{
        const category=await Category.findById(req.params.id)
        res.render('admin/category/category-edit',{category,error:null})

    }catch(error){
        console.error('Error fetching category Edit page',error);
        res.status(500).send('Server error');

    }
  }

exports.EditCategory=async(req,res)=>{
    try{
        const { name, description } = req.body;
        const category = await Category.findById(req.params.id);

    const existingCategory = await Category.findOne({ 
        name: { $regex: new RegExp(`^${name}$`, 'i') },
        _id: { $ne: req.params.id } // Exclude the current category
      });

       if(existingCategory){
        return res.status(400).json({error:'Category already Exists'})
      }
      category.name=name;
      category.description=description||category.description;

    if(req.file){
      if(category.imagePublicId){
        await cloudinary.uploader.destroy(category.imagePublicId);
        }

      const result = await cloudinary.uploader.upload(req.file.path);

      category.imageUrl = result.secure_url;
      category.imagePublicId = result.public_id;
    }
         await category.save();
          return res.json({message:'Category updated Succussfully'})


    }catch(error){
 console.error('Error updating category:', error);
    return res.status(500).json({ error: 'An error occurred while updating the category' });
    }
  
}

exports.toggleStatus = async (req, res) => {
    try {
      const category = await Category.findById(req.params.id);
      category.status = category.status === 'listed' ? 'unlisted' : 'listed';
      await category.save();
      res.json({ message: `Category successfully ${category.status === 'listed' ? 'listed' : 'unlisted'}` });

    } catch (error) {
      console.error('Error toggling category status:', error);
      return res.status(500).json({ error: 'Server error' });
    }
  };