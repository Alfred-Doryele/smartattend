// Shared API helper for the SmartAttend frontend.
// Auth token is kept in localStorage under 'smartattend_token' — standard
// practice for a self-hosted app like this one (not a Claude artifact preview).

const API_BASE = '/api';

function getToken() { return localStorage.getItem('smartattend_token'); }
function getUser() {
  const raw = localStorage.getItem('smartattend_user');
  return raw ? JSON.parse(raw) : null;
}
function setSession(token, user) {
  localStorage.setItem('smartattend_token', token);
  localStorage.setItem('smartattend_user', JSON.stringify(user));
}
function clearSession() {
  localStorage.removeItem('smartattend_token');
  localStorage.removeItem('smartattend_user');
}

async function api(path, { method = 'GET', body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(API_BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || 'Request failed');
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

function requireAuth(allowedRoles) {
  const user = getUser();
  if (!user || !getToken()) {
    window.location.href = '/index.html';
    return null;
  }
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    window.location.href = '/index.html';
    return null;
  }
  return user;
}

function wireLogout(btnId) {
  const btn = document.getElementById(btnId);
  if (btn) btn.addEventListener('click', () => { clearSession(); window.location.href = '/index.html'; });
}

/**
 * Placeholder face-descriptor capture (DEMO MODE fallback — used only
 * when no camera is available). See public/js/faceRecognition.js for
 * the real face-api.js capture used whenever a camera is present.
 */
function demoDescriptorFromImageData(dataUrl) {
  let hash = 0;
  for (let i = 0; i < dataUrl.length; i += 37) {
    hash = (hash * 31 + dataUrl.charCodeAt(i)) % 100000;
  }
  const seed = hash / 100000;
  return Array.from({ length: 16 }, (_, i) => Math.sin(seed * (i + 1)) * 0.5 + 0.5);
}

/**
 * Geolocation capture tuned for real-world GPS behavior:
 *   - Samples repeatedly for up to MAX_WAIT_MS, because a GPS "cold
 *     start" fix commonly takes 8-15 seconds — a single quick read
 *     usually returns a rough network/cell-tower estimate instead.
 *   - Exits EARLY the moment a genuinely good fix (<= GOOD_ENOUGH_M)
 *     arrives, so users with a fast GPS lock aren't kept waiting.
 *   - Always returns the best reading seen, even if it never reaches
 *     "good" — paired with the UI's weak/fair/strong label so the
 *     user can judge whether to retry rather than being blocked.
 *
 * NOTE: if accuracy stays poor (often >1000m) even outdoors after a
 * full wait, that's almost always the device's "Approximate/Precise
 * Location" permission being set to approximate, not a code issue —
 * see docs/architecture-notes.md for the settings to check.
 */
function getGeolocation() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);

    const MAX_WAIT_MS = 10000;
    const GOOD_ENOUGH_M = 20;
    let best = null;
    let watchId = null;
    let settled = false;

    const finish = () => {
      if (settled) return;
      settled = true;
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      resolve(best);
    };

    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const reading = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        };
        if (!best || reading.accuracy < best.accuracy) best = reading;
        if (best.accuracy <= GOOD_ENOUGH_M) finish();
      },
      () => { /* ignore individual errors, we may still get a later good reading */ },
      { enableHighAccuracy: true, timeout: MAX_WAIT_MS, maximumAge: 0 }
    );

    setTimeout(finish, MAX_WAIT_MS);
  });
}
