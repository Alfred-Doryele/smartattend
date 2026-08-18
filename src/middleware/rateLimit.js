const rateLimit = require('express-rate-limit');

// Protects against brute-force login attempts, loosened after real usage
// showed the original setting triggering during normal testing.
const loginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 30,
  message: { error: 'Too many attempts. Please wait a few minutes and try again.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Protects against check-in spam.
const checkinLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  message: { error: 'Too many check-in attempts. Please wait a moment and try again.' },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = { loginLimiter, checkinLimiter };
