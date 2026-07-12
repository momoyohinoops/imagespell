// depth-engine.js
// In-browser monocular depth estimation. WebGPU (fp16) preferred, WASM fallback.
// Loads Depth Anything V2 Small (Apache-2.0) via transformers.js and returns a
// normalized depth field. All quality constants come from depth-config.js.

import { MODEL, POSTPROCESS, RUNTIME } from "./depth-config.js";

const TRANSFORMERS_URL =
  "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.5";

let _tf = null; // cached transformers.js module
let _pipe = null; // cached pipeline
let _backend = null; // "webgpu" | "wasm"

export function getBackend() { return _backend; }

export function hasWebGPU() { return typeof navigator !== "undefined" && !!navigator.gpu; }

async function loadTransformers() {
  if (_tf) return _tf;
  _tf = await import(/* @vite-ignore */ TRANSFORMERS_URL);
  _tf.env.useBrowserCache = RUNTIME.useBrowserCache; // cache model in Cache Storage
  _tf.env.allowLocalModels = false;
  return _tf;
}

// Lazy-initialise the pipeline. onProgress({phase, progress0to1, message}).
export async function initEngine({ onProgress } = {}) {
  if (_pipe) return { backend: _backend };
  const tf = await loadTransformers();
  const report = (p) => {
    if (!onProgress) return;
    // transformers.js emits per-file download events; surface an aggregate.
    if (p.status === "progress" && p.total) {
      onProgress({ phase: "download", progress0to1: p.loaded / p.total,
        message: `Loading AI model (${(p.loaded/1e6).toFixed(0)}/${(p.total/1e6).toFixed(0)} MB)` });
    } else if (p.status === "ready" || p.status === "done") {
      onProgress({ phase: "ready", progress0to1: 1, message: "Ready" });
    }
  };

  const attempts = [];
  if (hasWebGPU()) attempts.push({ backend: "webgpu", dtype: MODEL.webgpuDtype });
  attempts.push({ backend: "wasm", dtype: MODEL.wasmDtype });
  attempts.push({ backend: "wasm", dtype: MODEL.wasmFallbackDtype });

  let lastErr;
  for (const a of attempts) {
    try {
      onProgress?.({ phase: "init", progress0to1: 0,
        message: a.backend === "webgpu" ? "Initializing on WebGPU…" : "Initializing (slower WASM mode)…" });
      const pipe = await tf.pipeline("depth-estimation", MODEL.id,
        { device: a.backend, dtype: a.dtype, progress_callback: report });
      // Probe with a tiny image: some backends load fine but abort on the first
      // inference (observed: WASM int8/q8 emscripten abort). Running a small
      // inference here surfaces that so we fall through to the next backend,
      // and it also warms up the pipeline (fixed 518px grid → shaders reused).
      await pipe(probeImage());
      _pipe = pipe;
      _backend = a.backend;
      return { backend: _backend, dtype: a.dtype };
    } catch (e) {
      lastErr = e;
      _pipe = null;
      console.warn(`[depth-engine] ${a.backend}/${a.dtype} failed:`, e);
    }
  }
  throw lastErr || new Error("Failed to initialise depth engine");
}

let _probe = null;
function probeImage() {
  if (_probe) return _probe;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  g.fillStyle = "#888"; g.fillRect(0, 0, 64, 64);
  g.fillStyle = "#222"; g.fillRect(20, 20, 24, 24);
  _probe = c.toDataURL("image/png");
  return _probe;
}

// Low-level: run the model and return the RAW relative-depth field (larger =
// nearer), un-normalized. Used by tiled inference so tiles can be scale-aligned
// before a single global normalization.
export async function estimateRaw(imageSource) {
  if (!_pipe) await initEngine({});
  const out = await _pipe(imageSource);
  const t = out.predicted_depth;
  if (t && t.data && t.dims) {
    const dims = t.dims;
    return { raw: t.data, width: dims[dims.length - 1], height: dims[dims.length - 2] };
  }
  // Fallback: use the 0-255 RawImage the pipeline also returns.
  const d = out.depth;
  const raw = new Float32Array(d.width * d.height);
  const ch = d.channels || 1;
  for (let i = 0; i < d.width * d.height; i++) raw[i] = d.data[i * ch];
  return { raw, width: d.width, height: d.height };
}

// Run inference on an image source (data URL, HTMLCanvas/Image, or RawImage-able).
// Returns { field: Float32Array (0..1, 1 = nearest), width, height, backend }.
export async function estimateDepth(imageSource, { onProgress } = {}) {
  await initEngine({ onProgress });
  onProgress?.({ phase: "infer", progress0to1: 0.02, message: "Running inference…" });
  const { raw, width, height } = await estimateRaw(imageSource);
  const field = normalizeField(raw, width, height);
  onProgress?.({ phase: "done", progress0to1: 1, message: "Done" });
  return { field, width, height, backend: _backend };
}

// Normalize raw relative depth → Float32 [0,1] with 1 = nearest.
export function normalizeField(raw, w, h) {
  const n = w * h;
  let lo, hi;
  if (POSTPROCESS.normalize === "percentile") {
    const sorted = Float32Array.from(raw).sort();
    lo = sorted[Math.floor((POSTPROCESS.percentileLow / 100) * (n - 1))];
    hi = sorted[Math.floor((POSTPROCESS.percentileHigh / 100) * (n - 1))];
  } else {
    lo = Infinity; hi = -Infinity;
    for (let i = 0; i < n; i++) { const v = raw[i]; if (v < lo) lo = v; if (v > hi) hi = v; }
  }
  const range = hi - lo || 1;
  const g = POSTPROCESS.gamma;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let v = (raw[i] - lo) / range;
    v = v < 0 ? 0 : v > 1 ? 1 : v; // clamp
    if (g !== 1) v = Math.pow(v, g);
    out[i] = v; // 1 = nearest
  }
  return out;
}

export async function disposeEngine() {
  try { await _pipe?.dispose?.(); } catch {}
  _pipe = null; _backend = null;
}
