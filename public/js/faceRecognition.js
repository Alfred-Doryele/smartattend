/**
 * Facial recognition capture using face-api.js (TensorFlow.js), tuned for
 * real-world conditions — dim lighting, students standing further from
 * the camera than a studio photo, and phones with mediocre cameras.
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

// Brightens/sharpens the frame before detection — helps in dim rooms
// where the raw camera feed is too dark for reliable face detection.
function enhancedFrame(videoEl) {
  const canvas = document.createElement('canvas');
  canvas.width = videoEl.videoWidth || 320;
  canvas.height = videoEl.videoHeight || 240;
  const ctx = canvas.getContext('2d');
  ctx.filter = 'brightness(1.5) contrast(1.15)';
  ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/**
 * Captures a face descriptor, retrying with a brightened frame if the
 * first attempts on the raw feed don't find a face.
 */
async function captureFaceDescriptor(videoEl, attempts = 6) {
  await loadModels();
  await waitForVideoReady(videoEl);

  const options = new faceapi.TinyFaceDetectorOptions({
    inputSize: 608,        // larger than the default — better for smaller/farther faces
    scoreThreshold: 0.2,   // lenient — tolerates dim lighting and imperfect angles
  });

  for (let i = 0; i < attempts; i++) {
    const source = i < 2 ? videoEl : enhancedFrame(videoEl); // try raw first, then brightened
    const detection = await faceapi
      .detectSingleFace(source, options)
      .withFaceLandmarks()
      .withFaceDescriptor();

    if (detection) return Array.from(detection.descriptor);
    await new Promise((r) => setTimeout(r, 300));
  }
  return null;
}

async function realDescriptorFromVideo(videoEl) {
  const descriptor = await captureFaceDescriptor(videoEl);
  if (!descriptor) {
    throw new Error('No face detected. Move closer to the camera or turn on more light, then try again.');
  }
  return descriptor;
}
