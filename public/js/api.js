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
 * Improved geolocation capture: samples multiple readings over ~4 seconds
 * and keeps the most accurate one, instead of trusting whatever the first
 * (often rough, network-based) reading happens to be. Returns accuracy in
 * meters alongside the coordinates so the UI can warn on a poor fix.
 */
function getGeolocation() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);

    let best = null;
    let watchId = null;
    const SAMPLE_WINDOW_MS = 4000;

    const finish = () => {
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
      },
      () => { /* ignore individual errors, we may still get a later good reading */ },
      { enableHighAccuracy: true, timeout: SAMPLE_WINDOW_MS, maximumAge: 0 }
    );

    setTimeout(finish, SAMPLE_WINDOW_MS);
  });
}
