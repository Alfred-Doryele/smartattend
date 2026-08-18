/**
 * Face matching service — compares a live capture against the student's
 * stored reference using Euclidean distance between face-api.js descriptors.
 *
 * MATCH_THRESHOLD is set slightly above face-api.js's own baseline
 * recommendation (0.6) to better tolerate real-world variation — dim
 * rooms, different distances from the camera, minor angle changes —
 * without meaningfully raising the risk of matching a different person.
 * If false accepts become a concern in testing, lower this back toward
 * 0.6; if too many genuine students still get rejected, it can move
 * slightly higher still.
 */

const MATCH_THRESHOLD = 0.62;

function euclideanDistance(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
    return Infinity;
  }
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += (a[i] - b[i]) ** 2;
  }
  return Math.sqrt(sum);
}

function matchFace(liveDescriptor, storedDescriptor) {
  const score = euclideanDistance(liveDescriptor, storedDescriptor);
  return {
    score,
    passed: score <= MATCH_THRESHOLD,
  };
}

module.exports = { matchFace, MATCH_THRESHOLD, euclideanDistance };
