// ---------------------------------------------------------------------------
// Face detection — MediaPipe Tasks Vision, loaded from CDN ONLY on first use
// (dynamic import) so it never touches the critical rendering path / LCP.
//
// Everything runs in-browser (WASM); no image ever leaves the device.
// ---------------------------------------------------------------------------

// Pinned version for reproducibility. Bump deliberately after testing.
const VERSION = "0.10.35";
const BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}`;
const MODEL =
  "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite";

let visionPromise = null;
let detectorPromise = null;
// Which delegate is currently in play — used so a detect()-time failure (not
// just a creation-time one) also downgrades future calls to CPU instead of
// retrying GPU forever.
let delegate = "GPU";

async function getVision() {
  if (!visionPromise) {
    visionPromise = import(/* @vite-ignore */ `${BASE}/vision_bundle.mjs`).then(
      async ({ FilesetResolver, FaceDetector }) => ({
        FaceDetector,
        fileset: await FilesetResolver.forVisionTasks(`${BASE}/wasm`),
      })
    );
  }
  return visionPromise;
}

async function createDetector(useDelegate) {
  const { FaceDetector, fileset } = await getVision();
  return FaceDetector.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: MODEL, delegate: useDelegate },
    runningMode: "IMAGE",
    minDetectionConfidence: 0.5,
  });
}

// GPU is faster and is tried first. It can fail two different ways: at
// creation (caught here) or the first time .detect() actually touches WebGL,
// on some real devices where GPU init reports success but the context is
// unusable (seen on real hardware as "GLctx.activeTexture" being undefined).
// Both cases downgrade `delegate` to CPU so later calls stop retrying GPU.
async function getDetector() {
  if (!detectorPromise) {
    detectorPromise = createDetector(delegate).catch((e) => {
      if (delegate === "GPU") {
        console.warn("Face detector GPU delegate failed, falling back to CPU.", e);
        delegate = "CPU";
        detectorPromise = createDetector("CPU");
        return detectorPromise;
      }
      throw e;
    });
  }
  return detectorPromise;
}

function mapDetections(result) {
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

/**
 * Detect faces in an image element/bitmap.
 * @returns {Promise<Array<{x:number,y:number,w:number,h:number}>>} boxes in the
 *          source's own pixel coordinates.
 */
export async function detectFaces(imageSource) {
  const detector = await getDetector();
  try {
    return mapDetections(detector.detect(imageSource));
  } catch (e) {
    if (delegate !== "GPU") throw e;
    console.warn("Face detector GPU delegate failed during detect(), retrying on CPU.", e);
    delegate = "CPU";
    detectorPromise = createDetector("CPU");
    const cpuDetector = await detectorPromise;
    return mapDetections(cpuDetector.detect(imageSource));
  }
}
