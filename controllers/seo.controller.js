const Product = require('../models/Product.model');
const Category = require('../models/Category.model');
const Settings = require('../models/Settings.model');

// Helper to get Store Base URL
const getBaseUrl = async (req) => {
  try {
    const settings = await Settings.findOne();
    if (settings && settings.storeUrl) {
      return settings.storeUrl.replace(/\/+$/, '');
    }
  } catch (e) {
    // fallback
  }
  const host = req.get('host') || 'localhost:3000';
  const protocol = req.protocol || 'http';
  return `${protocol}://${host}`.replace(':5000', ':3000');
};

// GET /robots.txt
exports.getRobotsTxt = async (req, res) => {
  const baseUrl = await getBaseUrl(req);
  const robots = `User-agent: *
Allow: /
Disallow: /admin/
Disallow: /checkout.html
Disallow: /order-success.html
Disallow: /orders.html

Sitemap: ${baseUrl}/sitemap.xml
`;

  res.header('Content-Type', 'text/plain');
  res.send(robots);
};

// GET /sitemap.xml
exports.getSitemapXml = async (req, res) => {
  try {
    const baseUrl = await getBaseUrl(req);
    const products = await Product.find({}).select('_id name updatedAt price images category').lean();
    const categories = await Category.find({}).select('_id name updatedAt').lean();

    const staticPages = [
      { url: '', priority: '1.0', changefreq: 'daily' },
      { url: 'index.html', priority: '1.0', changefreq: 'daily' },
      { url: 'shop.html', priority: '0.9', changefreq: 'daily' },
      { url: 'contact.html', priority: '0.5', changefreq: 'monthly' },
      { url: 'cart.html', priority: '0.4', changefreq: 'monthly' },
    ];

    let urls = staticPages.map(page => `
  <url>
    <loc>${baseUrl}/${page.url}</loc>
    <lastmod>${new Date().toISOString()}</lastmod>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>`).join('');

    categories.forEach(cat => {
      const lastmod = cat.updatedAt ? new Date(cat.updatedAt).toISOString() : new Date().toISOString();
      urls += `
  <url>
    <loc>${baseUrl}/shop.html?category=${cat._id}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>`;
    });

    products.forEach(prod => {
      const lastmod = prod.updatedAt ? new Date(prod.updatedAt).toISOString() : new Date().toISOString();
      urls += `
  <url>
    <loc>${baseUrl}/product.html?id=${prod._id}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`;
    });

    const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;

    res.header('Content-Type', 'application/xml');
    res.send(sitemapXml);
  } catch (err) {
    res.status(500).send('Error generating sitemap');
  }
};
