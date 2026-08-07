# Architecture Notes

Short explanation of the key design decisions, written so the team can
defend them in the final presentation.

## Why flag instead of auto-reject?

Every anomaly check in `src/services/anomalyDetection.js` — location
mismatch, duplicate face, low-confidence match, missed re-verification —
attaches a flag rather than silently blocking the student. GPS can be
inaccurate, cameras can misread in bad lighting, and a false rejection
unfairly marks a genuinely present student absent. The system's job is to
surface evidence; a human (the lecturer) makes the final call via the
dashboard's "Confirm present / Mark absent" actions. This is a defensible,
explainable design — and it's easy to justify in a viva.

## Why two independent signals (face + location)?

Facial recognition alone only proves *identity* — it doesn't prove
*presence*. A student could show their face to the camera from anywhere.
Geofencing alone only proves a *device* was near the venue — it doesn't
prove *whose* device. Combining both closes the gap either one leaves
open on its own. This directly addresses the "student checks in from the
hostel" scenario the team raised during requirements discussion.

## Why "demo mode" facial recognition?

Real facial recognition needs a trained model and, ideally, an in-browser
library like face-api.js (TensorFlow.js) so no server-side ML
infrastructure is required. Building that integration takes real time,
and it shouldn't block the rest of the team from building, testing, and
demoing the rest of the system. So the current descriptor capture
(`demoDescriptorFromImageData` in `public/js/api.js`) is a deterministic
placeholder — it exercises the exact same code path (capture → compare →
threshold → accept/flag) that the real model will use. Swapping in
face-api.js later is a single, contained change.

## Why venue location is captured per-session, not hardcoded

Two supported patterns:
- **Pre-registered venue** (`venues` table): an admin maps a lecture hall
  once; every future session in that room reuses it.
- **Live capture**: a lecturer opens the session from their own device
  and the system snapshots their GPS at that moment — works for ad-hoc
  venues with zero setup.

Either way, the location is explicitly set by a human at session
creation. The system never guesses where "the class" is.

## Why check-ins aren't fully tamper-proof

No purely software system can be made unbeatable — GPS can be spoofed,
VPNs exist. What this system does is make cheating meaningfully harder
than paper sign-in, and it automatically surfaces the patterns that
*would* indicate cheating for a human to review. State this plainly if
asked during the defense — overclaiming here is worse than an honest
scope statement.

## Known limitations (be upfront about these)

- Facial recognition accuracy is untested until a real model is wired in.
- Anomaly detection is rule-based, not ML-based, in the current scaffold — this is intentional (see product backlog) and a reasonable, defensible scope for a course project.
- SQLite is fine for a course demo; a real deployment would move to Postgres.
