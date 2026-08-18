const Order      = require('../models/Order.model');
const Product    = require('../models/Product.model');
const User       = require('../models/User.model');
const Influencer = require('../models/Influencer.model');
const { generateOrderId } = require('../utils/generateOrderId');

// ─── Create Order ─────────────────────────────────────────────────────────────
// POST /api/orders
exports.createOrder = async (req, res) => {
  try {
    let { items, shippingAddress, paymentMethod, totalAmount, shippingCharge, transactionId, couponCode, influencerCode, discount } = req.body;

    // Defensive unwrapping if parameters arrive as arrays from multi-part FormData
    if (Array.isArray(paymentMethod))   paymentMethod   = paymentMethod[0];
    if (Array.isArray(shippingAddress)) shippingAddress = shippingAddress[0];
    if (Array.isArray(totalAmount))     totalAmount     = totalAmount[0];
    if (Array.isArray(items) && typeof items[0] === 'string') items = items[0];

    if (!items || !shippingAddress || !paymentMethod || !totalAmount) {
      return res.status(400).json({ success: false, message: 'Missing required order fields' });
    }

    const parsedItems   = typeof items === 'string'           ? JSON.parse(items)           : items;
    const parsedAddress = typeof shippingAddress === 'string' ? JSON.parse(shippingAddress) : shippingAddress;

    if (!Array.isArray(parsedItems) || parsedItems.length === 0) {
      return res.status(400).json({ success: false, message: 'Order must contain at least one item' });
    }

    const mongoose = require('mongoose');

    // Process & sanitize items array with database price & name verification
    const sanitizedItems = [];
    for (const it of parsedItems) {
      const pId = it.productId || (typeof it.product === 'string' ? it.product : 'ruxova-premium');
      let pName = it.productName || it.name || 'RUXOVA Premium Eau De Parfum';
      let verifiedPrice = Number(it.price) || 0;
      let isObjId = it.product && mongoose.Types.ObjectId.isValid(it.product);

      let dbProduct = null;
      if (isObjId) {
        dbProduct = await Product.findById(it.product).lean();
      } else if (pId) {
        dbProduct = await Product.findOne({ $or: [{ productId: pId }, { slug: pId }] }).lean();
      }

      if (dbProduct) {
        pName = dbProduct.name;
        const itemSizeNorm = (it.size || '50ml').toString().toLowerCase();
        if (dbProduct.sizes && dbProduct.sizes.length > 0) {
          const matchSize = dbProduct.sizes.find(s => s.size.toLowerCase() === itemSizeNorm);
          if (matchSize && matchSize.price) {
            verifiedPrice = matchSize.price;
          }
        } else if (dbProduct.price) {
          verifiedPrice = dbProduct.price;
        }
      }

      sanitizedItems.push({
        product: dbProduct ? dbProduct._id : (isObjId ? it.product : undefined),
        productId: pId,
        productName: pName,
        name: pName,
        size: (it.size || '50ml').toString(),
        price: verifiedPrice || Number(it.price) || 450,
        quantity: Math.max(1, Number(it.quantity) || 1),
      });
    }

    // Check stock availability for items linked to DB Product models
    for (const item of sanitizedItems) {
      if (item.product) {
        const prod = await Product.findById(item.product).lean();
        if (prod && prod.stock < item.quantity) {
          return res.status(400).json({
            success: false,
            message: `Insufficient stock for "${prod.name}". Available: ${prod.stock}, requested: ${item.quantity}`,
          });
        }
      }
    }

    // Check Influencer Referral / Coupon Code
    let influencerRef = null;
    let inflCode = '';
    let couponUsed = '';
    let commissionRate = 8;
    let commissionAmount = 0;
    let calculatedDiscount = Number(discount) || 0;

    const itemSubtotal = sanitizedItems.reduce((acc, it) => acc + Number(it.price) * Number(it.quantity), 0);
    const rawCode = (couponCode || influencerCode || '').trim().toUpperCase();

    if (rawCode) {
      const matchedInfluencer = await Influencer.findOne({
        $or: [{ referralCode: rawCode }, { couponCode: rawCode }],
        status: 'Active',
      }).lean();

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

    // Deduct stock in parallel for DB-linked items
    await Promise.all(
      sanitizedItems
        .filter(item => item.product)
        .map(item =>
          Product.findByIdAndUpdate(item.product, {
            $inc: { stock: -item.quantity },
          })
        )
    );

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
      items: sanitizedItems,
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

    if (req.user.role !== 'admin' && order.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const cancelableStatuses = ['Pending', 'Confirmed'];
    if (!cancelableStatuses.includes(order.status)) {
      return res.status(400).json({
        success: false,
        message: `Order cannot be cancelled because it is already ${order.status.toLowerCase()}.`,
      });
    }

    // Restore stock in parallel
    await Promise.all(
      order.items.map(item => {
        if (item.product) {
          return Product.findByIdAndUpdate(item.product, {
            $inc: { stock: item.quantity },
          });
        }
        return Promise.resolve();
      })
    );

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
      .sort(sortOption)
      .lean();

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
      .populate('influencer', 'name instagramHandle referralCode couponCode commissionRate email phone')
      .lean();

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
      const searchRegex = new RegExp(search.trim(), 'i');
      query.$or = [
        { orderId: searchRegex },
        { 'shippingAddress.name': searchRegex },
        { 'shippingAddress.phone': searchRegex },
        { 'shippingAddress.email': searchRegex },
        { influencerCode: searchRegex },
        { couponCode: searchRegex },
      ];
    }

    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.max(1, Number(limit));

    // Parallelize count and find queries with .lean()
    const [total, orders] = await Promise.all([
      Order.countDocuments(query),
      Order.find(query)
        .populate('user', 'name email phone')
        .populate('items.product', 'name images price')
        .populate('influencer', 'name instagramHandle referralCode couponCode commissionRate')
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
    ]);

    res.json({
      success: true,
      orders,
      total,
      page: pageNum,
      pages: Math.ceil(total / limitNum),
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

      if (status === 'Cancelled' && previousStatus !== 'Cancelled') {
        await Promise.all(
          order.items.map(item => {
            if (item.product) {
              return Product.findByIdAndUpdate(item.product, {
                $inc: { stock: item.quantity },
              });
            }
            return Promise.resolve();
          })
        );
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

    // Parallelize all count, aggregate, and list queries simultaneously!
    const [
      ordersCountRes,
      revenueRes,
      customerRes,
      productRes,
      topProductsAgg,
      recentOrders,
      recentCustomers,
      salesGraphAgg,
    ] = await Promise.all([
      // 1. Order status counts in single aggregation
      Order.aggregate([
        {
          $facet: {
            total: [{ $count: 'count' }],
            today: [{ $match: { createdAt: { $gte: startOfToday } } }, { $count: 'count' }],
            yesterday: [{ $match: { createdAt: { $gte: startOfYesterday, $lt: startOfToday } } }, { $count: 'count' }],
            weekly: [{ $match: { createdAt: { $gte: startOfWeek } } }, { $count: 'count' }],
            monthly: [{ $match: { createdAt: { $gte: startOfMonth } } }, { $count: 'count' }],
            pending: [{ $match: { status: 'Pending' } }, { $count: 'count' }],
            confirmed: [{ $match: { status: 'Confirmed' } }, { $count: 'count' }],
            packed: [{ $match: { status: 'Packed' } }, { $count: 'count' }],
            shipped: [{ $match: { status: 'Shipped' } }, { $count: 'count' }],
            delivered: [{ $match: { status: 'Delivered' } }, { $count: 'count' }],
            cancelled: [{ $match: { status: 'Cancelled' } }, { $count: 'count' }],
            refundPending: [{ $match: { paymentStatus: 'Refund Pending' } }, { $count: 'count' }],
          },
        },
      ]),

      // 2. Revenue aggregation in single facet
      Order.aggregate([
        { $match: { status: { $ne: 'Cancelled' } } },
        {
          $facet: {
            total: [{ $group: { _id: null, sum: { $sum: '$totalAmount' } } }],
            today: [{ $match: { createdAt: { $gte: startOfToday } } }, { $group: { _id: null, sum: { $sum: '$totalAmount' } } }],
            weekly: [{ $match: { createdAt: { $gte: startOfWeek } } }, { $group: { _id: null, sum: { $sum: '$totalAmount' } } }],
            monthly: [{ $match: { createdAt: { $gte: startOfMonth } } }, { $group: { _id: null, sum: { $sum: '$totalAmount' } } }],
            cod: [{ $match: { paymentMethod: 'COD' } }, { $group: { _id: null, sum: { $sum: '$totalAmount' } } }],
            upi: [{ $match: { paymentMethod: 'UPI' } }, { $group: { _id: null, sum: { $sum: '$totalAmount' } } }],
          },
        },
      ]),

      // 3. Customer stats
      Promise.all([
        User.countDocuments({ role: 'user' }),
        User.countDocuments({ role: 'user', createdAt: { $gte: startOfMonth } }),
        Order.aggregate([
          { $match: { status: { $ne: 'Cancelled' } } },
          { $group: { _id: '$user', orderCount: { $sum: 1 } } },
          { $match: { orderCount: { $gt: 1 } } },
          { $count: 'returningCount' },
        ]),
      ]),

      // 4. Product stats
      Promise.all([
        Product.countDocuments(),
        Product.countDocuments({ stock: 0 }),
        Product.countDocuments({ stock: { $gt: 0, $lte: 5 } }),
      ]),

      // 5. Top Products
      Order.aggregate([
        { $match: { status: { $ne: 'Cancelled' } } },
        { $unwind: '$items' },
        { $group: { _id: '$items.name', totalQty: { $sum: '$items.quantity' }, totalSales: { $sum: { $multiply: ['$items.price', '$items.quantity'] } } } },
        { $sort: { totalQty: -1 } },
        { $limit: 5 },
      ]),

      // 6. Recent Orders
      Order.find()
        .populate('user', 'name email phone')
        .sort({ createdAt: -1 })
        .limit(5)
        .lean(),

      // 7. Recent Customers
      User.find({ role: 'user' })
        .select('name email phone createdAt')
        .sort({ createdAt: -1 })
        .limit(5)
        .lean(),

      // 8. 7-Day Sales Graph in single aggregation query
      Order.aggregate([
        { $match: { status: { $ne: 'Cancelled' }, createdAt: { $gte: startOfWeek } } },
        {
          $group: {
            _id: {
              year: { $year: '$createdAt' },
              month: { $month: '$createdAt' },
              day: { $dayOfMonth: '$createdAt' },
            },
            revenue: { $sum: '$totalAmount' },
            orders: { $sum: 1 },
          },
        },
      ]),
    ]);

    // Parse Order counts
    const oFacet = ordersCountRes[0] || {};
    const getCount = (arr) => arr?.[0]?.count || 0;
    const ordersStats = {
      total: getCount(oFacet.total),
      today: getCount(oFacet.today),
      yesterday: getCount(oFacet.yesterday),
      weekly: getCount(oFacet.weekly),
      monthly: getCount(oFacet.monthly),
      pending: getCount(oFacet.pending),
      confirmed: getCount(oFacet.confirmed),
      packed: getCount(oFacet.packed),
      shipped: getCount(oFacet.shipped),
      delivered: getCount(oFacet.delivered),
      cancelled: getCount(oFacet.cancelled),
      refundPending: getCount(oFacet.refundPending),
    };

    // Parse Revenue
    const rFacet = revenueRes[0] || {};
    const getSum = (arr) => arr?.[0]?.sum || 0;
    const revenueStats = {
      total: getSum(rFacet.total),
      today: getSum(rFacet.today),
      weekly: getSum(rFacet.weekly),
      monthly: getSum(rFacet.monthly),
      cod: getSum(rFacet.cod),
      upi: getSum(rFacet.upi),
    };

    // Parse Customers
    const [totalCustomers, newCustomers, returningAgg] = customerRes;
    const customerStats = {
      total: totalCustomers,
      new: newCustomers,
      returning: returningAgg[0]?.returningCount || 0,
    };

    // Parse Products
    const [totalProducts, outOfStock, lowStock] = productRes;
    const productStats = {
      total: totalProducts,
      outOfStock,
      lowStock,
    };

    // Build 7-day sales graph
    const salesMap = {};
    (salesGraphAgg || []).forEach(item => {
      const key = `${item._id.year}-${item._id.month}-${item._id.day}`;
      salesMap[key] = item;
    });

    const salesGraph = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const key = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
      const found = salesMap[key];
      salesGraph.push({
        date: d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
        revenue: found?.revenue || 0,
        orders: found?.orders || 0,
      });
    }

    res.json({
      success: true,
      stats: {
        orders: ordersStats,
        revenue: revenueStats,
        customers: customerStats,
        products: productStats,
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
      .sort({ createdAt: -1 })
      .lean();

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
