const express = require('express');
const { v4: uuid } = require('uuid');
const db = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');
const { matchFace } = require('../services/faceMatch');
const { evaluateCheckin } = require('../services/anomalyDetection');

const router = express.Router();
router.use(authenticate);

// FR-3 + FR-4 + FR-8: Facial-Recognition Check-In, Anomaly Detection, Presence Verification
// Body: { sessionId, faceDescriptor, latitude, longitude }
router.post('/', requireRole('student'), (req, res) => {
  const { sessionId, faceDescriptor, latitude, longitude } = req.body;
  const studentId = req.user.id;

  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
  if (!session) return res.status(404).json({ error: 'Session not found.' });
  if (session.status !== 'open') return res.status(400).json({ error: 'This session is not open for check-in.' });

  const already = db.prepare('SELECT id FROM checkins WHERE session_id = ? AND student_id = ?').get(sessionId, studentId);
  if (already) return res.status(409).json({ error: 'You have already checked in to this session.' });

  const student = db.prepare('SELECT * FROM users WHERE id = ?').get(studentId);
  if (!student.face_descriptor) {
    return res.status(400).json({ error: 'No facial reference on file. Please complete registration first.' });
  }

  const storedDescriptor = JSON.parse(student.face_descriptor);
  const faceResult = matchFace(faceDescriptor, storedDescriptor);
  faceResult.liveDescriptor = faceDescriptor;

  const checkinId = uuid();
  const initialStatus = faceResult.passed ? 'accepted' : 'rejected';

  db.prepare(
    `INSERT INTO checkins (id, session_id, student_id, face_match_score, face_match_passed,
       student_latitude, student_longitude, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(checkinId, sessionId, studentId, faceResult.score, faceResult.passed ? 1 : 0,
    latitude ?? null, longitude ?? null, initialStatus);

  if (!faceResult.passed) {
    return res.status(200).json({
      checkinId,
      status: 'rejected',
      reason: 'Face did not match stored reference. You may retry or request manual lecturer review.',
      score: faceResult.score,
    });
  }

  // Face matched — now run anomaly checks (location, duplicate face, low confidence)
  const { flagged, distance, locationVerified } = evaluateCheckin({
    checkinId, session, studentId, faceMatch: faceResult, studentLat: latitude, studentLon: longitude,
  });

  const finalStatus = flagged ? 'flagged' : 'accepted';
  db.prepare(`UPDATE checkins SET status = ?, distance_from_venue_meters = ?, location_verified = ? WHERE id = ?`)
    .run(finalStatus, distance, locationVerified ? 1 : 0, checkinId);

  res.status(201).json({
    checkinId,
    status: finalStatus,
    faceMatchScore: faceResult.score,
    distanceFromVenueMeters: distance,
    locationVerified,
    message: flagged
      ? 'Checked in, but this check-in was flagged for lecturer review.'
      : 'Checked in successfully.',
  });
});

// Mid-session re-verification — closes the "checked in then left" gap
router.post('/:checkinId/reverify', requireRole('student'), (req, res) => {
  const { faceDescriptor } = req.body;
  const checkin = db.prepare('SELECT * FROM checkins WHERE id = ?').get(req.params.checkinId);
  if (!checkin || checkin.student_id !== req.user.id) {
    return res.status(404).json({ error: 'Check-in not found.' });
  }
  const student = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  const storedDescriptor = JSON.parse(student.face_descriptor);
  const result = matchFace(faceDescriptor, storedDescriptor);

  if (result.passed) {
    db.prepare(`UPDATE checkins SET reverified = 1 WHERE id = ?`).run(checkin.id);
    return res.json({ reverified: true });
  }
  res.status(400).json({ reverified: false, message: 'Re-verification face match failed.' });
});

// A student's own attendance history — FR-1
router.get('/me', requireRole('student'), (req, res) => {
  const rows = db.prepare(
    `SELECT c.*, s.start_time, co.code, co.title FROM checkins c
     JOIN sessions s ON s.id = c.session_id
     JOIN courses co ON co.id = s.course_id
     WHERE c.student_id = ? ORDER BY c.checked_in_at DESC`
  ).all(req.user.id);
  res.json(rows);
});

module.exports = router;
