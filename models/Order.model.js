const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: false,
  },
  productId:   { type: String, required: true, default: 'ruxova-premium' },
  productName: { type: String, required: true, default: 'RUXOVA Premium Eau De Parfum' },
  name:        { type: String },
  size:        { type: String, required: true, default: '50ml' },
  price:       { type: Number, required: true },
  quantity:    { type: Number, required: true, min: 1, default: 1 },
});

const orderSchema = new mongoose.Schema(
  {
    orderId: {
      type: String,
      unique: true,
      required: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    items: [orderItemSchema],
    shippingAddress: {
      name:     { type: String, required: true },
      phone:    { type: String, required: true },
      email:    { type: String },
      street:   { type: String, required: true },
      landmark: { type: String, default: '' },
      city:     { type: String, required: true },
      state:    { type: String, required: true },
      pincode:  { type: String, required: true },
    },
    paymentMethod: {
      type: String,
      enum: ['COD', 'UPI'],
      required: true,
    },
    paymentStatus: {
      type: String,
      enum: ['Pending', 'Paid', 'Failed', 'Refund Pending', 'Refunded'],
      default: 'Pending',
    },
    transactionId: {
      type: String,
      default: '',
    },
    paymentScreenshot: {
      url:       { type: String },
      public_id: { type: String },
    },
    isPaid: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: ['Pending', 'Confirmed', 'Packed', 'Shipped', 'Out for Delivery', 'Delivered', 'Cancelled'],
      default: 'Pending',
    },
    trackingNumber: { type: String, default: '' },
    courierName:    { type: String, default: '' },
    statusHistory: [
      {
        status: String,
        note:   String,
        updatedAt: { type: Date, default: Date.now },
      },
    ],
    totalAmount:    { type: Number, required: true },
    shippingCharge: { type: Number, default: 0 },
    discount:       { type: Number, default: 0 },
    notes: String, // Admin notes
    influencer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Influencer',
    },
    influencerCode: { type: String, default: '' },
    couponCode:     { type: String, default: '' },
    commissionRate: { type: Number, default: 8 },
  },
  { timestamps: true }
);

orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index({ status: 1, createdAt: -1 });
orderSchema.index({ paymentStatus: 1 });
orderSchema.index({ influencer: 1, status: 1 });
orderSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Order', orderSchema);
