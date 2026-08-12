const rateLimit = require('express-rate-limit');

// Protects against brute-force login attempts.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: { error: 'Too many login attempts. Please wait a few minutes and try again.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Protects against check-in spam.
const checkinLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5,
  message: { error: 'Too many check-in attempts. Please wait a moment and try again.' },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = { loginLimiter, checkinLimiter };
