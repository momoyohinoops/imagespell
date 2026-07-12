// depth-config.js
// ─────────────────────────────────────────────────────────────────────────
// ALL depth post-processing / quality-tuning constants live here, in ONE file,
// so the CV researcher can tune output quality without hunting through the app.
// Nothing here should be duplicated elsewhere in the codebase.
// ─────────────────────────────────────────────────────────────────────────

export const MODEL = Object.freeze({
  // Depth Anything V2 — SMALL only (Apache 2.0, commercial-OK).
  // Base/Large are CC-BY-NC (non-commercial) → MUST NOT be used.
  id: "onnx-community/depth-anything-v2-small-ONNX",
  license: "Apache-2.0",

  // Inference precision per backend (see validation/RESULTS.md):
  //   WebGPU → fp16 (fast + good quality; int8 stalls on the WebGPU EP)
  //   WASM   → q8   (smaller/faster on CPU; falls back to fp32 if q8 fails)
  webgpuDtype: "fp16",
  wasmDtype: "q8",
  wasmFallbackDtype: "fp32",
});

export const POSTPROCESS = Object.freeze({
  // Normalization of the raw relative-depth field to [0,1].
  // "minmax": stretch min→max over the whole frame (default, high contrast).
  // "percentile": clip to [pLow,pHigh] percentiles before stretching — more
  //   robust to a few very-near/very-far outlier pixels.
  normalize: "minmax", // "minmax" | "percentile"
  percentileLow: 0.5, // % clipped at the near end when normalize="percentile"
  percentileHigh: 99.5, // % clipped at the far end

  // Optional gamma applied to the normalized depth (1 = linear).
  // <1 brightens mid/near detail; >1 compresses near, expands far.
  gamma: 1.0,

  // Light edge-preserving smoothing to reduce blocky artifacts from the
  // model's fixed 518px inference grid after upscaling. 0 = off.
  // Radius is in output pixels; kept small to avoid washing out edges.
  smoothingRadius: 0,

  // Depth Anything outputs LARGER value = NEARER. Most DCC tools (Blender
  // displacement, SD/ControlNet depth) expect NEAR = WHITE, so that is our
  // default. `invertDefault:true` would flip to NEAR = BLACK.
  invertDefault: false,
});

export const HIRES = Object.freeze({
  // Free tier: cap the working resolution so mobile/low-VRAM devices stay safe.
  // Export is still at input resolution via upscaling of the depth field.
  freeMaxSide: 2048,

  // Pro tiled inference for images larger than the model's comfortable range.
  tileSize: 1024, // px per tile (input space)
  tileOverlap: 128, // px overlap, blended to hide seams
  // Scale-align neighbouring tiles (each tile's depth is only relative), using
  // the overlap region to solve a per-tile gain+bias so seams match.
  seamAlign: true,
});

export const RUNTIME = Object.freeze({
  // transformers.js caches model files in the browser Cache Storage.
  useBrowserCache: true,
  // Approx download size shown in the first-load progress copy.
  approxModelMB: 50, // fp16 weights
});
