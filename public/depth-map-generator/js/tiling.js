// tiling.js — Pro high-resolution depth via tiled inference.
// The model runs at a fixed internal size, so large images lose fine detail.
// We split into overlapping tiles, run each at native scale, scale-align
// neighbouring tiles (each tile's depth is only *relative*), and feather-blend
// the overlaps into one full-resolution raw field, then normalize once.

import { estimateRaw, normalizeField, initEngine } from "./depth-engine.js";
import { HIRES } from "./depth-config.js";

// 1-D feather weight ramp: 0 at the outer overlap edge → 1 inside, but 1 on
// edges that sit on the image border (no neighbour there).
function featherWeights(len, overlap, atStart, atEnd) {
  const w = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    let a = 1, b = 1;
    if (!atStart && i < overlap) a = (i + 0.5) / overlap;
    if (!atEnd && i >= len - overlap) b = (len - i - 0.5) / overlap;
    w[i] = Math.max(1e-3, Math.min(a, b));
  }
  return w;
}

function cropCanvas(srcCanvas, x, y, w, h) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  c.getContext("2d").drawImage(srcCanvas, x, y, w, h, 0, 0, w, h);
  return c;
}

// Solve least-squares gain(a) + bias(b) mapping tile values to the existing
// blended estimate over the pixels that already have weight.
function solveGainBias(tileVals, existVals, existW, count) {
  if (count < 32) return { a: 1, b: 0 }; // too little overlap → trust as-is
  let sw = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (let i = 0; i < tileVals.length; i++) {
    const w = existW[i]; if (w <= 0) continue;
    const x = tileVals[i], yv = existVals[i];
    sw += w; sx += w * x; sy += w * yv; sxx += w * x * x; sxy += w * x * yv;
  }
  const denom = sw * sxx - sx * sx;
  if (Math.abs(denom) < 1e-6) return { a: 1, b: 0 };
  const a = (sw * sxy - sx * sy) / denom;
  const b = (sy - a * sx) / sw;
  if (!isFinite(a) || !isFinite(b) || a <= 0) return { a: 1, b: 0 };
  return { a, b };
}

// srcCanvas: full-resolution input. Returns {field, width, height}.
export async function estimateTiled(srcCanvas, { onProgress } = {}) {
  await initEngine({ onProgress });
  const W = srcCanvas.width, H = srcCanvas.height;
  const T = HIRES.tileSize, OV = HIRES.tileOverlap;
  const step = T - OV;

  const xs = []; for (let x = 0; x < W; x += step) { xs.push(x); if (x + T >= W) break; }
  const ys = []; for (let y = 0; y < H; y += step) { ys.push(y); if (y + T >= H) break; }

  const accum = new Float32Array(W * H);
  const weight = new Float32Array(W * H);
  const total = xs.length * ys.length;
  let done = 0;

  for (const y0 of ys) {
    for (const x0 of xs) {
      const tw = Math.min(T, W - x0), th = Math.min(T, H - y0);
      const tile = cropCanvas(srcCanvas, x0, y0, tw, th);
      const { raw, width: rw, height: rh } = await estimateRaw(tile);
      // estimateRaw returns at the tile's own resolution (rw==tw, rh==th).
      const fx = featherWeights(rw, OV, x0 === 0, x0 + tw >= W);
      const fy = featherWeights(rh, OV, y0 === 0, y0 + th >= H);

      // Gather existing estimate over this footprint for alignment.
      const tileVals = new Float32Array(rw * rh);
      const existVals = new Float32Array(rw * rh);
      const existW = new Float32Array(rw * rh);
      let overlapCount = 0;
      for (let j = 0; j < rh; j++) {
        for (let i = 0; i < rw; i++) {
          const gi = (y0 + j) * W + (x0 + i);
          const k = j * rw + i;
          tileVals[k] = raw[k];
          if (weight[gi] > 0) {
            existVals[k] = accum[gi] / weight[gi];
            existW[k] = weight[gi];
            overlapCount++;
          }
        }
      }
      const { a, b } = HIRES.seamAlign && (done > 0)
        ? solveGainBias(tileVals, existVals, existW, overlapCount)
        : { a: 1, b: 0 };

      for (let j = 0; j < rh; j++) {
        for (let i = 0; i < rw; i++) {
          const gi = (y0 + j) * W + (x0 + i);
          const k = j * rw + i;
          const wgt = fx[i] * fy[j];
          accum[gi] += (a * raw[k] + b) * wgt;
          weight[gi] += wgt;
        }
      }

      done++;
      onProgress?.({ phase: "tiling", progress0to1: done / total,
        message: `High-resolution processing: tile ${done}/${total}` });
    }
  }

  const rawFull = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) rawFull[i] = weight[i] > 0 ? accum[i] / weight[i] : 0;
  const field = normalizeField(rawFull, W, H);
  return { field, width: W, height: H };
}
