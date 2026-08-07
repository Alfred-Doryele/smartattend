const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuid } = require('uuid');
const db = require('../db');
const { JWT_SECRET } = require('../middleware/auth');

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
router.post('/login', (req, res) => {
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
