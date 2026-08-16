const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { v4: uuid } = require('uuid');
const db = require('../db');
const { JWT_SECRET, authenticate, requireRole } = require('../middleware/auth');
const { loginLimiter } = require('../middleware/rateLimit');

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Public self-registration — ADMINISTRATOR ONLY.
// Students and lecturers never register themselves; an admin creates
// their account (see POST /auth/create-account below) and hands them
// their login details directly.
router.post('/register', (req, res) => {
  const { fullName, email, password } = req.body;

  if (!fullName || !email || !password) {
    return res.status(400).json({ error: 'fullName, email, and password are required.' });
  }
  if (!EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'Please provide a valid email address.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) {
    return res.status(409).json({ error: 'An account with this email already exists. Please log in instead.' });
  }

  const id = uuid();
  const passwordHash = bcrypt.hashSync(password, 10);

  db.prepare(
    `INSERT INTO users (id, full_name, email, password_hash, role, created_by) VALUES (?, ?, ?, ?, 'admin', NULL)`
  ).run(id, fullName, email, passwordHash);

  res.status(201).json({ id, fullName, email, role: 'admin' });
});

// Admin creates a student or lecturer account under their own institution.
// A random temporary password is generated and returned ONCE in the
// response — the admin is responsible for relaying it to the person
// (this is demo-appropriate; a production system would email it instead).
router.post('/create-account', authenticate, requireRole('admin'), (req, res) => {
  const { fullName, role, indexNumber, email } = req.body;

  if (!fullName || !role || !email) {
    return res.status(400).json({ error: 'fullName, role, and email are required.' });
  }
  if (!['student', 'lecturer'].includes(role)) {
    return res.status(400).json({ error: 'role must be student or lecturer.' });
  }
  if (!EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'Please provide a valid email address.' });
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
  const tempPassword = crypto.randomBytes(6).toString('base64url'); // short, readable-ish, random
  const passwordHash = bcrypt.hashSync(tempPassword, 10);

  db.prepare(
    `INSERT INTO users (id, full_name, index_number, email, password_hash, role, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, fullName, indexNumber || null, email, passwordHash, role, req.user.id);

  res.status(201).json({
    id, fullName, email, role,
    temporaryPassword: tempPassword,
    note: 'Share this password with the person directly — it will not be shown again. They should log in with it (no registration needed on their end).',
  });
});

// Login — available to all roles
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

  res.json({
    token,
    user: {
      id: user.id,
      fullName: user.full_name,
      role: user.role,
      email: user.email,
      hasFaceReference: !!user.face_descriptor,
    },
  });
});

// --- Password reset flow ---
router.post('/password-reset/request', loginLimiter, (req, res) => {
  const { email } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

  if (user) {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

    db.prepare(
      `INSERT INTO password_resets (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)`
    ).run(uuid(), user.id, tokenHash, expiresAt);

    console.log(`[password-reset] token for ${email}: ${rawToken} (expires ${expiresAt})`);
    return res.json({ message: 'If that email is registered, a reset link has been sent.', devToken: rawToken });
  }

  res.json({ message: 'If that email is registered, a reset link has been sent.' });
});

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

// Capture/update the caller's stored facial reference (used right after first login)
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
