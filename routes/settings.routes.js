const express = require('express');
const router  = express.Router();
const { getSettings, updateSettings } = require('../controllers/settings.controller');
const { protect } = require('../middleware/auth.middleware');
const { isAdmin } = require('../middleware/admin.middleware');

// Public settings (for client checkout & cart)
router.get('/', getSettings);

// Also maintain legacy endpoint aliases for backward compatibility
router.get('/upi', async (req, res) => {
  try {
    const { settings } = await require('../controllers/settings.controller').getSettingsInternal();
    res.json({ success: true, upi: { id: settings.upiId, name: settings.upiName, note: settings.upiNote } });
  } catch {
    res.json({ success: true, upi: { id: process.env.UPI_ID || 'rahul947372@ybl', name: process.env.UPI_NAME || 'RUXOVA PERFUMES', note: process.env.UPI_NOTE || 'Payment for Order' } });
  }
});

router.get('/store', async (req, res) => {
  try {
    const Settings = require('../models/Settings.model');
    let settings = await Settings.findOne();
    if (!settings) {
      settings = { shippingCharge: 99, freeShippingThreshold: 999 };
    }
    res.json({
      success: true,
      store: {
        name:          'RUXOVA PERFUMES',
        tagline:       'Luxury Fragrances. Timeless Elegance.',
        currency:      'INR',
        currencySymbol: '₹',
        freeShipping:  settings.freeShippingThreshold,
        shippingCharge: settings.shippingCharge,
        phone:         process.env.STORE_PHONE || '+91 98765 43210',
        email:         process.env.STORE_EMAIL || 'hello@ruxova.com',
        address:       process.env.STORE_ADDRESS || 'India',
      },
    });
  } catch {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Admin setting update route
router.put('/', protect, isAdmin, updateSettings);

module.exports = router;
