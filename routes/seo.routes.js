const express = require('express');
const router = express.Router();
const { getRobotsTxt, getSitemapXml } = require('../controllers/seo.controller');

router.get('/robots.txt', getRobotsTxt);
router.get('/sitemap.xml', getSitemapXml);

module.exports = router;
