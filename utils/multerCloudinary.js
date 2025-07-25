const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('../config/cloudinary');

const imageFileFilter = (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Invalid file type. Only JPEG, PNG, WebP, and GIF are allowed.'), false);
    }
};

const createCloudinaryStorage = (folderName) => new CloudinaryStorage({
    cloudinary: cloudinary,
    params: async (req, file) => {
        return {
            folder: folderName,
            allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
            public_id: `${folderName}-${Date.now()}-${file.originalname.split('.')[0]}`,
            transformation: [
                { width: 500, height: 600, crop: 'fill' },
                { quality: 'auto' },
                { fetch_format: 'auto' }
            ]
        };
    }
});

const memoryStorage = multer.memoryStorage();

// Function to upload image data URLs directly to Cloudinary
const uploadDataUrlToCloudinary = async (dataUrl, folder, namePrefix, index) => {
    return new Promise((resolve, reject) => {
        cloudinary.uploader.upload(
            dataUrl,
            {
                folder: folder,
                public_id: `${namePrefix}_image${index + 1}_${Date.now()}`,
                transformation: [
                    { width: 500, height: 500, crop: 'fill' }, 
                    { quality: 'auto' },
                    { fetch_format: 'auto' }
                ]
            },
            (error, result) => {
                if (error) reject(error);
                else resolve({
                    url: result.secure_url,
                    publicId: result.public_id
                });
            }
        );
    });
};

const uploadToCloudinary = async (buffer, folder, namePrefix, index) => {
    return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
            {
                folder: folder,
                public_id: `${namePrefix}_image${index + 1}_${Date.now()}`,
                transformation: [
                    { width: 500, height: 500, crop: 'fill' }, 
                    { quality: 'auto' },
                    { fetch_format: 'auto' }
                ]
            },
            (error, result) => {
                if (error) reject(error);
                else resolve({
                    url: result.secure_url,
                    publicId: result.public_id
                });
            }
        );
        uploadStream.end(buffer);
    });
};

// Category upload 
const uploadCategory = multer({
    storage: createCloudinaryStorage('categories'),
    fileFilter: imageFileFilter,
    limits: { fileSize: 5 * 1024 * 1024 } 
});

// Brand upload 
const uploadBrand = multer({
    storage: createCloudinaryStorage('brands'),
    fileFilter: imageFileFilter,
    limits: { fileSize: 5 * 1024 * 1024 } 
});

// Product upload
const uploadProduct = [
    multer({
        storage: memoryStorage,
        fileFilter: imageFileFilter,
        limits: { 
            fileSize: 5 * 1024 * 1024, 
            files: 3 
        }
    }).fields([
        { name: 'image1', maxCount: 1 },
        { name: 'image2', maxCount: 1 },
        { name: 'image3', maxCount: 1 }
    ]),
    async (req, res, next) => {
        try {
            const { productName } = req.body;
            if (!productName) {
                return res.status(400).json({ error: 'Product name is required' });
            }

            req.processedImages = [];
            
            const imageKeys = ['image1', 'image2', 'image3'];
            
            for (let i = 0; i < imageKeys.length; i++) {
                const key = imageKeys[i];
                const croppedDataUrl = req.body[`cropped_${key}`];
                
                if (croppedDataUrl) {
                    try {
                        const result = await uploadDataUrlToCloudinary(
                            croppedDataUrl, 
                            'products', 
                            productName, 
                            i
                        );
                        req.processedImages.push(result);
                    } catch (error) {
                        console.error(`Error uploading cropped image ${key}:`, error);
                        if (req.files[key] && req.files[key][0]) {
                            const result = await uploadToCloudinary(
                                req.files[key][0].buffer, 
                                'products', 
                                productName, 
                                i
                            );
                            req.processedImages.push(result);
                        }
                    }
                } 
                else if (req.files[key] && req.files[key][0]) {
                    const result = await uploadToCloudinary(
                        req.files[key][0].buffer, 
                        'products', 
                        productName, 
                        i
                    );
                    req.processedImages.push(result);
                }
            }

            next();
        } catch (error) {
            console.error('Product image upload error:', error);
            res.status(500).json({ error: 'Image upload failed', details: error.message });
        }
    }
];

module.exports = {
    uploadCategory,
    uploadBrand,
    uploadProduct
};