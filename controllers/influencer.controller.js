const Influencer = require('../models/Influencer.model');
const Order = require('../models/Order.model');

// ─── Create Influencer (Admin) ─────────────────────────────────────────────
// POST /api/influencers
exports.createInfluencer = async (req, res) => {
  try {
    const {
      name,
      instagramHandle,
      email,
      phone,
      referralCode,
      couponCode,
      discountPercentage,
      commissionRate,
      status,
      notes,
    } = req.body;

    if (!name || !referralCode || !couponCode) {
      return res.status(400).json({
        success: false,
        message: 'Name, Unique Referral Code, and Unique Coupon Code are required',
      });
    }

    const cleanRef = referralCode.trim().toUpperCase();
    const cleanCoupon = couponCode.trim().toUpperCase();

    // Check uniqueness
    const existingRef = await Influencer.findOne({
      $or: [{ referralCode: cleanRef }, { couponCode: cleanRef }],
    });
    if (existingRef) {
      return res.status(400).json({
        success: false,
        message: `Referral code "${cleanRef}" is already in use`,
      });
    }

    const existingCoupon = await Influencer.findOne({
      $or: [{ referralCode: cleanCoupon }, { couponCode: cleanCoupon }],
    });
    if (existingCoupon) {
      return res.status(400).json({
        success: false,
        message: `Coupon code "${cleanCoupon}" is already in use`,
      });
    }

    const influencer = await Influencer.create({
      name: name.trim(),
      instagramHandle: instagramHandle ? instagramHandle.trim() : '',
      email: email ? email.trim() : '',
      phone: phone ? phone.trim() : '',
      referralCode: cleanRef,
      couponCode: cleanCoupon,
      discountPercentage: Number(discountPercentage) >= 0 ? Number(discountPercentage) : 10,
      commissionRate: Number(commissionRate) >= 0 ? Number(commissionRate) : 8,
      status: status || 'Active',
      notes: notes || '',
    });

    res.status(201).json({
      success: true,
      message: 'Influencer created successfully',
      influencer,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── Get All Influencers with Performance Metrics (Admin) ─────────────────
// GET /api/influencers
exports.getAllInfluencers = async (req, res) => {
  try {
    const [influencers, influencerStats] = await Promise.all([
      Influencer.find().sort({ createdAt: -1 }).lean(),
      Order.aggregate([
        {
          $match: {
            influencer: { $ne: null },
            status: { $ne: 'Cancelled' },
          },
        },
        {
          $group: {
            _id: '$influencer',
            totalOrders: { $sum: 1 },
            totalSales: { $sum: '$totalAmount' },
            totalCommission: { $sum: '$commissionAmount' },
          },
        },
      ]),
    ]);

    const statsMap = {};
    influencerStats.forEach((stat) => {
      if (stat._id) {
        statsMap[stat._id.toString()] = stat;
      }
    });

    const result = influencers.map((infl) => {
      const inflObj = infl;
      const stats = statsMap[infl._id.toString()] || {
        totalOrders: 0,
        totalSales: 0,
        totalCommission: 0,
      };

      const totalCommission = stats.totalCommission || 0;
      const paidCommission = infl.paidCommission || 0;
      const pendingCommission = Math.max(0, totalCommission - paidCommission);

      return {
        ...inflObj,
        totalOrders: stats.totalOrders || 0,
        totalSales: stats.totalSales || 0,
        totalCommission,
        paidCommission,
        pendingCommission,
      };
    });

    // Summary totals for overview cards
    const overallStats = {
      totalInfluencers: result.length,
      activeInfluencers: result.filter((i) => i.status === 'Active').length,
      totalSales: result.reduce((acc, i) => acc + i.totalSales, 0),
      totalOrders: result.reduce((acc, i) => acc + i.totalOrders, 0),
      totalCommission: result.reduce((acc, i) => acc + i.totalCommission, 0),
      totalPaidCommission: result.reduce((acc, i) => acc + i.paidCommission, 0),
      totalPendingCommission: result.reduce((acc, i) => acc + i.pendingCommission, 0),
    };

    res.json({
      success: true,
      influencers: result,
      summary: overallStats,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── Get Single Influencer & Generated Orders (Admin) ─────────────────────
// GET /api/influencers/:id
exports.getInfluencer = async (req, res) => {
  try {
    const influencer = await Influencer.findById(req.params.id);
    if (!influencer) {
      return res.status(404).json({ success: false, message: 'Influencer not found' });
    }

    const orders = await Order.find({
      influencer: influencer._id,
    })
      .populate('user', 'name email phone')
      .sort({ createdAt: -1 });

    const validOrders = orders.filter((o) => o.status !== 'Cancelled');
    const totalOrders = validOrders.length;
    const totalSales = validOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
    const totalCommission = validOrders.reduce((sum, o) => sum + (o.commissionAmount || 0), 0);
    const paidCommission = influencer.paidCommission || 0;
    const pendingCommission = Math.max(0, totalCommission - paidCommission);

    res.json({
      success: true,
      influencer: {
        ...influencer.toObject(),
        totalOrders,
        totalSales,
        totalCommission,
        paidCommission,
        pendingCommission,
      },
      orders,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── Update Influencer (Admin) ─────────────────────────────────────────────
// PUT /api/influencers/:id
exports.updateInfluencer = async (req, res) => {
  try {
    const influencer = await Influencer.findById(req.params.id);
    if (!influencer) {
      return res.status(404).json({ success: false, message: 'Influencer not found' });
    }

    const {
      name,
      instagramHandle,
      email,
      phone,
      referralCode,
      couponCode,
      discountPercentage,
      commissionRate,
      status,
      notes,
    } = req.body;

    if (referralCode) {
      const cleanRef = referralCode.trim().toUpperCase();
      const existing = await Influencer.findOne({
        _id: { $ne: influencer._id },
        $or: [{ referralCode: cleanRef }, { couponCode: cleanRef }],
      });
      if (existing) {
        return res.status(400).json({
          success: false,
          message: `Referral code "${cleanRef}" is already used by another influencer`,
        });
      }
      influencer.referralCode = cleanRef;
    }

    if (couponCode) {
      const cleanCoupon = couponCode.trim().toUpperCase();
      const existing = await Influencer.findOne({
        _id: { $ne: influencer._id },
        $or: [{ referralCode: cleanCoupon }, { couponCode: cleanCoupon }],
      });
      if (existing) {
        return res.status(400).json({
          success: false,
          message: `Coupon code "${cleanCoupon}" is already used by another influencer`,
        });
      }
      influencer.couponCode = cleanCoupon;
    }

    if (name) influencer.name = name.trim();
    if (instagramHandle !== undefined) influencer.instagramHandle = instagramHandle.trim();
    if (email !== undefined) influencer.email = email.trim();
    if (phone !== undefined) influencer.phone = phone.trim();
    if (discountPercentage !== undefined) influencer.discountPercentage = Number(discountPercentage);
    if (commissionRate !== undefined) influencer.commissionRate = Number(commissionRate);
    if (status) influencer.status = status;
    if (notes !== undefined) influencer.notes = notes;

    await influencer.save();

    res.json({
      success: true,
      message: 'Influencer updated successfully',
      influencer,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── Delete Influencer (Admin) ─────────────────────────────────────────────
// DELETE /api/influencers/:id
exports.deleteInfluencer = async (req, res) => {
  try {
    const influencer = await Influencer.findById(req.params.id);
    if (!influencer) {
      return res.status(404).json({ success: false, message: 'Influencer not found' });
    }

    await Influencer.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Influencer deleted successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── Record Payout to Influencer (Admin) ────────────────────────────────────
// POST /api/influencers/:id/payout
exports.recordPayout = async (req, res) => {
  try {
    const { amount, note } = req.body;
    const payoutAmount = Number(amount);

    if (isNaN(payoutAmount) || payoutAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Valid positive payout amount is required',
      });
    }

    const influencer = await Influencer.findById(req.params.id);
    if (!influencer) {
      return res.status(404).json({ success: false, message: 'Influencer not found' });
    }

    influencer.paidCommission = (influencer.paidCommission || 0) + payoutAmount;
    influencer.payoutHistory.push({
      amount: payoutAmount,
      note: note || 'Commission payout',
      paidAt: new Date(),
    });

    await influencer.save();

    res.json({
      success: true,
      message: `Payout of ₹${payoutAmount} recorded for ${influencer.name}`,
      influencer,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── Validate Coupon / Referral Code (Public) ──────────────────────────────
// GET /api/influencers/validate-coupon/:code
exports.validateCoupon = async (req, res) => {
  try {
    const rawCode = req.params.code;
    if (!rawCode) {
      return res.status(400).json({ success: false, message: 'Code is required' });
    }

    const cleanCode = rawCode.trim().toUpperCase();

    const influencer = await Influencer.findOne({
      $or: [{ referralCode: cleanCode }, { couponCode: cleanCode }],
      status: 'Active',
    }).lean();

    if (!influencer) {
      return res.status(404).json({
        success: false,
        valid: false,
        message: 'Invalid or inactive coupon/referral code',
      });
    }

    res.json({
      success: true,
      valid: true,
      code: cleanCode,
      referralCode: influencer.referralCode,
      couponCode: influencer.couponCode,
      discountPercentage: influencer.discountPercentage,
      commissionRate: influencer.commissionRate,
      influencerName: influencer.name,
      message: `Code applied! ${influencer.discountPercentage}% discount applied.`,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
