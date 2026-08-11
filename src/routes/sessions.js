const express = require('express');
const { v4: uuid } = require('uuid');
const db = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');
const { flagMissedReverifications } = require('../services/anomalyDetection');

const router = express.Router();
router.use(authenticate);

// FR-2: Session Management
// Body: { courseId, venueId? , latitude?, longitude?, startTime, durationMinutes, reverifyAfterMinutes? }
// Location comes from EITHER a pre-registered venueId OR a live lat/lon from the lecturer's device
// (Gap 1, Options A and B from the requirements discussion).
router.post('/', requireRole('lecturer', 'admin'), (req, res) => {
  const { courseId, venueId, latitude, longitude, startTime, durationMinutes, reverifyAfterMinutes } = req.body;

  if (!courseId || !startTime) {
    return res.status(400).json({ error: 'courseId and startTime are required.' });
  }

  let venueLat = latitude ?? null;
  let venueLon = longitude ?? null;

  if (venueId) {
    const venue = db.prepare('SELECT * FROM venues WHERE id = ?').get(venueId);
    if (!venue) return res.status(404).json({ error: 'Venue not found.' });
    venueLat = venue.latitude;
    venueLon = venue.longitude;
  }

  if (venueLat == null || venueLon == null) {
    return res.status(400).json({
      error: 'Provide either a venueId (pre-registered location) or latitude/longitude (lecturer\'s live location).'
    });
  }

  const id = uuid();
  const start = new Date(startTime);
  const end = durationMinutes ? new Date(start.getTime() + durationMinutes * 60000) : null;
  const reverifyAt = reverifyAfterMinutes
    ? new Date(start.getTime() + reverifyAfterMinutes * 60000).toISOString()
    : null;

  db.prepare(
    `INSERT INTO sessions (id, course_id, venue_id, venue_latitude, venue_longitude, start_time, end_time, reverify_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, courseId, venueId || null, venueLat, venueLon, start.toISOString(), end ? end.toISOString() : null, reverifyAt);

  res.status(201).json({ id, courseId, venueLat, venueLon, startTime: start.toISOString(), reverifyAt });
});

// Close a session (stop accepting check-ins)
router.patch('/:id/close', requireRole('lecturer', 'admin'), (req, res) => {
  db.prepare(`UPDATE sessions SET status = 'closed' WHERE id = ?`).run(req.params.id);
  res.json({ id: req.params.id, status: 'closed' });
});

// Live dashboard data for a session — FR-5
router.get('/:id/dashboard', requireRole('lecturer', 'admin'), (req, res) => {
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found.' });

  // Trigger the "checked in then left" check before returning data
  flagMissedReverifications(session.id);

  const checkins = db.prepare(
    `SELECT c.*, u.full_name, u.index_number FROM checkins c
     JOIN users u ON u.id = c.student_id
     WHERE c.session_id = ? ORDER BY c.checked_in_at`
  ).all(session.id);

  const flags = db.prepare(
    `SELECT f.*, c.student_id, u.full_name FROM anomaly_flags f
     JOIN checkins c ON c.id = f.checkin_id
     JOIN users u ON u.id = c.student_id
     WHERE c.session_id = ? ORDER BY f.created_at DESC`
  ).all(session.id);

  res.json({ session, checkins, flags });
});

// Resolve a flag — lecturer makes the final call (per our "human decides" design principle)
router.patch('/flags/:flagId/resolve', requireRole('lecturer', 'admin'), (req, res) => {
  const { resolution } = req.body; // 'confirmed_present' | 'marked_absent'
  if (!['confirmed_present', 'marked_absent'].includes(resolution)) {
    return res.status(400).json({ error: 'resolution must be confirmed_present or marked_absent.' });
  }
  db.prepare(
    `UPDATE anomaly_flags SET resolved = 1, resolution = ?, reviewed_by = ? WHERE id = ?`
  ).run(resolution, req.user.id, req.params.flagId);

  const flagRow = db.prepare('SELECT checkin_id FROM anomaly_flags WHERE id = ?').get(req.params.flagId);
  if (flagRow) {
    const newStatus = resolution === 'confirmed_present' ? 'accepted' : 'rejected';
    db.prepare(`UPDATE checkins SET status = ? WHERE id = ?`).run(newStatus, flagRow.checkin_id);
  }

  res.json({ flagId: req.params.flagId, resolution });
});

// A student's currently-open sessions across their enrolled courses.
// Lets the check-in page list sessions instead of requiring a pasted session ID.
router.get('/mine/open', requireRole('student'), (req, res) => {
  const rows = db.prepare(`
    SELECT s.id, s.start_time, s.end_time, s.status, co.code, co.title
    FROM sessions s
    JOIN courses co ON co.id = s.course_id
    JOIN enrollments e ON e.course_id = co.id
    WHERE e.student_id = ? AND s.status = 'open'
    ORDER BY s.start_time DESC
  `).all(req.user.id);
  res.json(rows);
});

module.exports = router;
