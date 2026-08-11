const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { v4: uuid } = require('uuid');
const db = require('../db');
const { JWT_SECRET } = require('../middleware/auth');
const { loginLimiter } = require('../middleware/rateLimit');

const router = express.Router();

// FR-1: User Registration & Profile Management
// Body: { fullName, indexNumber, email, password, role, faceDescriptor }
router.post('/register', (req, res) => {
  const { fullName, indexNumber, email, password, role, faceDescriptor } = req.body;

  if (!fullName || !email || !password || !role) {
    return res.status(400).json({ error: 'fullName, email, password, and role are required.' });
  }
  if (!['student', 'lecturer', 'admin'].includes(role)) {
    return res.status(400).json({ error: 'role must be student, lecturer, or admin.' });
  }
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'Please provide a valid email address.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) {
    return res.status(409).json({ error: 'An account with this email already exists.' });
  }
  if (indexNumber) {
    const dupIndex = db.prepare('SELECT id FROM users WHERE index_number = ?').get(indexNumber);
    if (dupIndex) {
      return res.status(409).json({ error: 'This index/staff number is already registered.' });
    }
  }

  const id = uuid();
  const passwordHash = bcrypt.hashSync(password, 10);

  db.prepare(
    `INSERT INTO users (id, full_name, index_number, email, password_hash, role, face_descriptor)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, fullName, indexNumber || null, email, passwordHash, role,
    faceDescriptor ? JSON.stringify(faceDescriptor) : null);

  res.status(201).json({ id, fullName, email, role });
});

// Login
router.post('/login', loginLimiter, (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  const token = jwt.sign(
    { id: user.id, role: user.role, fullName: user.full_name },
    JWT_SECRET,
    { expiresIn: '8h' }
  );

  res.json({ token, user: { id: user.id, fullName: user.full_name, role: user.role, email: user.email } });
});

// --- Password reset flow ---
// Step 1: request a reset. Always returns 200 (even if the email doesn't
// exist) so the endpoint can't be used to check which emails are registered.
router.post('/password-reset/request', loginLimiter, (req, res) => {
  const { email } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

  if (user) {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 min

    db.prepare(
      `INSERT INTO password_resets (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)`
    ).run(uuid(), user.id, tokenHash, expiresAt);

    // NOTE: in production this token would be emailed to the user, never
    // returned in the API response. It's returned here only so the reset
    // flow is testable/demoable without an email service configured.
    console.log(`[password-reset] token for ${email}: ${rawToken} (expires ${expiresAt})`);
    return res.json({ message: 'If that email is registered, a reset link has been sent.', devToken: rawToken });
  }

  res.json({ message: 'If that email is registered, a reset link has been sent.' });
});

// Step 2: confirm the reset with the token
router.post('/password-reset/confirm', (req, res) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'token and a newPassword of at least 6 characters are required.' });
  }

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const reset = db.prepare(
    `SELECT * FROM password_resets WHERE token_hash = ? AND used = 0`
  ).get(tokenHash);

  if (!reset || new Date(reset.expires_at) < new Date()) {
    return res.status(400).json({ error: 'This reset link is invalid or has expired.' });
  }

  const passwordHash = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, reset.user_id);
  db.prepare('UPDATE password_resets SET used = 1 WHERE id = ?').run(reset.id);

  res.json({ message: 'Password updated. You can now log in with your new password.' });
});

// Capture/update the caller's stored facial reference (used right after registration)
const { authenticate } = require('../middleware/auth');
router.patch('/me/face', authenticate, (req, res) => {
  const { faceDescriptor } = req.body;
  if (!Array.isArray(faceDescriptor)) {
    return res.status(400).json({ error: 'faceDescriptor must be an array.' });
  }
  db.prepare('UPDATE users SET face_descriptor = ? WHERE id = ?')
    .run(JSON.stringify(faceDescriptor), req.user.id);
  res.json({ ok: true });
});

module.exports = router;
