# SRS Requirements Changelog

Tracks how the requirements evolved from the initial SRS draft as the
system was actually built. Kept so the team (and the lecturer) can see
the reasoning behind each change, not just the final state.

## FR-8: Presence Verification (added)

**Not in the original SRS draft.** Added after the team identified a gap
during requirements discussion: facial recognition alone proves *identity*
but not *physical presence* — a student could check in from their hostel.

Added requirements:
- The system shall capture the student's device location at check-in and
  compare it against the session's registered venue location within a
  defined radius.
- The system shall schedule a mid-session re-verification prompt to catch
  a student who checks in and then leaves.
- The system shall flag, not reject, any check-in where location cannot
  be verified or falls outside the allowed radius — the lecturer makes
  the final call.

**Implementation:** `src/services/anomalyDetection.js`,
`sessions.venue_latitude`/`venue_longitude` in the schema.

## FR-4: Anomaly Detection (expanded)

Original SRS listed anomaly detection at a general level. Once building
started, three concrete rule types were specified:
- Duplicate face matched to two different student accounts in one session
- Location mismatch (see FR-8 above)
- Low-confidence face match that technically passed the threshold but is
  close enough to warrant a second look

## Non-Functional: Security (clarified)

Original: "All passwords shall be stored using a secure hashing algorithm."

Added during backend hardening: rate-limiting on login and check-in
endpoints to prevent brute-force attempts — not explicitly in the
original SRS but a reasonable extension of the existing security NFR,
noted here rather than silently added.

## Scope: Facial recognition (clarified, not changed)

The original SRS scope already excluded "clinical/biometric-hardware"
concerns for other topics considered (see project history) — for
SmartAttend specifically, the scope note that matters is: **facial
recognition proves identity, not attentiveness**. This was always the
intended scope but is now explicitly documented in
`docs/architecture-notes.md` so it can be defended plainly if questioned
during the final presentation, rather than overclaiming what the system
guarantees.

## No changes needed

FR-1 (Registration), FR-2 (Session Management), FR-5 (Dashboard), FR-6
(Reporting), FR-7 (Auth & Access Control) were implemented as originally
specified with no material changes.
