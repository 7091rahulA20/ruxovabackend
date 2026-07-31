const Product = require('../models/Product.model');
const { cloudinary } = require('../config/cloudinary');

// ─── Get All Products (with search, filter, sort, pagination) ────────────────
// GET /api/products
exports.getProducts = async (req, res) => {
  try {
    const {
      search, category, page = 1, limit = 12,
      sort = 'newest', gender, minPrice, maxPrice,
    } = req.query;

    const query = { isActive: true };

    if (search) {
      query.$or = [
        { name:        { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { tags:        { $in: [new RegExp(search, 'i')] } },
      ];
    }

    if (category)              query.category = category;
    if (gender)                query.gender = gender;
    if (minPrice || maxPrice)  query.price = {
      ...(minPrice && { $gte: Number(minPrice) }),
      ...(maxPrice && { $lte: Number(maxPrice) }),
    };

    const sortMap = {
      newest:      { createdAt: -1 },
      oldest:      { createdAt: 1 },
      price_asc:   { price: 1 },
      price_desc:  { price: -1 },
      popular:     { avgRating: -1, numReviews: -1 },
      featured:    { isFeatured: -1, createdAt: -1 },
    };
    const sortOption = sortMap[sort] || sortMap.newest;

    const total    = await Product.countDocuments(query);
    const products = await Product.find(query)
      .populate('category', 'name slug')
      .sort(sortOption)
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit));

    res.json({
      success: true,
      products,
      total,
      page:  Number(page),
      pages: Math.ceil(total / Number(limit)),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── Get Featured Products ────────────────────────────────────────────────────
// GET /api/products/featured
exports.getFeatured = async (req, res) => {
  try {
    const products = await Product.find({ isActive: true, isFeatured: true })
      .populate('category', 'name slug')
      .sort({ createdAt: -1 })
      .limit(8);
    res.json({ success: true, products });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── Get Most Loved (top rated) ───────────────────────────────────────────────
// GET /api/products/most-loved
exports.getMostLoved = async (req, res) => {
  try {
    const products = await Product.find({ isActive: true, numReviews: { $gt: 0 } })
      .populate('category', 'name slug')
      .sort({ avgRating: -1, numReviews: -1 })
      .limit(6);
    res.json({ success: true, products });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── Get Single Product ───────────────────────────────────────────────────────
// GET /api/products/:id
exports.getProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id)
      .populate('category', 'name slug')
      .populate('reviews.user', 'name');

    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    res.json({ success: true, product });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── Create Product (Admin) ───────────────────────────────────────────────────
// POST /api/products
exports.createProduct = async (req, res) => {
  try {
    const {
      name, description, price, comparePrice,
      category, stock, tags, gender, volume,
      scentNotes, isFeatured,
    } = req.body;

    if (!name || !description || !price || !category) {
      return res.status(400).json({ success: false, message: 'Name, description, price, category are required' });
    }

    const images = req.files && req.files.length > 0
      ? req.files.map(f => ({ url: f.path, public_id: f.filename }))
      : [];

    const product = await Product.create({
      name,
      description,
      price:        Number(price),
      comparePrice: comparePrice ? Number(comparePrice) : null,
      category,
      stock:        Number(stock) || 0,
      tags:         tags ? tags.split(',').map(t => t.trim()) : [],
      gender:       gender || 'Unisex',
      volume,
      scentNotes:   scentNotes ? (typeof scentNotes === 'string' ? JSON.parse(scentNotes) : scentNotes) : undefined,
      isFeatured:   isFeatured === 'true' || isFeatured === true,
      images,
    });

    await product.populate('category', 'name slug');
    res.status(201).json({ success: true, product });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── Update Product (Admin) ───────────────────────────────────────────────────
// PUT /api/products/:id
exports.updateProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

    const fields = ['name', 'description', 'price', 'comparePrice', 'category', 'stock', 'gender', 'volume', 'isFeatured', 'isActive'];
    fields.forEach(f => {
      if (req.body[f] !== undefined) {
        if (f === 'isFeatured' || f === 'isActive') {
          product[f] = req.body[f] === 'true' || req.body[f] === true;
        } else {
          product[f] = req.body[f];
        }
      }
    });

    if (req.body.tags)       product.tags = req.body.tags.split(',').map(t => t.trim());
    if (req.body.scentNotes) product.scentNotes = typeof req.body.scentNotes === 'string' ? JSON.parse(req.body.scentNotes) : req.body.scentNotes;

    if (req.files && req.files.length > 0) {
      const newImages = req.files.map(f => ({ url: f.path, public_id: f.filename }));
      product.images = [...product.images, ...newImages];
    }

    await product.save();
    await product.populate('category', 'name slug');
    res.json({ success: true, product });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── Delete Product Image (Admin) ─────────────────────────────────────────────
// DELETE /api/products/:id/images/:public_id
exports.deleteProductImage = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

    const { public_id } = req.params;

    // Try destroying from Cloudinary if public_id exists
    if (public_id && !public_id.startsWith('dummy')) {
      try {
        await cloudinary.uploader.destroy(public_id);
      } catch (cErr) {
        console.warn('Cloudinary delete warning:', cErr.message);
      }
    }

    product.images = product.images.filter(img => img.public_id !== public_id && img._id?.toString() !== public_id);
    await product.save();
    await product.populate('category', 'name slug');

    res.json({ success: true, product });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── Set Cover Image (Admin) ─────────────────────────────────────────────────
// PUT /api/products/:id/images/set-cover
exports.setCoverImage = async (req, res) => {
  try {
    const { public_id } = req.body;
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

    const targetIdx = product.images.findIndex(img => img.public_id === public_id || img._id?.toString() === public_id);
    if (targetIdx > -1) {
      const [targetImg] = product.images.splice(targetIdx, 1);
      product.images.unshift(targetImg);
      await product.save();
    }

    await product.populate('category', 'name slug');
    res.json({ success: true, message: 'Cover image updated', product });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── Delete Product (Admin) ───────────────────────────────────────────────────
// DELETE /api/products/:id
exports.deleteProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

    for (const img of product.images) {
      if (img.public_id && !img.public_id.startsWith('dummy')) {
        try {
          await cloudinary.uploader.destroy(img.public_id);
        } catch (cErr) {}
      }
    }

    await product.deleteOne();
    res.json({ success: true, message: 'Product deleted successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── Add Review ───────────────────────────────────────────────────────────────
// POST /api/products/:id/reviews
exports.addReview = async (req, res) => {
  try {
    const { rating, comment } = req.body;
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

    const alreadyReviewed = product.reviews.find(
      r => r.user.toString() === req.user._id.toString()
    );
    if (alreadyReviewed) {
      return res.status(400).json({ success: false, message: 'You have already reviewed this product' });
    }

    product.reviews.push({ user: req.user._id, name: req.user.name, rating: Number(rating), comment });
    product.calcAvgRating();
    await product.save();

    res.status(201).json({ success: true, message: 'Review added' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
