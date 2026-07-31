const { v4: uuidv4 } = require('uuid');

/**
 * Generates a unique RUXOVA order ID
 * Format: RUX-XXXXXXXX (8 uppercase alphanumeric characters)
 * Example: RUX-A3B7F2D9
 */
const generateOrderId = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = 'RUX-';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

module.exports = { generateOrderId };
