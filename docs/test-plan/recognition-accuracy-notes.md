# Facial Recognition — Accuracy Notes

Owned by: Tester/QA Officer — Recognition & Anomaly Module
Feeds into: `docs/test-plan/verification-validation-report.docx`

## What's measured

Two error types matter for a check-in system:
- **False Accept Rate (FAR)**: a different person's face is wrongly matched to a student's account. Worse failure — this is what lets proxy attendance through.
- **False Reject Rate (FRR)**: the correct student's face is wrongly rejected. Worse for usability — a genuinely present student can't check in.

`MATCH_THRESHOLD` in `src/services/faceMatch.js` (currently `0.6`, the
value face-api.js's own documentation recommends) controls this
trade-off: lower = stricter (fewer false accepts, more false rejects),
higher = looser (opposite).

## How to test this once the team has real face-api.js data flowing

1. Register 5+ test accounts with different people's faces (get willing volunteers — classmates work well).
2. Have each person attempt check-in as themselves 5 times, under normal lecture-hall lighting → record match scores → this gives you FRR data.
3. Have each person attempt check-in *as someone else* (using their own face against another account) 5 times → record match scores → this gives you FAR data.
4. Repeat under one deliberately harder condition (dim lighting, or wearing glasses if not worn during registration) to see how much accuracy degrades.
5. Plot match scores for "self" attempts vs. "other" attempts — there should be a clear separation around the 0.6 threshold. If the distributions overlap significantly, the threshold needs tuning (see step 6).
6. If FAR is too high (strangers getting matched), lower the threshold. If FRR is too high (real students getting rejected too often), raise it slightly — document whichever trade-off the team chooses and why.

## Results log

| Date | Tester | Condition | # Attempts | FAR | FRR | Notes |
|---|---|---|---|---|---|---|
| _[fill in]_ | | Normal lighting | | | | |
| _[fill in]_ | | Dim lighting | | | | |
| _[fill in]_ | | With glasses (if not worn at registration) | | | | |

## Known constraints going into testing

- face-api.js's `tiny_face_detector` model (used here for speed) trades
  some accuracy for speed compared to the full detector — acceptable for
  a course project, worth noting if asked during the defense.
- Testing was not possible in a fully automated way for this scaffold
  since it requires live camera input from real people — this is
  expected and should be done manually by the team once devices with
  cameras are available, rather than something the automated test suite
  can cover.
