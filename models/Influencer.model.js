const mongoose = require('mongoose');

const payoutHistorySchema = new mongoose.Schema({
  amount: {
    type: Number,
    required: true,
  },
  note: {
    type: String,
    default: '',
  },
  paidAt: {
    type: Date,
    default: Date.now,
  },
});

const influencerSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    instagramHandle: {
      type: String,
      trim: true,
      default: '',
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: '',
    },
    phone: {
      type: String,
      trim: true,
      default: '',
    },
    referralCode: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    couponCode: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    discountPercentage: {
      type: Number,
      default: 10, // Default 10% discount for customer when using coupon
    },
    commissionRate: {
      type: Number,
      default: 8, // Default 8% commission for influencer on sales
    },
    paidCommission: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ['Active', 'Inactive'],
      default: 'Active',
    },
    notes: {
      type: String,
      default: '',
    },
    payoutHistory: [payoutHistorySchema],
  },
  { timestamps: true }
);

module.exports = mongoose.model('Influencer', influencerSchema);
