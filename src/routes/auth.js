const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { v4: uuid } = require('uuid');
const db = require('../db');
const { JWT_SECRET, authenticate, requireRole } = require('../middleware/auth');
const { loginLimiter } = require('../middleware/rateLimit');
const { sendEmail } = require('../services/emailService');

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Public self-registration — Administrator only. Students and lecturers
// never register themselves; an admin creates their account below.
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

// Admin creates a student or lecturer account. The person logs in with
// their ID (index/staff number) + password, NOT their email — email is
// only used as the address the credentials get sent to. The ID is
// therefore required, not optional, for accounts created here.
router.post('/create-account', authenticate, requireRole('admin'), async (req, res) => {
  const { fullName, role, indexNumber, email } = req.body;

  if (!fullName || !role || !email || !indexNumber) {
    return res.status(400).json({ error: 'fullName, role, email, and an ID (index/staff number) are all required.' });
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
  const dupIndex = db.prepare('SELECT id FROM users WHERE index_number = ?').get(indexNumber);
  if (dupIndex) {
    return res.status(409).json({ error: 'This ID is already registered.' });
  }

  const id = uuid();
  const tempPassword = crypto.randomBytes(6).toString('base64url');
  const passwordHash = bcrypt.hashSync(tempPassword, 10);

  db.prepare(
    `INSERT INTO users (id, full_name, index_number, email, password_hash, temp_password, role, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, fullName, indexNumber, email, passwordHash, tempPassword, role, req.user.id);

  const emailResult = await sendEmail({
    to: email,
    subject: 'Your SmartAttend login details',
    text: `Hi ${fullName},\n\nAn account has been created for you on SmartAttend.\n\nLog in with:\nID: ${indexNumber}\nPassword: ${tempPassword}\n\n(Do NOT use your email to log in — use the ID above.)\n\nYou can change your password anytime using "Forgot password" on the login page.\n\n— SmartAttend`,
  });

  res.status(201).json({
    id, fullName, email, indexNumber, role,
    temporaryPassword: tempPassword,
    emailed: emailResult.sent,
    note: emailResult.sent
      ? 'Login ID and password were emailed to this person automatically.'
      : 'Email delivery is not configured, so this was not emailed automatically — share the ID and password below directly. Both also stay visible under Manage Users if needed later.',
  });
});

// Login — students/lecturers log in with their ID (index/staff number);
// administrators log in with their email. Accept either so one form works
// for everyone.
router.post('/login', loginLimiter, (req, res) => {
  const { identifier, email, password } = req.body;
  const loginValue = identifier || email; // 'email' kept for backward compatibility
  if (!loginValue || !password) {
    return res.status(400).json({ error: 'Please provide your ID (or email for admins) and password.' });
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ? OR index_number = ?').get(loginValue, loginValue);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid ID/email or password.' });
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

// --- Password reset flow (still by email, since that's the recovery channel) ---
router.post('/password-reset/request', loginLimiter, async (req, res) => {
  const { email } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

  if (user) {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

    db.prepare(
      `INSERT INTO password_resets (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)`
    ).run(uuid(), user.id, tokenHash, expiresAt);

    const emailResult = await sendEmail({
      to: email,
      subject: 'Reset your SmartAttend password',
      text: `Hi ${user.full_name},\n\nUse this code to reset your SmartAttend password (expires in 30 minutes):\n\n${rawToken}\n\nRemember: you log in with your ID${user.index_number ? ` (${user.index_number})` : ''}, not this email.\n\nIf you didn't request this, ignore this email.\n\n— SmartAttend`,
    });

    return res.json({
      message: emailResult.sent
        ? 'A reset code has been emailed to you.'
        : 'If that email is registered, a reset code has been generated.',
      devToken: emailResult.sent ? undefined : rawToken,
    });
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
  db.prepare('UPDATE users SET password_hash = ?, temp_password = NULL WHERE id = ?').run(passwordHash, reset.user_id);
  db.prepare('UPDATE password_resets SET used = 1 WHERE id = ?').run(reset.id);

  res.json({ message: 'Password updated. You can now log in with your ID and new password.' });
});

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
