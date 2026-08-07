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
 * Placeholder face-descriptor capture (DEMO MODE — see src/services/faceMatch.js).
 * Produces a deterministic numeric array from an image data URL so the full
 * pipeline (capture -> compare -> threshold -> accept/flag) can be exercised
 * without a trained model. The ML/Computer Vision lead replaces this function
 * with a real face-api.js descriptor extraction — nothing else in the app
 * needs to change, since the descriptor shape (array of numbers) stays the same.
 */
function demoDescriptorFromImageData(dataUrl) {
  let hash = 0;
  for (let i = 0; i < dataUrl.length; i += 37) {
    hash = (hash * 31 + dataUrl.charCodeAt(i)) % 100000;
  }
  const seed = hash / 100000;
  return Array.from({ length: 16 }, (_, i) => Math.sin(seed * (i + 1)) * 0.5 + 0.5);
}

function getGeolocation() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 5000 }
    );
  });
}
