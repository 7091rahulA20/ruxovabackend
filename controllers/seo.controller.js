const Product = require('../models/Product.model');
const Category = require('../models/Category.model');
const Settings = require('../models/Settings.model');
const cache = require('../utils/cache');

// Helper to get Store Base URL
const getBaseUrl = async (req) => {
  try {
    const cachedUrl = cache.get('seo:baseUrl');
    if (cachedUrl) return cachedUrl;

    const settings = await Settings.findOne().select('storeUrl').lean();
    if (settings && settings.storeUrl) {
      const url = settings.storeUrl.replace(/\/+$/, '');
      cache.set('seo:baseUrl', url, 600);
      return url;
    }
  } catch (e) {}
  return 'https://ruxova.vercel.app';
};

// GET /robots.txt
exports.getRobotsTxt = async (req, res) => {
  const cachedRobots = cache.get('seo:robots');
  if (cachedRobots) {
    res.header('Content-Type', 'text/plain');
    return res.send(cachedRobots);
  }

  const baseUrl = await getBaseUrl(req);
  const robots = `User-agent: *
Allow: /
Disallow: /admin/
Disallow: /checkout.html
Disallow: /order-success.html
Disallow: /orders.html

Sitemap: ${baseUrl}/sitemap.xml
`;

  cache.set('seo:robots', robots, 600);
  res.header('Content-Type', 'text/plain');
  res.send(robots);
};

// GET /sitemap.xml
exports.getSitemapXml = async (req, res) => {
  try {
    const cachedSitemap = cache.get('seo:sitemap');
    if (cachedSitemap) {
      res.header('Content-Type', 'application/xml');
      return res.send(cachedSitemap);
    }

    const [baseUrl, products, categories] = await Promise.all([
      getBaseUrl(req),
      Product.find({}).select('_id name images updatedAt').lean(),
      Category.find({}).select('_id name updatedAt').lean(),
    ]);

    const staticPages = [
      { url: 'index.html', priority: '1.0', changefreq: 'daily' },
      { url: 'shop.html', priority: '0.9', changefreq: 'daily' },
      { url: 'contact.html', priority: '0.5', changefreq: 'monthly' },
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
      const firstImage = prod.images?.[0]?.url || '';
      const imageXml = firstImage ? `
    <image:image>
      <image:loc>${firstImage}</image:loc>
      <image:title>${prod.name.replace(/&/g, '&amp;')}</image:title>
    </image:image>` : '';

      urls += `
  <url>
    <loc>${baseUrl}/product.html?id=${prod._id}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>${imageXml}
  </url>`;
    });

    const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urls}
</urlset>`;

    cache.set('seo:sitemap', sitemapXml, 600);
    res.header('Content-Type', 'application/xml');
    res.send(sitemapXml);
  } catch (err) {
    res.status(500).send('Error generating sitemap');
  }
};
