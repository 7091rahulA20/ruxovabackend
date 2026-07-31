const express = require('express');
const router  = express.Router();
const {
  getAllUsers, toggleWishlist, getWishlist, deactivateUser,
  toggleUserStatus, deleteUser, exportUsers, getUserStats,
} = require('../controllers/user.controller');
const { protect } = require('../middleware/auth.middleware');
const { isAdmin } = require('../middleware/admin.middleware');

// User routes (protected)
router.put('/wishlist/:productId', protect, toggleWishlist);
router.get('/wishlist',            protect, getWishlist);

// Admin routes
router.get('/stats',          protect, isAdmin, getUserStats);
router.get('/export',         protect, isAdmin, exportUsers);
router.get('/',               protect, isAdmin, getAllUsers);
router.put('/:id/status',     protect, isAdmin, toggleUserStatus);
router.put('/:id/deactivate', protect, isAdmin, deactivateUser);
router.delete('/:id',         protect, isAdmin, deleteUser);

module.exports = router;
