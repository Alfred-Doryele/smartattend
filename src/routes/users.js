const express = require('express');
const { v4: uuid } = require('uuid');
const db = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

/**
 * Multi-tenancy helper: resolves which admin's institution a given user
 * belongs to. An admin belongs to themselves; a student/lecturer belongs
 * to whichever admin's account created them (users.created_by).
 * Every list in this file (users, courses, venues) is filtered down to
 * "same org admin as me" so two admins' institutions never see or
 * affect each other's data.
 */
function getOrgAdminId(user) {
  if (user.role === 'admin') return user.id;
  const row = db.prepare('SELECT created_by FROM users WHERE id = ?').get(user.id);
  return row ? row.created_by : null;
}

// Admin: list only the students/lecturers THEY created
router.get('/', requireRole('admin'), (req, res) => {
  const rows = db.prepare(
    'SELECT id, full_name, index_number, email, role, created_at FROM users WHERE created_by = ? ORDER BY full_name'
  ).all(req.user.id);
  res.json(rows);
});

router.patch('/:id/deactivate', requireRole('admin'), (req, res) => {
  // Only allow deactivating accounts this admin actually created —
  // prevents one admin from touching another admin's institution.
  const target = db.prepare('SELECT created_by FROM users WHERE id = ?').get(req.params.id);
  if (!target || target.created_by !== req.user.id) {
    return res.status(403).json({ error: 'You can only manage accounts you created.' });
  }
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.json({ id: req.params.id, deactivated: true });
});

// Venues — scoped to the caller's org admin
router.post('/venues', requireRole('admin'), (req, res) => {
  const { name, latitude, longitude, radiusMeters } = req.body;
  if (!name || latitude == null || longitude == null) {
    return res.status(400).json({ error: 'name, latitude, and longitude are required.' });
  }
  const id = uuid();
  db.prepare('INSERT INTO venues (id, name, latitude, longitude, radius_meters, admin_id) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, name, latitude, longitude, radiusMeters || 80, req.user.id);
  res.status(201).json({ id, name, latitude, longitude, radiusMeters: radiusMeters || 80 });
});

router.get('/venues', authenticate, (req, res) => {
  const orgAdminId = getOrgAdminId(req.user);
  if (!orgAdminId) return res.json([]);
  res.json(db.prepare('SELECT * FROM venues WHERE admin_id = ?').all(orgAdminId));
});

// Courses — scoped to the caller's org admin
router.post('/courses', requireRole('admin', 'lecturer'), (req, res) => {
  const { code, title, lecturerId } = req.body;
  if (!code || !title) return res.status(400).json({ error: 'code and title are required.' });
  const orgAdminId = getOrgAdminId(req.user);
  if (!orgAdminId) return res.status(400).json({ error: 'Your account is not linked to an institution. Contact your administrator.' });
  const id = uuid();
  db.prepare('INSERT INTO courses (id, code, title, lecturer_id, owner_admin_id) VALUES (?, ?, ?, ?, ?)')
    .run(id, code, title, lecturerId || req.user.id, orgAdminId);
  res.status(201).json({ id, code, title });
});

router.get('/courses', authenticate, (req, res) => {
  const orgAdminId = getOrgAdminId(req.user);
  if (!orgAdminId) return res.json([]);
  res.json(db.prepare('SELECT * FROM courses WHERE owner_admin_id = ?').all(orgAdminId));
});

router.post('/courses/:id/enroll', requireRole('admin', 'lecturer'), (req, res) => {
  const { studentId } = req.body;
  const id = uuid();
  db.prepare('INSERT INTO enrollments (id, course_id, student_id) VALUES (?, ?, ?)')
    .run(id, req.params.id, studentId);
  res.status(201).json({ id, courseId: req.params.id, studentId });
});

module.exports = router;
