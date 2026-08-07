const test = require('node:test');
const assert = require('node:assert');
const { matchFace } = require('../src/services/faceMatch');
const { haversineDistanceMeters } = require('../src/services/anomalyDetection');

test('matchFace: identical descriptors give a perfect match', () => {
  const d = [0.1, 0.2, 0.3, 0.4];
  const result = matchFace(d, d);
  assert.strictEqual(result.score, 0);
  assert.strictEqual(result.passed, true);
});

test('matchFace: very different descriptors fail the threshold', () => {
  const a = [0, 0, 0, 0];
  const b = [10, 10, 10, 10];
  const result = matchFace(a, b);
  assert.strictEqual(result.passed, false);
});

test('matchFace: mismatched descriptor lengths never match', () => {
  const result = matchFace([0.1, 0.2], [0.1, 0.2, 0.3]);
  assert.strictEqual(result.passed, false);
  assert.strictEqual(result.score, Infinity);
});

test('haversineDistanceMeters: same point has zero distance', () => {
  const d = haversineDistanceMeters(7.3399, -2.3269, 7.3399, -2.3269);
  assert.ok(d < 0.01);
});

test('haversineDistanceMeters: known distance is roughly correct', () => {
  // Two points ~2.5km apart (Sunyani area, hostel vs. lecture hall scenario)
  const d = haversineDistanceMeters(7.3399, -2.3269, 7.355, -2.310);
  assert.ok(d > 2000 && d < 3000, `expected ~2-3km, got ${d}`);
});
