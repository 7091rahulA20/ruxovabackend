const express = require('express');
const router  = express.Router();
const {
  createOrder, getMyOrders, getOrder, cancelOrder,
  getAllOrders, updateOrderStatus, processRefund,
  getDashboardStats, exportOrders,
} = require('../controllers/order.controller');
const { protect }  = require('../middleware/auth.middleware');
const { isAdmin }  = require('../middleware/admin.middleware');
const { uploadScreenshot } = require('../config/cloudinary');

// User routes
router.post(
  '/',
  protect,
  uploadScreenshot.single('paymentScreenshot'),
  createOrder
);
router.get('/my',                protect, getMyOrders);
router.post('/:id/cancel',       protect, cancelOrder);
router.get('/dashboard-stats',   protect, isAdmin, getDashboardStats);
router.get('/export',            protect, isAdmin, exportOrders);
router.get('/:id',               protect, getOrder);

// Admin routes
router.get('/',            protect, isAdmin, getAllOrders);
router.put('/:id/status',  protect, isAdmin, updateOrderStatus);
router.put('/:id/refund',  protect, isAdmin, processRefund);

module.exports = router;
