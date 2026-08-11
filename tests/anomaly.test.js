// Additional test coverage for the facial-recognition + anomaly-detection
// pipeline, owned by Tester/QA Officer — Recognition & Anomaly Module.
// Complements tests/services.test.js (which covers the pure math functions)
// with integration-style tests against a real (temporary) database.

process.env.DB_PATH = require('path').join(__dirname, 'test-anomaly.db');

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const { v4: uuid } = require('uuid');

// Clean slate for every test run
const dbPath = process.env.DB_PATH;
[dbPath, dbPath + '-wal', dbPath + '-shm'].forEach(f => { if (fs.existsSync(f)) fs.unlinkSync(f); });

const db = require('../src/db');
const { evaluateCheckin, haversineDistanceMeters } = require('../src/services/anomalyDetection');

// Venue: UENR-area coordinates used throughout the project's discussion
const VENUE_LAT = 7.3399;
const VENUE_LON = -2.3269;
const HOSTEL_LAT = 7.355; // ~2.5km away — the scenario the team specifically raised
const HOSTEL_LON = -2.310;

function seedStudent(faceDescriptor) {
  const id = uuid();
  db.prepare(
    `INSERT INTO users (id, full_name, email, password_hash, role, face_descriptor) VALUES (?, ?, ?, ?, 'student', ?)`
  ).run(id, 'Test Student ' + id.slice(0, 4), id + '@test.local', 'x', JSON.stringify(faceDescriptor));
  return id;
}

function seedSession() {
  const courseId = uuid();
  const lecturerId = uuid();
  db.prepare(`INSERT INTO users (id, full_name, email, password_hash, role) VALUES (?, 'Lecturer', ?, 'x', 'lecturer')`)
    .run(lecturerId, lecturerId + '@test.local');
  db.prepare(`INSERT INTO courses (id, code, title, lecturer_id) VALUES (?, ?, 'Test Course', ?)`)
    .run(courseId, 'TST-' + courseId.slice(0, 8), lecturerId);
  const sessionId = uuid();
  db.prepare(
    `INSERT INTO sessions (id, course_id, venue_latitude, venue_longitude, start_time) VALUES (?, ?, ?, ?, datetime('now'))`
  ).run(sessionId, courseId, VENUE_LAT, VENUE_LON);
  return db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
}

function seedCheckin(sessionId, studentId) {
  const id = uuid();
  db.prepare(`INSERT INTO checkins (id, session_id, student_id, status) VALUES (?, ?, ?, 'pending')`)
    .run(id, sessionId, studentId);
  return id;
}

test('evaluateCheckin: on-venue check-in is NOT flagged for location', () => {
  const session = seedSession();
  const studentId = seedStudent([0.1, 0.2, 0.3]);
  const checkinId = seedCheckin(session.id, studentId);

  const { flagged, locationVerified } = evaluateCheckin({
    checkinId, session, studentId,
    faceMatch: { passed: true, score: 0.2, liveDescriptor: [0.1, 0.2, 0.3] },
    studentLat: VENUE_LAT, studentLon: VENUE_LON,
  });

  assert.strictEqual(locationVerified, true);
  assert.strictEqual(flagged, false);
});

test('evaluateCheckin: THE HOSTEL SCENARIO — off-venue check-in IS flagged', () => {
  const session = seedSession();
  const studentId = seedStudent([0.1, 0.2, 0.3]);
  const checkinId = seedCheckin(session.id, studentId);

  const { flagged, distance, locationVerified } = evaluateCheckin({
    checkinId, session, studentId,
    faceMatch: { passed: true, score: 0.2, liveDescriptor: [0.1, 0.2, 0.3] },
    studentLat: HOSTEL_LAT, studentLon: HOSTEL_LON,
  });

  assert.strictEqual(locationVerified, false);
  assert.strictEqual(flagged, true);
  assert.ok(distance > 2000 && distance < 3000, `expected ~2-3km, got ${distance}`);

  const flagRow = db.prepare(`SELECT * FROM anomaly_flags WHERE checkin_id = ? AND reason = 'location_mismatch'`).get(checkinId);
  assert.ok(flagRow, 'expected a location_mismatch flag to be recorded');
});

test('evaluateCheckin: missing location data is flagged as unverified, not silently accepted', () => {
  const session = seedSession();
  const studentId = seedStudent([0.1, 0.2, 0.3]);
  const checkinId = seedCheckin(session.id, studentId);

  const { flagged } = evaluateCheckin({
    checkinId, session, studentId,
    faceMatch: { passed: true, score: 0.2, liveDescriptor: [0.1, 0.2, 0.3] },
    studentLat: null, studentLon: null,
  });

  assert.strictEqual(flagged, true);
  const flagRow = db.prepare(`SELECT * FROM anomaly_flags WHERE checkin_id = ? AND reason = 'location_unverified'`).get(checkinId);
  assert.ok(flagRow);
});

test('evaluateCheckin: duplicate face across two student accounts in the same session is flagged', () => {
  const session = seedSession();
  const sharedDescriptor = [0.5, 0.5, 0.5, 0.5];
  const studentA = seedStudent(sharedDescriptor);
  const studentB = seedStudent(sharedDescriptor);

  // Student A checks in first, on-venue, no flag expected for them
  const checkinA = seedCheckin(session.id, studentA);
  evaluateCheckin({
    checkinId: checkinA, session, studentId: studentA,
    faceMatch: { passed: true, score: 0.1, liveDescriptor: sharedDescriptor },
    studentLat: VENUE_LAT, studentLon: VENUE_LON,
  });

  // Student B checks in with the SAME face — should be flagged as duplicate_face
  const checkinB = seedCheckin(session.id, studentB);
  const { flagged } = evaluateCheckin({
    checkinId: checkinB, session, studentId: studentB,
    faceMatch: { passed: true, score: 0.1, liveDescriptor: sharedDescriptor },
    studentLat: VENUE_LAT, studentLon: VENUE_LON,
  });

  assert.strictEqual(flagged, true);
  const flagRow = db.prepare(`SELECT * FROM anomaly_flags WHERE checkin_id = ? AND reason = 'duplicate_face'`).get(checkinB);
  assert.ok(flagRow, 'expected a duplicate_face flag');
});

test('evaluateCheckin: low-confidence match that still passed is flagged for review', () => {
  const session = seedSession();
  const studentId = seedStudent([0.1, 0.2, 0.3]);
  const checkinId = seedCheckin(session.id, studentId);

  const { flagged } = evaluateCheckin({
    checkinId, session, studentId,
    faceMatch: { passed: true, score: 0.55, liveDescriptor: [0.1, 0.2, 0.3] }, // close to the 0.6 threshold
    studentLat: VENUE_LAT, studentLon: VENUE_LON,
  });

  assert.strictEqual(flagged, true);
  const flagRow = db.prepare(`SELECT * FROM anomaly_flags WHERE checkin_id = ? AND reason = 'low_confidence_match'`).get(checkinId);
  assert.ok(flagRow);
});

test('haversineDistanceMeters: venue-to-hostel distance matches the scenario used throughout requirements discussion', () => {
  const d = haversineDistanceMeters(VENUE_LAT, VENUE_LON, HOSTEL_LAT, HOSTEL_LON);
  assert.ok(d > 2400 && d < 2700, `expected ~2.5km, got ${d}`);
});

test.after(() => {
  db.close();
  [dbPath, dbPath + '-wal', dbPath + '-shm'].forEach(f => { if (fs.existsSync(f)) fs.unlinkSync(f); });
});
