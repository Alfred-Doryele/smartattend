const express = require('express');
const { v4: uuid } = require('uuid');
const db = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// Admin: list/manage users
router.get('/', requireRole('admin'), (req, res) => {
  const rows = db.prepare('SELECT id, full_name, index_number, email, role, created_at FROM users').all();
  res.json(rows);
});

router.patch('/:id/deactivate', requireRole('admin'), (req, res) => {
  // Simple soft-deactivate pattern; extend with an `active` column if needed
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.json({ id: req.params.id, deactivated: true });
});

// Venues (Gap 1, Option A: admin pre-maps known lecture halls)
router.post('/venues', requireRole('admin'), (req, res) => {
  const { name, latitude, longitude, radiusMeters } = req.body;
  if (!name || latitude == null || longitude == null) {
    return res.status(400).json({ error: 'name, latitude, and longitude are required.' });
  }
  const id = uuid();
  db.prepare('INSERT INTO venues (id, name, latitude, longitude, radius_meters) VALUES (?, ?, ?, ?, ?)')
    .run(id, name, latitude, longitude, radiusMeters || 80);
  res.status(201).json({ id, name, latitude, longitude, radiusMeters: radiusMeters || 80 });
});

router.get('/venues', authenticate, (req, res) => {
  res.json(db.prepare('SELECT * FROM venues').all());
});

// Courses
router.post('/courses', requireRole('admin', 'lecturer'), (req, res) => {
  const { code, title, lecturerId } = req.body;
  if (!code || !title) return res.status(400).json({ error: 'code and title are required.' });
  const id = uuid();
  db.prepare('INSERT INTO courses (id, code, title, lecturer_id) VALUES (?, ?, ?, ?)')
    .run(id, code, title, lecturerId || req.user.id);
  res.status(201).json({ id, code, title });
});

router.get('/courses', authenticate, (req, res) => {
  res.json(db.prepare('SELECT * FROM courses').all());
});

router.post('/courses/:id/enroll', requireRole('admin', 'lecturer'), (req, res) => {
  const { studentId } = req.body;
  const id = uuid();
  db.prepare('INSERT INTO enrollments (id, course_id, student_id) VALUES (?, ?, ?)')
    .run(id, req.params.id, studentId);
  res.status(201).json({ id, courseId: req.params.id, studentId });
});

module.exports = router;
