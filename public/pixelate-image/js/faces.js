// ---------------------------------------------------------------------------
// Face detection — MediaPipe Tasks Vision, loaded from CDN ONLY on first use
// (dynamic import) so it never touches the critical rendering path / LCP.
//
// Everything runs in-browser (WASM); no image ever leaves the device.
// ---------------------------------------------------------------------------

// Pinned version for reproducibility. Bump deliberately after testing.
const VERSION = "0.10.18";
const BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}`;
const MODEL =
  "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite";

let detectorPromise = null;

async function createDetector() {
  const { FilesetResolver, FaceDetector } = await import(
    /* @vite-ignore */ `${BASE}/vision_bundle.mjs`
  );
  const vision = await FilesetResolver.forVisionTasks(`${BASE}/wasm`);

  // Try GPU first; fall back to CPU on devices/browsers where GPU delegate fails.
  const build = (delegate) =>
    FaceDetector.createFromOptions(vision, {
      baseOptions: { modelAssetPath: MODEL, delegate },
      runningMode: "IMAGE",
      minDetectionConfidence: 0.5,
    });

  try {
    return await build("GPU");
  } catch (e) {
    console.warn("Face detector GPU delegate failed, falling back to CPU.", e);
    return await build("CPU");
  }
}

/**
 * Detect faces in an image element/bitmap.
 * @returns {Promise<Array<{x:number,y:number,w:number,h:number}>>} boxes in the
 *          source's own pixel coordinates.
 */
export async function detectFaces(imageSource) {
  if (!detectorPromise) detectorPromise = createDetector();
  const detector = await detectorPromise;

  const result = detector.detect(imageSource);
  return (result.detections || []).map((d) => {
    const b = d.boundingBox;
    // Pad boxes a little so hair/chin get covered too.
    const padX = b.width * 0.12;
    const padY = b.height * 0.12;
    return {
      x: b.originX - padX,
      y: b.originY - padY,
      w: b.width + padX * 2,
      h: b.height + padY * 2,
    };
  });
}
