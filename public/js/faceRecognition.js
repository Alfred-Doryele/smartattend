/**
 * Real facial-recognition capture using face-api.js (TensorFlow.js).
 * =====================================================================
 * Tuned for phone cameras: larger input size for better small-face
 * detection, a lower confidence threshold so imperfect lighting still
 * registers a face, and automatic retries instead of failing on the
 * first miss.
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

function waitForVideoReady(videoEl) {
  return new Promise((resolve) => {
    if (videoEl.readyState >= 2) return resolve();
    videoEl.addEventListener('loadeddata', () => resolve(), { once: true });
  });
}

/**
 * Captures a single descriptor from a live <video> element, retrying a
 * few times before giving up — a single frame can easily miss a face
 * due to motion blur or a brief bad angle.
 */
async function captureFaceDescriptor(videoEl, attempts = 4) {
  await loadModels();
  await waitForVideoReady(videoEl);

  const options = new faceapi.TinyFaceDetectorOptions({
    inputSize: 512,      // larger than the default 416 — better for smaller/farther faces
    scoreThreshold: 0.35, // more lenient than the default 0.5 — tolerates imperfect lighting
  });

  for (let i = 0; i < attempts; i++) {
    const detection = await faceapi
      .detectSingleFace(videoEl, options)
      .withFaceLandmarks()
      .withFaceDescriptor();

    if (detection) return Array.from(detection.descriptor);
    await new Promise((r) => setTimeout(r, 350)); // brief pause before retrying
  }
  return null;
}

async function realDescriptorFromVideo(videoEl) {
  const descriptor = await captureFaceDescriptor(videoEl);
  if (!descriptor) {
    throw new Error('No face detected after several attempts. Make sure your face is well-lit, centered, and fills most of the frame, then try again.');
  }
  return descriptor;
}
