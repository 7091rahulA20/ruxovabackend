const express = require('express');
const router  = express.Router();
const {
  getProducts, getFeatured, getMostLoved, getProduct,
  createProduct, updateProduct, deleteProduct, deleteProductImage,
  setCoverImage, addReview,
} = require('../controllers/product.controller');
const { protect }  = require('../middleware/auth.middleware');
const { isAdmin }  = require('../middleware/admin.middleware');
const { uploadProductImages } = require('../config/cloudinary');

// Public
router.get('/',           getProducts);
router.get('/featured',   getFeatured);
router.get('/most-loved', getMostLoved);
router.get('/:id',        getProduct);

// Protected (logged-in users)
router.post('/:id/reviews', protect, addReview);

// Admin only
router.post(
  '/',
  protect, isAdmin,
  uploadProductImages.array('images', 10),
  createProduct
);
router.put(
  '/:id',
  protect, isAdmin,
  uploadProductImages.array('images', 10),
  updateProduct
);
router.put('/:id/images/set-cover',     protect, isAdmin, setCoverImage);
router.delete('/:id',                   protect, isAdmin, deleteProduct);
router.delete('/:id/images/*',         protect, isAdmin, deleteProductImage);
router.delete('/:id/images/:public_id', protect, isAdmin, deleteProductImage);

module.exports = router;
