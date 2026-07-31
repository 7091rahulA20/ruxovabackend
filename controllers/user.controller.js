const User    = require('../models/User.model');
const Order   = require('../models/Order.model');
const Product = require('../models/Product.model');

// ─── Get All Customers (Admin) ────────────────────────────────────────────────
// GET /api/users
exports.getAllUsers = async (req, res) => {
  try {
    const { search, page = 1, limit = 20 } = req.query;
    const query = { role: 'user' };

    if (search) {
      query.$or = [
        { name:  { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
      ];
    }

    const total = await User.countDocuments(query);
    const users = await User.find(query)
      .select('-password -wishlist')
      .sort({ createdAt: -1 })
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit));

    // Attach order counts for each user
    const usersWithOrderCount = await Promise.all(
      users.map(async (u) => {
        const orderCount = await Order.countDocuments({ user: u._id });
        const userObj = u.toObject();
        userObj.orderCount = orderCount;
        return userObj;
      })
    );

    res.json({ success: true, users: usersWithOrderCount, total });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── Toggle Wishlist ──────────────────────────────────────────────────────────
// PUT /api/users/wishlist/:productId
exports.toggleWishlist = async (req, res) => {
  try {
    const user      = await User.findById(req.user._id);
    const productId = req.params.productId;

    const index = user.wishlist.findIndex(id => id.toString() === productId);
    if (index > -1) {
      user.wishlist.splice(index, 1);
    } else {
      user.wishlist.push(productId);
    }

    await user.save();
    const added = index === -1;
    res.json({
      success: true,
      added,
      message: added ? 'Added to wishlist' : 'Removed from wishlist',
      wishlist: user.wishlist,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── Get Wishlist ─────────────────────────────────────────────────────────────
// GET /api/users/wishlist
exports.getWishlist = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate('wishlist');
    res.json({ success: true, wishlist: user.wishlist });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── Toggle User Status (Block / Unblock Admin) ────────────────────────────────
// PUT /api/users/:id/status
exports.toggleUserStatus = async (req, res) => {
  try {
    const { isActive } = req.body;
    const user = await User.findById(req.params.id);

    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    if (user.role === 'admin') return res.status(400).json({ success: false, message: 'Cannot deactivate an admin account' });

    user.isActive = typeof isActive === 'boolean' ? isActive : !user.isActive;
    await user.save();

    res.json({
      success: true,
      message: `User ${user.isActive ? 'activated' : 'blocked'} successfully`,
      user,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── Deactivate User (Admin) ──────────────────────────────────────────────────
// PUT /api/users/:id/deactivate
exports.deactivateUser = async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, message: 'User deactivated', user });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── Delete User (Admin) ──────────────────────────────────────────────────────
// DELETE /api/users/:id
exports.deleteUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    if (user.role === 'admin') return res.status(400).json({ success: false, message: 'Cannot delete an admin account' });

    await user.deleteOne();
    res.json({ success: true, message: 'User deleted successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── Export Users CSV (Admin) ─────────────────────────────────────────────────
// GET /api/users/export
exports.exportUsers = async (req, res) => {
  try {
    const users = await User.find({ role: 'user' }).sort({ createdAt: -1 });

    const headers = ['User ID', 'Name', 'Email', 'Phone', 'Active Status', 'Joined Date'].join(',');
    const rows = users.map(u => [
      u._id,
      `"${u.name}"`,
      `"${u.email}"`,
      `"${u.phone || ''}"`,
      u.isActive ? 'Active' : 'Blocked',
      new Date(u.createdAt).toISOString().split('T')[0],
    ].join(','));

    const csvContent = [headers, ...rows].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="ruxova-customers.csv"');
    res.status(200).send(csvContent);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── Get Stats (Admin Dashboard) ─────────────────────────────────────────────
// GET /api/users/stats
exports.getUserStats = async (req, res) => {
  try {
    const totalCustomers = await User.countDocuments({ role: 'user' });
    const newThisMonth   = await User.countDocuments({
      role: 'user',
      createdAt: { $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) },
    });
    res.json({ success: true, stats: { totalCustomers, newThisMonth } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
