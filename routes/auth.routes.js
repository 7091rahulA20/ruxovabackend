const express = require('express');
const router  = express.Router();
const {
  register, login, logout, getMe, updateProfile, changePassword,
} = require('../controllers/auth.controller');
const { protect } = require('../middleware/auth.middleware');

router.post('/register',         register);
router.post('/login',            login);
router.post('/logout',           logout);
router.get('/me',                protect, getMe);
router.put('/profile',           protect, updateProfile);
router.put('/change-password',   protect, changePassword);

module.exports = router;
