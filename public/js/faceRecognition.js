/**
 * Real facial-recognition capture using face-api.js (TensorFlow.js).
 * =====================================================================
 * This REPLACES demoDescriptorFromImageData() from the initial scaffold.
 * face-api.js runs entirely in the browser — no server-side ML
 * infrastructure needed, which is why it was chosen (see
 * docs/architecture-notes.md for the reasoning).
 *
 * SETUP REQUIRED before this works:
 *   1. Models must be available at /models (see loadModels() below) —
 *      download the tiny_face_detector + face_landmark_68 + face_recognition
 *      model weights from the face-api.js weights repo and place them in
 *      public/models/. (Not committed to this repo — model files are
 *      several MB and don't belong in Git history; see public/models/README.md.)
 *   2. Include the face-api.js script tag on any page that uses this file
 *      (already added to register-face.html and checkin.html):
 *      <script src="https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js"></script>
 *
 * OUTPUT: a 128-length Float32 descriptor array — same shape the backend
 * (src/services/faceMatch.js) already expects, so no backend changes
 * were needed to wire this in.
 */

let modelsLoaded = false;

async function loadModels() {
  if (modelsLoaded) return;
  const MODEL_URL = '/models';
  await Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
    faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
    faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
  ]);
  modelsLoaded = true;
}

/**
 * Captures a single descriptor from a live <video> element.
 * @param {HTMLVideoElement} videoEl
 * @returns {Promise<number[]|null>} 128-length descriptor, or null if no face was detected
 */
async function captureFaceDescriptor(videoEl) {
  await loadModels();

  const detection = await faceapi
    .detectSingleFace(videoEl, new faceapi.TinyFaceDetectorOptions())
    .withFaceLandmarks()
    .withFaceDescriptor();

  if (!detection) return null;
  return Array.from(detection.descriptor);
}

/**
 * Convenience wrapper matching the old demo function's call signature,
 * so pages that already call demoDescriptorFromImageData(dataUrl) can
 * switch to this with minimal changes once wired to a live video element
 * instead of a static captured frame.
 */
async function realDescriptorFromVideo(videoEl) {
  const descriptor = await captureFaceDescriptor(videoEl);
  if (!descriptor) {
    throw new Error('No face detected. Please center your face in the frame and try again.');
  }
  return descriptor;
}
