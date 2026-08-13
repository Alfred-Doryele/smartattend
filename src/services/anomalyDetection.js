/**
 * Anomaly detection service — FR-4 (Anomaly Detection) + FR-8 (Presence Verification)
 * =====================================================================================
 * Implements the gaps identified during requirements discussion:
 *   1. "Student checks in from the hostel, not the classroom"
 *      -> geofence check against the session's registered venue.
 *   2. "Student checks in then leaves"
 *      -> mid-session re-verification flag (see sessions.reverify_at).
 *   3. "Same face used for two different student accounts"
 *      -> duplicate-face-in-session check.
 *   4. "Low-confidence face match forced through"
 *      -> confidence flag, independent of the accept/reject decision.
 *   5. "GPS readings are naturally imprecise, especially indoors"
 *      -> accuracy-tolerant geofence comparison, see below.
 *
 * ACCURACY-AWARE GEOFENCING:
 *   A raw distance-vs-radius check treats every GPS reading as exact,
 *   which it never is — a phone's own reported accuracy (in meters) can
 *   range from ~5m outdoors with a clear sky to 100m+ indoors. Comparing
 *   raw distance against the radius alone causes false "too far away"
 *   flags for genuinely present students whenever GPS drifts.
 *
 *   Instead, the effective allowed distance is widened by both the
 *   student's and the venue's reported accuracy: a student 90m from the
 *   venue with 50m of GPS uncertainty is treated the same as a student
 *   who might genuinely be anywhere from 40m to 140m away — if the
 *   venue's radius plus both accuracies could plausibly include them,
 *   it's not treated as a mismatch.
 *
 * DESIGN PRINCIPLE (per our discussion with the team):
 *   None of these functions silently block a student. They attach a
 *   flag for the lecturer/admin to review. A human makes the final
 *   call — the system's job is to surface evidence, not to convict.
 */

const db = require('../db');
const { v4: uuid } = require('uuid');

const EARTH_RADIUS_M = 6371000;

// If accuracy is worse than this, the reading is unreliable enough to
// flag on its own, regardless of the resulting distance calculation.
const POOR_ACCURACY_THRESHOLD_M = 150;

function haversineDistanceMeters(lat1, lon1, lat2, lon2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_M * c;
}

function flag(checkinId, reason, detail) {
  db.prepare(
    `INSERT INTO anomaly_flags (id, checkin_id, reason, detail) VALUES (?, ?, ?, ?)`
  ).run(uuid(), checkinId, reason, detail);
}

/**
 * Runs all anomaly checks for a freshly-created check-in and returns
 * whether the check-in should be marked 'flagged' instead of 'accepted'.
 */
function evaluateCheckin({ checkinId, session, studentId, faceMatch, studentLat, studentLon, studentAccuracy }) {
  let flagged = false;

  // --- Gap 1, 2 & 5: Location verification (accuracy-aware) ---
  let distance = null;
  let locationVerified = false;
  const venueLat = session.venue_latitude;
  const venueLon = session.venue_longitude;
  const venueAccuracy = session.venue_accuracy_meters || 0;
  const studentAcc = studentAccuracy || 0;

  if (venueLat != null && venueLon != null && studentLat != null && studentLon != null) {
    distance = haversineDistanceMeters(venueLat, venueLon, studentLat, studentLon);
    const radius = session.radius_meters || 80;
    // Widen the allowed distance by both readings' reported uncertainty —
    // see module doc comment above for the reasoning.
    const effectiveRadius = radius + studentAcc + venueAccuracy;
    locationVerified = distance <= effectiveRadius;

    if (!locationVerified) {
      flag(checkinId, 'location_mismatch',
        `Student was ${Math.round(distance)}m from the session venue (allowed radius ${radius}m, ` +
        `widened to ${Math.round(effectiveRadius)}m accounting for GPS accuracy: student ±${Math.round(studentAcc)}m, venue ±${Math.round(venueAccuracy)}m).`);
      flagged = true;
    }

    // Even when accepted, a poor GPS reading is worth a lecturer's awareness —
    // it means the "verified" result is a wider net, not a precise fix.
    if (studentAcc > POOR_ACCURACY_THRESHOLD_M) {
      flag(checkinId, 'low_gps_accuracy',
        `Student's device reported low GPS accuracy (±${Math.round(studentAcc)}m). Location result may be unreliable.`);
      flagged = true;
    }
  } else {
    flag(checkinId, 'location_unverified', 'No geolocation data was provided at check-in.');
    flagged = true;
  }

  // --- Gap 4: Low-confidence match forced through ---
  if (faceMatch && faceMatch.passed && faceMatch.score > 0.45) {
    flag(checkinId, 'low_confidence_match',
      `Match accepted but close to threshold (score ${faceMatch.score.toFixed(3)}).`);
    flagged = true;
  }

  // --- Gap 3: Same face matched to a different student already checked in this session ---
  const sameSessionCheckins = db
    .prepare(`SELECT c.id, c.student_id, u.face_descriptor FROM checkins c
              JOIN users u ON u.id = c.student_id
              WHERE c.session_id = ? AND c.student_id != ?`)
    .all(session.id, studentId);

  for (const other of sameSessionCheckins) {
    if (!other.face_descriptor) continue;
    const otherDescriptor = JSON.parse(other.face_descriptor);
    const { euclideanDistance } = require('./faceMatch');
    const dist = euclideanDistance(faceMatch.liveDescriptor || [], otherDescriptor);
    if (dist < 0.4) {
      flag(checkinId, 'duplicate_face',
        `Live face closely matches another checked-in student (${other.student_id}).`);
      flagged = true;
      break;
    }
  }

  return { flagged, distance, locationVerified };
}

/**
 * Called by a scheduled job or the dashboard poll to check whether a
 * session's mid-point re-verification has been missed. (Gap 2: "checked
 * in and left".) A checkin.reverified stays 0 until the student
 * completes a second face capture after session.reverify_at.
 */
function flagMissedReverifications(sessionId) {
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
  if (!session || !session.reverify_at) return;
  if (new Date() < new Date(session.reverify_at)) return; // not due yet

  const pending = db
    .prepare(`SELECT * FROM checkins WHERE session_id = ? AND reverified = 0 AND status = 'accepted'`)
    .all(sessionId);

  for (const c of pending) {
    const alreadyFlagged = db
      .prepare(`SELECT 1 FROM anomaly_flags WHERE checkin_id = ? AND reason = 'no_reverification'`)
      .get(c.id);
    if (!alreadyFlagged) {
      flag(c.id, 'no_reverification', 'Student did not complete the scheduled mid-session re-check.');
      db.prepare(`UPDATE checkins SET status = 'flagged' WHERE id = ?`).run(c.id);
    }
  }
}

module.exports = { evaluateCheckin, flagMissedReverifications, haversineDistanceMeters };
