// colormaps.js — small perceptual colormaps for depth visualization.
// Each is an array of [r,g,b] control points (0-255), sampled with lerp.

const VIRIDIS = [
  [68, 1, 84], [72, 40, 120], [62, 74, 137], [49, 104, 142],
  [38, 130, 142], [31, 158, 137], [53, 183, 121], [110, 206, 88],
  [181, 222, 43], [253, 231, 37],
];

const MAGMA = [
  [0, 0, 4], [28, 16, 68], [79, 18, 123], [129, 37, 129],
  [181, 54, 122], [229, 80, 100], [251, 135, 97], [254, 194, 135],
  [252, 253, 191],
];

const TURBO = [
  [48, 18, 59], [70, 107, 227], [40, 187, 220], [70, 230, 130],
  [163, 251, 50], [240, 200, 40], [246, 120, 40], [200, 40, 20], [122, 4, 3],
];

export const COLORMAPS = { grayscale: null, viridis: VIRIDIS, magma: MAGMA, turbo: TURBO };

// Build a 256-entry RGB lookup table from a colormap key.
export function buildLUT(key) {
  const stops = COLORMAPS[key];
  const lut = new Uint8ClampedArray(256 * 3);
  if (!stops) {
    for (let i = 0; i < 256; i++) { lut[i*3] = lut[i*3+1] = lut[i*3+2] = i; }
    return lut;
  }
  const n = stops.length - 1;
  for (let i = 0; i < 256; i++) {
    const t = (i / 255) * n;
    const lo = Math.floor(t), hi = Math.min(lo + 1, n), f = t - lo;
    for (let c = 0; c < 3; c++) {
      lut[i*3 + c] = Math.round(stops[lo][c] * (1 - f) + stops[hi][c] * f);
    }
  }
  return lut;
}

export const COLORMAP_KEYS = Object.keys(COLORMAPS);
