# Facial recognition model weights

This folder contains the real face-api.js (TensorFlow.js) model weights
used for facial recognition, downloaded from the official face-api.js
weights repository:
https://github.com/justadudewhohacks/face-api.js/tree/master/weights

## What's here

- `tiny_face_detector_model-*` — fast face detection (finds the face in frame)
- `face_landmark_68_model-*` — facial landmark detection (68-point mesh, used to align the face before encoding)
- `face_recognition_model-*` — produces the 128-length face descriptor used for matching

## How it's wired in

- `public/js/faceRecognition.js` loads these models and extracts a
  descriptor from a live `<video>` element via `realDescriptorFromVideo()`.
- `public/register-face.html` and `public/checkin.html` both load
  face-api.js from CDN and call this function when a camera is available,
  falling back to the demo descriptor (`demoDescriptorFromImageData` in
  `public/js/api.js`) only when no camera is present.
- The backend (`src/services/faceMatch.js`) does real Euclidean-distance
  matching against whatever descriptor it receives — it required no
  changes to support the real model, since the descriptor shape (a
  128-length numeric array) is identical either way.

## If these files are missing after a fresh clone

They're committed to this repo directly (unusual for binary model
weights, but at ~7MB total it's small enough to keep the setup
zero-config for the team). If you ever need to re-fetch them:

```bash
BASE=https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights
for f in tiny_face_detector_model-weights_manifest.json tiny_face_detector_model-shard1 \
         face_landmark_68_model-weights_manifest.json face_landmark_68_model-shard1 \
         face_recognition_model-weights_manifest.json face_recognition_model-shard1 face_recognition_model-shard2; do
  curl -sL -o "$f" "$BASE/$f"
done
```

## Accuracy notes

Tuning and real-world accuracy evaluation (false-accept / false-reject
rates across different people and lighting conditions) is tracked by the
Tester/QA Officer — Recognition & Anomaly Module role, and logged in
`docs/test-plan/recognition-accuracy-notes.md`.
