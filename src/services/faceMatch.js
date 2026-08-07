/**
 * Face matching service — FR-3 (Facial-Recognition Check-In)
 * =============================================================
 * HOW THIS WORKS RIGHT NOW (demo/scaffold mode):
 *   The frontend does NOT currently run a real face-recognition model.
 *   `descriptor` is expected to be a numeric array. In demo mode the
 *   frontend (public/js/checkin.js) generates this from a simple image
 *   hash so the full pipeline — capture, compare, threshold, accept/
 *   reject, log — can be exercised end-to-end without a trained model.
 *
 * WHAT THE ML/COMPUTER VISION LEAD REPLACES:
 *   Swap the frontend capture step to use a real in-browser model —
 *   face-api.js (TensorFlow.js) is the standard lightweight choice —
 *   which outputs a 128-length face descriptor array from a live
 *   camera frame. That array is POSTed to this same API unchanged.
 *   Everything below (distance calculation, threshold, storage) is
 *   real, production-shaped logic and does NOT need to change when
 *   you swap in the real model — only the descriptor's *source* changes.
 *
 * MATCH ALGORITHM:
 *   Euclidean distance between the live descriptor and the student's
 *   stored reference descriptor. Lower distance = closer match.
 *   This is the same comparison method used by face-api.js/dlib-based
 *   systems in production, so the pipeline transfers directly.
 */

const MATCH_THRESHOLD = 0.6; // tune this once real descriptors are in use

function euclideanDistance(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
    // Descriptor length mismatch — treat as no match rather than crashing
    return Infinity;
  }
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += (a[i] - b[i]) ** 2;
  }
  return Math.sqrt(sum);
}

/**
 * @param {number[]} liveDescriptor - descriptor captured at check-in
 * @param {number[]} storedDescriptor - descriptor captured at registration
 * @returns {{ score: number, passed: boolean }}
 */
function matchFace(liveDescriptor, storedDescriptor) {
  const score = euclideanDistance(liveDescriptor, storedDescriptor);
  return {
    score,
    passed: score <= MATCH_THRESHOLD,
  };
}

module.exports = { matchFace, MATCH_THRESHOLD, euclideanDistance };
