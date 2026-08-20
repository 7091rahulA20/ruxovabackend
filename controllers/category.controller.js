const Category = require('../models/Category.model');
const { cloudinary } = require('../config/cloudinary');
const cache = require('../utils/cache');

const clearCategoryCache = () => {
  cache.del('categories:all');
};

// GET /api/categories
exports.getCategories = async (req, res) => {
  try {
    const cacheKey = 'categories:all';
    const cachedCategories = cache.get(cacheKey);
    if (cachedCategories) {
      res.setHeader('Cache-Control', 'public, max-age=600, s-maxage=1200, stale-while-revalidate=3600');
      return res.json({ success: true, categories: cachedCategories });
    }

    const categories = await Category.find({ isActive: true })
      .sort({ sortOrder: 1, name: 1 })
      .lean();

    cache.set(cacheKey, categories, 600); // 10 min TTL
    res.setHeader('Cache-Control', 'public, max-age=600, s-maxage=1200, stale-while-revalidate=3600');
    res.json({ success: true, categories });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/categories/:id
exports.getCategory = async (req, res) => {
  try {
    const category = await Category.findById(req.params.id).lean();
    if (!category) return res.status(404).json({ success: false, message: 'Category not found' });
    res.json({ success: true, category });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/categories (Admin)
exports.createCategory = async (req, res) => {
  try {
    const { name, description, sortOrder } = req.body;

    const image = req.file
      ? { url: req.file.path, public_id: req.file.filename }
      : undefined;

    const category = await Category.create({ name, description, sortOrder, image });
    clearCategoryCache();
    res.status(201).json({ success: true, category });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ success: false, message: 'Category name already exists' });
    }
    res.status(500).json({ success: false, message: err.message });
  }
};

// PUT /api/categories/:id (Admin)
exports.updateCategory = async (req, res) => {
  try {
    const { name, description, sortOrder, isActive } = req.body;
    const category = await Category.findById(req.params.id);
    if (!category) return res.status(404).json({ success: false, message: 'Category not found' });

    if (name)        category.name = name;
    if (description) category.description = description;
    if (sortOrder)   category.sortOrder = sortOrder;
    if (isActive !== undefined) category.isActive = isActive;

    if (req.file) {
      if (category.image?.public_id) {
        await cloudinary.uploader.destroy(category.image.public_id);
      }
      category.image = { url: req.file.path, public_id: req.file.filename };
    }

    await category.save();
    clearCategoryCache();
    res.json({ success: true, category });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// DELETE /api/categories/:id (Admin)
exports.deleteCategory = async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) return res.status(404).json({ success: false, message: 'Category not found' });

    if (category.image?.public_id) {
      await cloudinary.uploader.destroy(category.image.public_id);
    }

    await category.deleteOne();
    clearCategoryCache();
    res.json({ success: true, message: 'Category deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
