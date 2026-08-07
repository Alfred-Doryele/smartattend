-- SmartAttend Database Schema
-- Corresponds to SRS sections FR-1, FR-2, FR-3, FR-4, FR-6, FR-7

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  index_number TEXT UNIQUE,             -- student/staff ID number
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('student', 'lecturer', 'admin')),
  face_descriptor TEXT,                 -- JSON array: stored facial embedding (see src/services/faceMatch.js)
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS courses (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,            -- e.g. "CENG 302"
  title TEXT NOT NULL,
  lecturer_id TEXT NOT NULL REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS enrollments (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES courses(id),
  student_id TEXT NOT NULL REFERENCES users(id),
  UNIQUE(course_id, student_id)
);

-- A registered venue, pre-mapped once by an admin (Gap 1 from our design discussion)
CREATE TABLE IF NOT EXISTS venues (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,                   -- e.g. "Lecture Hall 3"
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  radius_meters REAL NOT NULL DEFAULT 80
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES courses(id),
  venue_id TEXT REFERENCES venues(id),          -- NULL if lecturer used their live location instead (Gap 1, Option B)
  venue_latitude REAL,                          -- snapshot of location actually used for THIS session
  venue_longitude REAL,
  start_time TEXT NOT NULL,
  end_time TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  reverify_at TEXT,                             -- scheduled time for the random mid-session re-check (Gap: "checked in and left")
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS checkins (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  student_id TEXT NOT NULL REFERENCES users(id),
  checked_in_at TEXT DEFAULT (datetime('now')),
  face_match_score REAL,                -- similarity score, lower = closer match
  face_match_passed INTEGER,            -- 1 / 0
  student_latitude REAL,
  student_longitude REAL,
  distance_from_venue_meters REAL,
  location_verified INTEGER,            -- 1 / 0
  reverified INTEGER DEFAULT 0,         -- 1 once the mid-session re-check has been completed successfully
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('accepted', 'flagged', 'rejected', 'pending')),
  UNIQUE(session_id, student_id)
);

CREATE TABLE IF NOT EXISTS anomaly_flags (
  id TEXT PRIMARY KEY,
  checkin_id TEXT NOT NULL REFERENCES checkins(id),
  reason TEXT NOT NULL,                 -- e.g. 'location_mismatch', 'duplicate_face', 'low_confidence_match', 'no_reverification'
  detail TEXT,
  resolved INTEGER DEFAULT 0,
  resolution TEXT CHECK (resolution IN ('confirmed_present', 'marked_absent', NULL)),
  reviewed_by TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now'))
);
