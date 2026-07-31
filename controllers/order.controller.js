const Order      = require('../models/Order.model');
const Product    = require('../models/Product.model');
const User       = require('../models/User.model');
const Influencer = require('../models/Influencer.model');
const { generateOrderId } = require('../utils/generateOrderId');

// ─── Create Order ─────────────────────────────────────────────────────────────
// POST /api/orders
exports.createOrder = async (req, res) => {
  try {
    const { items, shippingAddress, paymentMethod, totalAmount, shippingCharge, transactionId, couponCode, influencerCode, discount } = req.body;

    if (!items || !shippingAddress || !paymentMethod || !totalAmount) {
      return res.status(400).json({ success: false, message: 'Missing required order fields' });
    }

    const parsedItems   = typeof items === 'string'           ? JSON.parse(items)           : items;
    const parsedAddress = typeof shippingAddress === 'string' ? JSON.parse(shippingAddress) : shippingAddress;

    if (!Array.isArray(parsedItems) || parsedItems.length === 0) {
      return res.status(400).json({ success: false, message: 'Order must contain at least one item' });
    }

    // Check stock availability & deduct stock
    for (const item of parsedItems) {
      const prod = await Product.findById(item.product);
      if (!prod) {
        return res.status(404).json({ success: false, message: `Product not found: ${item.name || item.product}` });
      }
      if (prod.stock < item.quantity) {
        return res.status(400).json({
          success: false,
          message: `Insufficient stock for "${prod.name}". Available: ${prod.stock}, requested: ${item.quantity}`,
        });
      }
    }

    // Check Influencer Referral / Coupon Code
    let influencerRef = null;
    let inflCode = '';
    let couponUsed = '';
    let commissionRate = 8;
    let commissionAmount = 0;
    let calculatedDiscount = Number(discount) || 0;

    const itemSubtotal = parsedItems.reduce((acc, it) => acc + Number(it.price) * Number(it.quantity), 0);
    const rawCode = (couponCode || influencerCode || '').trim().toUpperCase();

    if (rawCode) {
      const matchedInfluencer = await Influencer.findOne({
        $or: [{ referralCode: rawCode }, { couponCode: rawCode }],
        status: 'Active',
      });

      if (matchedInfluencer) {
        influencerRef = matchedInfluencer._id;
        inflCode = matchedInfluencer.referralCode;
        couponUsed = matchedInfluencer.couponCode;
        commissionRate = matchedInfluencer.commissionRate || 8;

        if (matchedInfluencer.discountPercentage > 0) {
          calculatedDiscount = Math.round(itemSubtotal * (matchedInfluencer.discountPercentage / 100) * 100) / 100;
        }

        const discountedSubtotal = Math.max(0, itemSubtotal - calculatedDiscount);
        commissionAmount = Math.round(discountedSubtotal * (commissionRate / 100) * 100) / 100;
      }
    }

    const shippingFee = Number(shippingCharge) || 0;
    const finalTotal = Math.max(0, Math.round((itemSubtotal - calculatedDiscount + shippingFee) * 100) / 100);

    // Deduct stock
    for (const item of parsedItems) {
      await Product.findByIdAndUpdate(item.product, {
        $inc: { stock: -item.quantity },
      });
    }

    // Ensure unique orderId
    let orderId;
    let exists = true;
    while (exists) {
      orderId = generateOrderId();
      exists  = await Order.exists({ orderId });
    }

    let paymentScreenshot;
    if (paymentMethod === 'UPI' && req.file) {
      paymentScreenshot = {
        url:       req.file.path,
        public_id: req.file.filename,
      };
    }

    const isPaid = paymentMethod === 'UPI' && !!paymentScreenshot;
    const paymentStatus = paymentMethod === 'UPI' ? (isPaid ? 'Paid' : 'Pending') : 'Pending';

    const order = await Order.create({
      orderId,
      user: req.user._id,
      items: parsedItems,
      shippingAddress: parsedAddress,
      paymentMethod,
      paymentStatus,
      transactionId: transactionId || '',
      paymentScreenshot,
      totalAmount:    finalTotal,
      shippingCharge: shippingFee,
      discount:       calculatedDiscount,
      influencer:     influencerRef,
      influencerCode: inflCode,
      couponCode:     couponUsed,
      commissionRate,
      commissionAmount,
      isPaid,
      status: 'Pending',
      statusHistory: [{ status: 'Pending', note: 'Order placed successfully' }],
    });

    await order.populate('items.product', 'name images price');
    await order.populate('influencer', 'name instagramHandle referralCode couponCode commissionRate');
    res.status(201).json({ success: true, order });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── Cancel Order (User or Admin) ──────────────────────────────────────────────
// POST /api/orders/:id/cancel
exports.cancelOrder = async (req, res) => {
  try {
    const { reason } = req.body;
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    // Check ownership
    if (req.user.role !== 'admin' && order.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    // Cancellation rule check
    const cancelableStatuses = ['Pending', 'Confirmed'];
    if (!cancelableStatuses.includes(order.status)) {
      return res.status(400).json({
        success: false,
        message: `Order cannot be cancelled because it is already ${order.status.toLowerCase()}.`,
      });
    }

    // Restore stock
    for (const item of order.items) {
      if (item.product) {
        await Product.findByIdAndUpdate(item.product, {
          $inc: { stock: item.quantity },
        });
      }
    }

    order.status = 'Cancelled';
    if (order.paymentMethod === 'UPI' || order.isPaid || order.paymentStatus === 'Paid') {
      order.paymentStatus = 'Refund Pending';
    } else {
      order.paymentStatus = 'Failed';
    }

    const cancelNote = reason || (req.user.role === 'admin' ? 'Cancelled by admin' : 'Cancelled by customer');
    order.statusHistory.push({ status: 'Cancelled', note: cancelNote });

    await order.save();
    await order.populate('items.product', 'name images price');
    await order.populate('user', 'name email phone');

    res.json({ success: true, message: 'Order cancelled successfully', order });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── Process Refund (Admin) ──────────────────────────────────────────────────
// PUT /api/orders/:id/refund
exports.processRefund = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    order.paymentStatus = 'Refunded';
    order.statusHistory.push({ status: order.status, note: 'Refund processed by admin' });

    await order.save();
    await order.populate('user', 'name email phone');

    res.json({ success: true, message: 'Refund processed successfully', order });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── Get My Orders ────────────────────────────────────────────────────────────
// GET /api/orders/my
exports.getMyOrders = async (req, res) => {
  try {
    const { status, search, sort = 'newest' } = req.query;
    const query = { user: req.user._id };

    if (status && status !== 'all') {
      query.status = status;
    }

    if (search) {
      query.$or = [
        { orderId: { $regex: search, $options: 'i' } },
        { 'items.name': { $regex: search, $options: 'i' } },
      ];
    }

    const sortOption = sort === 'oldest' ? { createdAt: 1 } : { createdAt: -1 };

    const orders = await Order.find(query)
      .populate('items.product', 'name images price')
      .sort(sortOption);

    res.json({ success: true, orders });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── Get Single Order ─────────────────────────────────────────────────────────
// GET /api/orders/:id
exports.getOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('items.product', 'name images price')
      .populate('user', 'name email phone')
      .populate('influencer', 'name instagramHandle referralCode couponCode commissionRate email phone');

    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    if (
      req.user.role !== 'admin' &&
      order.user._id.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    res.json({ success: true, order });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── Get All Orders (Admin) ───────────────────────────────────────────────────
// GET /api/orders
exports.getAllOrders = async (req, res) => {
  try {
    const { status, search, paymentStatus, influencerId, page = 1, limit = 20 } = req.query;
    const query = {};

    if (status && status !== 'all') {
      query.status = status;
    }
    if (paymentStatus && paymentStatus !== 'all') {
      query.paymentStatus = paymentStatus;
    }
    if (influencerId && influencerId !== 'all') {
      if (influencerId === 'none') {
        query.influencer = null;
      } else {
        query.influencer = influencerId;
      }
    }

    if (search) {
      query.$or = [
        { orderId: { $regex: search, $options: 'i' } },
        { 'shippingAddress.name': { $regex: search, $options: 'i' } },
        { 'shippingAddress.phone': { $regex: search, $options: 'i' } },
        { 'shippingAddress.email': { $regex: search, $options: 'i' } },
        { influencerCode: { $regex: search, $options: 'i' } },
        { couponCode: { $regex: search, $options: 'i' } },
      ];
    }

    const total  = await Order.countDocuments(query);
    const orders = await Order.find(query)
      .populate('user', 'name email phone')
      .populate('items.product', 'name images price')
      .populate('influencer', 'name instagramHandle referralCode couponCode commissionRate')
      .sort({ createdAt: -1 })
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit));

    res.json({
      success: true,
      orders,
      total,
      page:  Number(page),
      pages: Math.ceil(total / Number(limit)),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── Update Order Status (Admin) ──────────────────────────────────────────────
// PUT /api/orders/:id/status
exports.updateOrderStatus = async (req, res) => {
  try {
    const { status, note, trackingNumber, courierName, paymentStatus, transactionId } = req.body;
    const validStatuses = ['Pending', 'Confirmed', 'Packed', 'Shipped', 'Out for Delivery', 'Delivered', 'Cancelled'];

    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    const previousStatus = order.status;

    if (status) {
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ success: false, message: 'Invalid status value' });
      }

      // If changing to Cancelled from non-cancelled status, restore stock
      if (status === 'Cancelled' && previousStatus !== 'Cancelled') {
        for (const item of order.items) {
          if (item.product) {
            await Product.findByIdAndUpdate(item.product, {
              $inc: { stock: item.quantity },
            });
          }
        }
      }

      order.status = status;
      order.statusHistory.push({
        status,
        note: note || `Status updated to ${status}`,
      });

      if (status === 'Delivered') {
        order.isPaid = true;
        order.paymentStatus = 'Paid';
      }
    }

    if (trackingNumber !== undefined) order.trackingNumber = trackingNumber;
    if (courierName !== undefined)    order.courierName = courierName;
    if (paymentStatus !== undefined)  order.paymentStatus = paymentStatus;
    if (transactionId !== undefined)  order.transactionId = transactionId;
    if (note && !status)              order.notes = note;

    await order.save();
    await order.populate('user', 'name email phone');
    await order.populate('items.product', 'name images price');

    res.json({ success: true, order });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── Get Comprehensive Order & Dashboard Stats (Admin) ─────────────────────────
// GET /api/orders/dashboard-stats
exports.getDashboardStats = async (req, res) => {
  try {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfYesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Orders Count Stats
    const totalOrders     = await Order.countDocuments();
    const todayOrders     = await Order.countDocuments({ createdAt: { $gte: startOfToday } });
    const yesterdayOrders = await Order.countDocuments({ createdAt: { $gte: startOfYesterday, $lt: startOfToday } });
    const weeklyOrders    = await Order.countDocuments({ createdAt: { $gte: startOfWeek } });
    const monthlyOrders   = await Order.countDocuments({ createdAt: { $gte: startOfMonth } });

    // Status breakdown
    const pendingOrders   = await Order.countDocuments({ status: 'Pending' });
    const confirmedOrders = await Order.countDocuments({ status: 'Confirmed' });
    const packedOrders    = await Order.countDocuments({ status: 'Packed' });
    const shippedOrders   = await Order.countDocuments({ status: 'Shipped' });
    const deliveredOrders = await Order.countDocuments({ status: 'Delivered' });
    const cancelledOrders = await Order.countDocuments({ status: 'Cancelled' });
    const refundPendingOrders = await Order.countDocuments({ paymentStatus: 'Refund Pending' });

    // Revenue Aggregation
    const getRevenueMatch = (startDate) => ({
      status: { $ne: 'Cancelled' },
      ...(startDate && { createdAt: { $gte: startDate } }),
    });

    const aggregateRevenue = async (match) => {
      const res = await Order.aggregate([
        { $match: match },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } },
      ]);
      return res[0]?.total || 0;
    };

    const totalRevenue   = await aggregateRevenue(getRevenueMatch(null));
    const todayRevenue   = await aggregateRevenue(getRevenueMatch(startOfToday));
    const weeklyRevenue  = await aggregateRevenue(getRevenueMatch(startOfWeek));
    const monthlyRevenue = await aggregateRevenue(getRevenueMatch(startOfMonth));

    const codRevenue = await aggregateRevenue({ status: { $ne: 'Cancelled' }, paymentMethod: 'COD' });
    const upiRevenue = await aggregateRevenue({ status: { $ne: 'Cancelled' }, paymentMethod: 'UPI' });

    // Customer Stats
    const totalCustomers = await User.countDocuments({ role: 'user' });
    const newCustomers   = await User.countDocuments({ role: 'user', createdAt: { $gte: startOfMonth } });
    
    // Returning customers (customers with > 1 completed/valid orders)
    const returningAgg = await Order.aggregate([
      { $match: { status: { $ne: 'Cancelled' } } },
      { $group: { _id: '$user', orderCount: { $sum: 1 } } },
      { $match: { orderCount: { $gt: 1 } } },
      { $count: 'returningCount' },
    ]);
    const returningCustomers = returningAgg[0]?.returningCount || 0;

    // Product Stats
    const totalProducts = await Product.countDocuments();
    const outOfStock    = await Product.countDocuments({ stock: 0 });
    const lowStock      = await Product.countDocuments({ stock: { $gt: 0, $lte: 5 } });

    // Top Selling Products & Top Categories
    const topProductsAgg = await Order.aggregate([
      { $match: { status: { $ne: 'Cancelled' } } },
      { $unwind: '$items' },
      { $group: { _id: '$items.name', totalQty: { $sum: '$items.quantity' }, totalSales: { $sum: { $multiply: ['$items.price', '$items.quantity'] } } } },
      { $sort: { totalQty: -1 } },
      { $limit: 5 },
    ]);

    // Recent 5 Orders & Recent Customers
    const recentOrders = await Order.find()
      .populate('user', 'name email phone')
      .sort({ createdAt: -1 })
      .limit(5);

    const recentCustomers = await User.find({ role: 'user' })
      .select('name email phone createdAt')
      .sort({ createdAt: -1 })
      .limit(5);

    // Sales Graph (Last 7 Days)
    const salesGraph = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const nextD = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i + 1);
      const daySales = await Order.aggregate([
        { $match: { status: { $ne: 'Cancelled' }, createdAt: { $gte: d, $lt: nextD } } },
        { $group: { _id: null, total: { $sum: '$totalAmount' }, count: { $sum: 1 } } },
      ]);
      salesGraph.push({
        date: d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
        revenue: daySales[0]?.total || 0,
        orders: daySales[0]?.count || 0,
      });
    }

    res.json({
      success: true,
      stats: {
        orders: {
          total: totalOrders,
          today: todayOrders,
          yesterday: yesterdayOrders,
          weekly: weeklyOrders,
          monthly: monthlyOrders,
          pending: pendingOrders,
          confirmed: confirmedOrders,
          packed: packedOrders,
          shipped: shippedOrders,
          delivered: deliveredOrders,
          cancelled: cancelledOrders,
          refundPending: refundPendingOrders,
        },
        revenue: {
          total: totalRevenue,
          today: todayRevenue,
          weekly: weeklyRevenue,
          monthly: monthlyRevenue,
          cod: codRevenue,
          upi: upiRevenue,
        },
        customers: {
          total: totalCustomers,
          new: newCustomers,
          returning: returningCustomers,
        },
        products: {
          total: totalProducts,
          outOfStock,
          lowStock,
        },
        analytics: {
          topProducts: topProductsAgg,
          recentOrders,
          recentCustomers,
          salesGraph,
        },
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── Export Orders as CSV (Admin) ─────────────────────────────────────────────
// GET /api/orders/export
exports.exportOrders = async (req, res) => {
  try {
    const orders = await Order.find()
      .populate('user', 'name email phone')
      .sort({ createdAt: -1 });

    const headers = [
      'Order ID', 'Customer Name', 'Customer Email', 'Customer Phone',
      'Street', 'Landmark', 'City', 'State', 'PIN Code',
      'Items Count', 'Payment Method', 'Payment Status', 'Order Status',
      'Total Amount (INR)', 'Order Date',
    ].join(',');

    const rows = orders.map(o => {
      const itemsStr = `"${o.items.map(i => `${i.name} (x${i.quantity})`).join('; ')}"`;
      return [
        o.orderId,
        `"${o.shippingAddress?.name || o.user?.name || ''}"`,
        `"${o.shippingAddress?.email || o.user?.email || ''}"`,
        `"${o.shippingAddress?.phone || o.user?.phone || ''}"`,
        `"${o.shippingAddress?.street || ''}"`,
        `"${o.shippingAddress?.landmark || ''}"`,
        `"${o.shippingAddress?.city || ''}"`,
        `"${o.shippingAddress?.state || ''}"`,
        `"${o.shippingAddress?.pincode || ''}"`,
        itemsStr,
        o.paymentMethod,
        o.paymentStatus,
        o.status,
        o.totalAmount,
        new Date(o.createdAt).toISOString().split('T')[0],
      ].join(',');
    });

    const csvContent = [headers, ...rows].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="ruxova-orders.csv"');
    res.status(200).send(csvContent);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
