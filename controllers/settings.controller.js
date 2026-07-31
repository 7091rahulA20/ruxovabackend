const Settings = require('../models/Settings.model');

// ─── Get Settings (Public) ────────────────────────────────────────────────────
// GET /api/settings
exports.getSettings = async (req, res) => {
  try {
    let settings = await Settings.findOne();
    if (!settings) {
      settings = await Settings.create({
        shippingCharge:        99,
        freeShippingThreshold: 999,
        upiId:                 process.env.UPI_ID   || 'rahul947372@ybl',
        upiName:               process.env.UPI_NAME || 'RUXOVA PERFUMES',
        upiNote:               process.env.UPI_NOTE || 'Payment for Order',
        storeUrl:              process.env.STORE_URL || 'http://localhost:3000',
      });
    }
    res.json({ success: true, settings });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── Update Settings (Admin Only) ─────────────────────────────────────────────
// PUT /api/settings
exports.updateSettings = async (req, res) => {
  try {
    const { shippingCharge, freeShippingThreshold, upiId, upiName, upiNote, storeUrl } = req.body;
    let settings = await Settings.findOne();

    if (!settings) {
      settings = new Settings();
    }

    if (shippingCharge !== undefined)        settings.shippingCharge        = Number(shippingCharge);
    if (freeShippingThreshold !== undefined) settings.freeShippingThreshold = Number(freeShippingThreshold);
    if (upiId !== undefined)                 settings.upiId                 = upiId;
    if (upiName !== undefined)               settings.upiName               = upiName;
    if (upiNote !== undefined)               settings.upiNote               = upiNote;
    if (storeUrl !== undefined)              settings.storeUrl              = storeUrl.trim();

    await settings.save();
    res.json({ success: true, message: 'Settings updated successfully', settings });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
