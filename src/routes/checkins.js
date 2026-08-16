const express = require('express');
const { v4: uuid } = require('uuid');
const db = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');
const { matchFace } = require('../services/faceMatch');
const { evaluateCheckin } = require('../services/anomalyDetection');
const { checkinLimiter } = require('../middleware/rateLimit');

const router = express.Router();
router.use(authenticate);

// FR-3 + FR-4 + FR-8: Facial-Recognition Check-In, Anomaly Detection, Presence Verification
// Body: { sessionId, faceDescriptor, latitude, longitude, accuracy }
router.post('/', requireRole('student'), checkinLimiter, (req, res) => {
  const { sessionId, faceDescriptor, latitude, longitude, accuracy } = req.body;
  const studentId = req.user.id;

  const session = db.prepare(
    `SELECT s.*, co.owner_admin_id FROM sessions s JOIN courses co ON co.id = s.course_id WHERE s.id = ?`
  ).get(sessionId);
  if (!session) return res.status(404).json({ error: 'Session not found. It may have been reset — ask your lecturer for a new session ID.' });
  if (session.status !== 'open') return res.status(400).json({ error: 'This session is not open for check-in.' });

  // Multi-tenancy: a student can only check in to a session belonging to
  // their own institution (the admin who created their account) — this
  // stops a session ID from one admin's org being usable by a student
  // who belongs to a different admin's org, even if they somehow have it.
  const student = db.prepare('SELECT * FROM users WHERE id = ?').get(studentId);
  if (!student) {
    return res.status(401).json({ error: 'Your account could not be found. Please log out and log back in.' });
  }
  if (student.created_by !== session.owner_admin_id) {
    return res.status(403).json({ error: 'This session does not belong to your institution.' });
  }

  // A student can retry after a REJECTED attempt (face mismatch) — only an
  // ACCEPTED or FLAGGED check-in actually blocks further attempts, since
  // those represent a real, resolved-or-pending outcome.
  const existing = db.prepare('SELECT * FROM checkins WHERE session_id = ? AND student_id = ?').get(sessionId, studentId);
  if (existing) {
    if (existing.status === 'accepted' || existing.status === 'flagged') {
      return res.status(409).json({ error: 'You have already checked in to this session.' });
    }
    db.prepare('DELETE FROM checkins WHERE id = ?').run(existing.id);
    db.prepare('DELETE FROM anomaly_flags WHERE checkin_id = ?').run(existing.id);
  }

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
       student_latitude, student_longitude, student_accuracy_meters, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(checkinId, sessionId, studentId, faceResult.score, faceResult.passed ? 1 : 0,
    latitude ?? null, longitude ?? null, accuracy ?? null, initialStatus);

  if (!faceResult.passed) {
    return res.status(200).json({
      checkinId,
      status: 'rejected',
      message: 'Face did not match stored reference. You may retry or request manual lecturer review.',
      score: faceResult.score,
    });
  }

  const { flagged, distance, locationVerified } = evaluateCheckin({
    checkinId, session, studentId, faceMatch: faceResult,
    studentLat: latitude, studentLon: longitude, studentAccuracy: accuracy,
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
    accuracyMeters: accuracy ?? null,
    message: flagged
      ? 'Checked in, but this check-in was flagged for lecturer review.'
      : 'Checked in successfully.',
  });
});

router.post('/:checkinId/reverify', requireRole('student'), (req, res) => {
  const { faceDescriptor } = req.body;
  const checkin = db.prepare('SELECT * FROM checkins WHERE id = ?').get(req.params.checkinId);
  if (!checkin || checkin.student_id !== req.user.id) {
    return res.status(404).json({ error: 'Check-in not found.' });
  }
  const student = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!student) {
    return res.status(401).json({ error: 'Your account could not be found. Please log out and log back in.' });
  }
  const storedDescriptor = JSON.parse(student.face_descriptor);
  const result = matchFace(faceDescriptor, storedDescriptor);

  if (result.passed) {
    db.prepare(`UPDATE checkins SET reverified = 1 WHERE id = ?`).run(checkin.id);
    return res.json({ reverified: true });
  }
  res.status(400).json({ reverified: false, message: 'Re-verification face match failed.' });
});

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
