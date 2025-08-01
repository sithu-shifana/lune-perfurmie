const Category = require('../../models/categorySchema'); 
exports.validateCategoryAdd = async (req, res, next) => {
    try {
      const { name, description } = req.body;
      const image = req.file;
  
      if (!name && !description && !image) {
        return res.status(400).json({ errorType: "top", error: "All fields are required" });
      }
      if (!name) {
        return res.status(400).json({ errorType: "name", error: "Category name is required" });
      }
      if (!description) {
        return res.status(400).json({ errorType: "description", error: "Description is required" });
      }
      if (!image) {
        return res.status(400).json({ errorType: "image", error: "Category image is required" });
      }
  
      if (name.length < 3) {
        return res.status(400).json({ errorType: "name", error: "Name must be at least 3 characters" });
      }
  
      const existingCategory = await Category.findOne({ name: name.trim() });
      if (existingCategory) {
        return res.status(400).json({ errorType: "top", error: "Category name already exists" });
      }
  
      if (description.length < 10) {
        return res.status(400).json({ errorType: "description", error: "Description must be at least 10 characters" });
      }
  
      const validImageTypes = ['image/jpeg', 'image/jpg', 'image/png'];
      if (!validImageTypes.includes(image.mimetype)) {
        return res.status(400).json({ errorType: "image", error: "Only JPEG/JPG/PNG images are allowed" });
      }
  
      next();
    } catch (err) {
      console.error("Validation error in category add:", err);
      res.status(500).json({ errorType: "top", error: "Server error occurred during validation" });
    }
  };

exports.validateCategoryEdit = async (req, res, next) => {
    try {
      const { name, description } = req.body;
      const image = req.file;
      const categoryId = req.params.id;
  
      if (!name) {
        return res.status(400).json({ errorType: "name", error: "Category name is required" });
      }
      if (!description) {
        return res.status(400).json({ errorType: "description", error: "Description is required" });
      }
  
      if (name.length < 3) {
        return res.status(400).json({ errorType: "name", error: "Name must be at least 3 characters" });
      }
  
      const existingCategory = await Category.findOne({ 
        name: name.trim(),
        _id: { $ne: categoryId }
      });
      if (existingCategory) {
        return res.status(400).json({ errorType: "name", error: "Category name already exists" });
      }
  
      if (description.length < 10) {
        return res.status(400).json({ errorType: "description", error: "Description must be at least 10 characters" });
      }
  
      if (image) {
        const validImageTypes = ['image/jpeg', 'image/jpg', 'image/png'];
        if (!validImageTypes.includes(image.mimetype)) {
          return res.status(400).json({ errorType: "image", error: "Only JPEG/JPG/PNG images are allowed" });
        }
      }
  
      next();
    } catch (err) {
      console.error("Validation error in category edit:", err);
      res.status(500).json({ errorType: "top", error: "Server error occurred during validation" });
    }
  };