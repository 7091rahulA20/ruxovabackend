const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema(
  {
    shippingCharge: {
      type: Number,
      default: 99,
      min: 0,
    },
    freeShippingThreshold: {
      type: Number,
      default: 999,
      min: 0,
    },
    upiId: {
      type: String,
      default: process.env.UPI_ID || 'rahul947372@ybl',
    },
    upiName: {
      type: String,
      default: process.env.UPI_NAME || 'RUXOVA PERFUMES',
    },
    upiNote: {
      type: String,
      default: process.env.UPI_NOTE || 'Payment for Order',
    },
    storeUrl: {
      type: String,
      default: process.env.STORE_URL || 'http://localhost:3000',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Settings', settingsSchema);
