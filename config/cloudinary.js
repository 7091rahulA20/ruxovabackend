const cloudinaryPkg = require('cloudinary');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

// cloudinary v1 uses cloudinary.v2
const cloudinary = cloudinaryPkg.v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Storage for Product Images
const productStorage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => ({
    folder: 'ruxova/products',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [{ width: 900, height: 900, crop: 'limit', quality: 'auto' }],
    public_id: `product_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
  }),
});

// Storage for UPI Payment Screenshots
const screenshotStorage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => ({
    folder: 'ruxova/payment-screenshots',
    allowed_formats: ['jpg', 'jpeg', 'png', 'pdf', 'webp'],
    public_id: `screenshot_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
  }),
});

// Storage for Category Images
const categoryStorage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => ({
    folder: 'ruxova/categories',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [{ width: 400, height: 400, crop: 'fill', quality: 'auto' }],
    public_id: `cat_${Date.now()}`,
  }),
});

const uploadProductImages = multer({ storage: productStorage });
const uploadScreenshot    = multer({ storage: screenshotStorage });
const uploadCategoryImage = multer({ storage: categoryStorage });

module.exports = {
  cloudinary,
  uploadProductImages,
  uploadScreenshot,
  uploadCategoryImage,
};
