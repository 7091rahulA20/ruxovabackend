const express = require('express');
const router = express.Router();
const {
  createInfluencer,
  getAllInfluencers,
  getInfluencer,
  updateInfluencer,
  deleteInfluencer,
  recordPayout,
  validateCoupon,
} = require('../controllers/influencer.controller');
const { protect } = require('../middleware/auth.middleware');
const { isAdmin } = require('../middleware/admin.middleware');

// Public route for storefront to validate code
router.get('/validate-coupon/:code', validateCoupon);

// Admin routes
router.use(protect, isAdmin);
router.post('/', createInfluencer);
router.get('/', getAllInfluencers);
router.get('/:id', getInfluencer);
router.put('/:id', updateInfluencer);
router.delete('/:id', deleteInfluencer);
router.post('/:id/payout', recordPayout);

module.exports = router;
