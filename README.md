# SmartAttend

An AI-powered attendance management system that uses facial recognition for
check-in, GPS geofencing against the class venue, and rule-based anomaly
detection to catch proxy attendance — built as a fully software-based
solution with no additional hardware required.

## Problem

Manual and sign-sheet-based attendance tracking is time-consuming and easy
to falsify. Even naive digital check-in systems can be beaten by a student
who checks in from home. SmartAttend addresses both: it verifies **who**
is checking in (facial match) and **where** they're checking in from
(geofencing against the lecturer-defined venue), and flags anything that
doesn't add up for the lecturer to review.

## How it works (short version)

1. A lecturer creates a session and sets the venue — either by picking a
   pre-registered room or capturing their own live location on the day.
2. A student checks in: camera captures a face, browser captures GPS.
3. The system compares the face against the student's stored reference
   and checks the GPS against the session's venue radius.
4. Anything suspicious — location mismatch, duplicate face across two
   accounts, a low-confidence match forced through, or a missed
   mid-session re-check — gets **flagged, not auto-rejected**. A human
   (the lecturer) makes the final call.
5. Lecturers get a live dashboard; admins get attendance reports.

See `docs/srs/` for the full requirements and `docs/architecture-notes.md`
for the reasoning behind the anomaly-detection design.

## Features

- Facial-recognition-based check-in via a standard device camera (laptop/phone) — no extra hardware
- GPS geofencing against a lecturer-defined venue
- Mid-session re-verification (catches "checked in then left")
- Rule-based anomaly detection with human-in-the-loop review
- Real-time lecturer/admin dashboard
- Attendance analytics and CSV export
- Role-based access control (student, lecturer, admin)

## Tech stack

- **Backend:** Node.js, Express, better-sqlite3
- **Auth:** JWT (jsonwebtoken), bcrypt password hashing
- **Frontend:** Vanilla HTML/CSS/JS (no build step — runs directly)
- **Database:** SQLite (swap the connection string in `.env` for
  Postgres/MySQL in production; the schema is standard SQL)

## Getting started

```bash
git clone https://github.com/Alfred-Doryele/smartattend.git
cd smartattend
node --version
npm install
copy .env.example .env
npm start
```

Visit `http://localhost:3000`. Register an account (try one student, one
lecturer), capture a facial reference on the student account, then create
a course + session from the lecturer dashboard and check in as the student.

Run the test suite:
```bash
npm test
```

## Important: this is a demo-mode facial recognition scaffold

The app **runs end-to-end today**, but the face "descriptor" captured by
the frontend right now is a placeholder hash of the captured image — not
a real facial embedding. This lets the entire pipeline (capture → compare
→ threshold → accept/flag → dashboard) be built, tested, and demoed
without a trained model blocking the rest of the team.

**The ML/Computer Vision Lead's job:** replace `demoDescriptorFromImageData()`
in `public/js/api.js` with a real in-browser model — `face-api.js`
(TensorFlow.js) is the standard lightweight choice for this. It outputs a
128-length numeric array from a camera frame, which is exactly the shape
this app already expects. **Nothing on the backend needs to change** —
`src/services/faceMatch.js` already does real Euclidean-distance matching
against whatever descriptor array it's given.

## Project structure

```
smartattend/
├── src/
│   ├── server.js              # Express app entry point
│   ├── db.js                  # SQLite connection + schema loader
│   ├── routes/                # auth, sessions, checkins, users, reports
│   ├── middleware/auth.js     # JWT auth + role-based access control
│   └── services/
│       ├── faceMatch.js       # face descriptor comparison (real logic)
│       └── anomalyDetection.js# location/duplicate/confidence flagging (real logic)
├── public/                    # frontend (login, check-in, dashboard)
├── database/schema.sql        # full DB schema
├── tests/                     # automated tests (node:test)
└── docs/                      # proposal, SRS, UML, test plan, Agile records
```

## Team — Software Engineering Course Project

University of Energy and Natural Resources, Sunyani

| Role | Member |
|---|---|
| Project Manager | |
| System Analyst | |
| UI/UX Designer | |
| Developer — Registration & Scheduling | |
| Developer — Dashboard & Reporting | |
| Backend/Database Developer | |
| ML/Computer Vision Lead | |
| Tester/QA — Core System | |
| Tester/QA — Recognition & Anomaly Module | |
| Version Control & Documentation Lead | |

## Status

🚧 Functional scaffold — course project, not production-ready. Core flows
(auth, sessions, check-in, geofencing, anomaly flags, dashboard, reports)
are implemented and tested. See `docs/agile/product-backlog.md` for what's
left.
