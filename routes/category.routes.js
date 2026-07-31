const express = require('express');
const router  = express.Router();
const {
  getCategories, getCategory, createCategory, updateCategory, deleteCategory,
} = require('../controllers/category.controller');
const { protect }  = require('../middleware/auth.middleware');
const { isAdmin }  = require('../middleware/admin.middleware');
const { uploadCategoryImage } = require('../config/cloudinary');

// Public
router.get('/',    getCategories);
router.get('/:id', getCategory);

// Admin
router.post('/',    protect, isAdmin, uploadCategoryImage.single('image'), createCategory);
router.put('/:id',  protect, isAdmin, uploadCategoryImage.single('image'), updateCategory);
router.delete('/:id', protect, isAdmin, deleteCategory);

module.exports = router;
