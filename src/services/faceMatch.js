/**
 * Face matching service — FR-3 (Facial-Recognition Check-In)
 * =============================================================
 * STATUS: Real facial recognition is now integrated via face-api.js
 * (TensorFlow.js), running client-side in the browser. See
 * public/js/faceRecognition.js and public/models/README.md.
 *
 * The frontend captures a 128-length face descriptor from a live camera
 * frame using face-api.js and POSTs it here unchanged. When no camera is
 * available (e.g. a headless test environment), the frontend falls back
 * to a deterministic demo descriptor so the pipeline stays testable.
 *
 * MATCH ALGORITHM:
 *   Euclidean distance between the live descriptor and the student's
 *   stored reference descriptor. Lower distance = closer match. 0.6 is
 *   the threshold face-api.js's own documentation recommends for its
 *   128-dimension descriptors, which is why it was chosen as the default
 *   here even before the real model was wired in.
 */

const MATCH_THRESHOLD = 0.6; // face-api.js's documented recommended threshold

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
