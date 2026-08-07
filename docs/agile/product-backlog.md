# SmartAttend — Product Backlog

Format: `[Priority] Story — acceptance criteria`

## Done (in the initial scaffold)
- [x] User registration & login (student, lecturer, admin) with JWT auth
- [x] Course creation and student enrollment
- [x] Session creation with venue location (pre-registered or live-captured)
- [x] Facial check-in pipeline (demo-mode descriptor + real matching logic)
- [x] GPS geofencing against session venue
- [x] Anomaly detection: location mismatch, duplicate face, low-confidence match
- [x] Mid-session re-verification scaffold (catches "checked in then left")
- [x] Lecturer dashboard: live check-ins + flag review/resolution
- [x] Attendance reports (JSON + CSV export)
- [x] Automated tests for face-matching and distance calculations

## Sprint 1 candidates
- [ ] **[High]** Replace demo face descriptor with real face-api.js model in the browser — *Owner: ML/Computer Vision Lead*
- [ ] **[High]** "My open sessions" endpoint so students don't need to paste a session ID manually — *Owner: Developer, Registration & Scheduling*
- [ ] **[Medium]** Venue pre-registration UI for admins (currently API-only) — *Owner: Developer, Dashboard & Reporting*
- [ ] **[Medium]** Password reset flow — *Owner: Backend/Database Developer*
- [ ] **[Medium]** Input validation hardening on all POST endpoints (currently minimal) — *Owner: Backend/Database Developer*

## Sprint 2 candidates
- [ ] **[Medium]** Mid-session re-verification UI on the student side (currently backend-only) — *Owner: ML/Computer Vision Lead + Developer, Registration*
- [ ] **[Medium]** Admin user-management screen (currently API-only) — *Owner: Developer, Dashboard & Reporting*
- [ ] **[Low]** Switch SQLite → Postgres for multi-instance deployment — *Owner: Backend/Database Developer*
- [ ] **[Low]** Rate-limiting on login/check-in endpoints — *Owner: Backend/Database Developer*

## Stretch goals
- [ ] Trained ML model for anomaly detection (currently rule-based) — *Owner: ML/Computer Vision Lead*
- [ ] Push/SMS notification when a student's check-in is flagged
- [ ] Attendance trend charts on the admin dashboard

## Testing backlog (Tester/QA Officers)
- [ ] Test cases for every FR in the SRS (FR-1 through FR-8)
- [ ] Load test: 100+ simultaneous check-ins on one session (per NFR: Scalability)
- [ ] Face-match accuracy evaluation once real descriptors are in use
- [ ] Manual penetration pass on auth endpoints (basic security NFR)
