// render.js — turn a normalized depth field (0..1, 1=near) into pixels.
import { buildLUT } from "./colormaps.js";

// Map field → ImageData at (w,h). invert: near=black instead of near=white.
export function fieldToImageData(field, w, h, { invert = false, colormapKey = "grayscale" } = {}) {
  const lut = buildLUT(colormapKey);
  const img = new ImageData(w, h);
  const px = img.data;
  for (let i = 0; i < w * h; i++) {
    let v = field[i];
    if (invert) v = 1 - v;
    const idx = (v * 255) | 0;
    px[i*4]   = lut[idx*3];
    px[i*4+1] = lut[idx*3+1];
    px[i*4+2] = lut[idx*3+2];
    px[i*4+3] = 255;
  }
  return img;
}

// Draw the depth field into a canvas at native field resolution.
export function drawFieldToCanvas(canvas, field, w, h, opts) {
  canvas.width = w; canvas.height = h;
  canvas.getContext("2d").putImageData(fieldToImageData(field, w, h, opts), 0, 0);
}

// Bilinear resize of a Float32 depth field, preserving full precision (used for
// 16-bit export at the original input resolution, where an 8-bit canvas round-
// trip would throw away depth precision).
export function resizeFieldBilinear(field, w, h, outW, outH) {
  if (outW === w && outH === h) return field;
  const out = new Float32Array(outW * outH);
  const sx = w / outW, sy = h / outH;
  for (let y = 0; y < outH; y++) {
    const fy = Math.min(h - 1, (y + 0.5) * sy - 0.5);
    const y0 = Math.max(0, Math.floor(fy)), y1 = Math.min(h - 1, y0 + 1), wy = fy - y0;
    for (let x = 0; x < outW; x++) {
      const fx = Math.min(w - 1, (x + 0.5) * sx - 0.5);
      const x0 = Math.max(0, Math.floor(fx)), x1 = Math.min(w - 1, x0 + 1), wx = fx - x0;
      const a = field[y0*w + x0], b = field[y0*w + x1];
      const c = field[y1*w + x0], d = field[y1*w + x1];
      const top = a + (b - a) * wx, bot = c + (d - c) * wx;
      out[y*outW + x] = top + (bot - top) * wy;
    }
  }
  return out;
}

// Render the field to a canvas scaled to (outW,outH) — used for export at the
// original input resolution when the field was computed at a smaller size.
export function renderScaledCanvas(field, w, h, outW, outH, opts) {
  const src = document.createElement("canvas");
  src.width = w; src.height = h;
  src.getContext("2d").putImageData(fieldToImageData(field, w, h, opts), 0, 0);
  if (outW === w && outH === h) return src;
  const dst = document.createElement("canvas");
  dst.width = outW; dst.height = outH;
  const ctx = dst.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, outW, outH);
  return dst;
}
