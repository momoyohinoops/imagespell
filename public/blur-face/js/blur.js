// ---------------------------------------------------------------------------
// Blur / pixelate render engine — pure Canvas, no dependencies.
//
// All region coordinates are stored in NATURAL image pixels so that the same
// data drives both the on-screen preview (scaled down) and the full-resolution
// export. Strength (blur radius / pixelate block size) is also natural px.
//
// The blur is a hand-rolled triple box blur operating on raw pixel data,
// NOT the Canvas 2D `filter` API. `filter: blur()` is unsupported on Safari
// versions before 15.4 (silently ignored — no error, no blur, just a sharp
// crop) and out-of-bounds source rects near a photo's edge are handled
// inconsistently across engines. A manual box blur has neither problem: it
// works identically everywhere canvas ImageData does.
// ---------------------------------------------------------------------------

// A single reusable scratch canvas for the pixelate down/up-scale trick and
// for assembling the padded region before a blur pass.
const scratch = document.createElement("canvas");
const scratchCtx = scratch.getContext("2d", { willReadFrequently: false });

function pixelateRegion(ctx, x, y, w, h, block) {
  x = Math.floor(x);
  y = Math.floor(y);
  w = Math.ceil(w);
  h = Math.ceil(h);
  if (w <= 0 || h <= 0) return;

  block = Math.max(1, Math.round(block));
  const sw = Math.max(1, Math.round(w / block));
  const sh = Math.max(1, Math.round(h / block));

  scratch.width = sw;
  scratch.height = sh;
  scratchCtx.imageSmoothingEnabled = false;
  scratchCtx.clearRect(0, 0, sw, sh);
  scratchCtx.drawImage(ctx.canvas, x, y, w, h, 0, 0, sw, sh);

  const prevSmoothing = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(scratch, 0, 0, sw, sh, x, y, w, h);
  ctx.imageSmoothingEnabled = prevSmoothing;
}

// One separable box-blur pass (horizontal then vertical) using a sliding
// window sum, so cost is O(pixels) regardless of radius. Reads `src`, writes
// `dst` (same length Uint8ClampedArray/array); the two must not alias.
function boxBlurPass(src, dst, w, h, r) {
  r = Math.max(1, r | 0);
  const div = r * 2 + 1;
  const tmp = new Float32Array(src.length);

  // Horizontal.
  for (let y = 0; y < h; y++) {
    const row = y * w * 4;
    let rs = 0, gs = 0, bs = 0, as = 0;
    for (let dx = -r; dx <= r; dx++) {
      const xi = Math.min(w - 1, Math.max(0, dx));
      const idx = row + xi * 4;
      rs += src[idx]; gs += src[idx + 1]; bs += src[idx + 2]; as += src[idx + 3];
    }
    for (let x = 0; x < w; x++) {
      const o = row + x * 4;
      tmp[o] = rs / div; tmp[o + 1] = gs / div; tmp[o + 2] = bs / div; tmp[o + 3] = as / div;
      const addXi = Math.min(w - 1, Math.max(0, x + r + 1));
      const subXi = Math.min(w - 1, Math.max(0, x - r));
      const addI = row + addXi * 4;
      const subI = row + subXi * 4;
      rs += src[addI] - src[subI];
      gs += src[addI + 1] - src[subI + 1];
      bs += src[addI + 2] - src[subI + 2];
      as += src[addI + 3] - src[subI + 3];
    }
  }

  // Vertical.
  for (let x = 0; x < w; x++) {
    const col = x * 4;
    let rs = 0, gs = 0, bs = 0, as = 0;
    for (let dy = -r; dy <= r; dy++) {
      const yi = Math.min(h - 1, Math.max(0, dy));
      const idx = col + yi * w * 4;
      rs += tmp[idx]; gs += tmp[idx + 1]; bs += tmp[idx + 2]; as += tmp[idx + 3];
    }
    for (let y = 0; y < h; y++) {
      const o = col + y * w * 4;
      dst[o] = rs / div; dst[o + 1] = gs / div; dst[o + 2] = bs / div; dst[o + 3] = as / div;
      const addYi = Math.min(h - 1, Math.max(0, y + r + 1));
      const subYi = Math.min(h - 1, Math.max(0, y - r));
      const addI = col + addYi * w * 4;
      const subI = col + subYi * w * 4;
      rs += tmp[addI] - tmp[subI];
      gs += tmp[addI + 1] - tmp[subI + 1];
      bs += tmp[addI + 2] - tmp[subI + 2];
      as += tmp[addI + 3] - tmp[subI + 3];
    }
  }
}

// Three box-blur passes approximate a Gaussian closely enough for a privacy
// blur (exact sigma matching isn't the goal — a strong, smooth, non-leaky
// blur is). `gaussianRadius` is roughly what a CSS blur(radius) would use.
function tripleBoxBlur(data, w, h, gaussianRadius) {
  const boxR = Math.max(1, Math.round(gaussianRadius / 3));
  let a = data;
  let b = new Uint8ClampedArray(data.length);
  boxBlurPass(a, b, w, h, boxR);
  boxBlurPass(b, a, w, h, boxR);
  boxBlurPass(a, b, w, h, boxR);
  data.set(b);
}

/**
 * Fill `scratch` (sized bw x bh) with the region [sx,sy,sw,sh] of `source`,
 * padded by `pad` target-space px on every side, scaled by k = tw/sw.
 *
 * When the padding would sample past the source image's edges (common —
 * faces are often close to a photo's border), the overflow is filled by
 * stretching the image's own outermost row/column of pixels ("clamp to
 * edge"), never by stretching the region's own content — that would just
 * duplicate a distorted copy of the face into the padding, which the blur
 * then bleeds back in as a faint ghost.
 */
function buildPaddedSource(source, sourceW, sourceH, sx, sy, sw, sh, k, pad, bw, bh) {
  scratch.width = bw;
  scratch.height = bh;
  scratchCtx.clearRect(0, 0, bw, bh);

  const padSx = pad / k;
  const padSy = pad / k;
  const srcX0 = Math.max(0, sx - padSx);
  const srcY0 = Math.max(0, sy - padSy);
  const srcX1 = Math.min(sourceW, sx + sw + padSx);
  const srcY1 = Math.min(sourceH, sy + sh + padSy);
  const csw = srcX1 - srcX0;
  const csh = srcY1 - srcY0;
  if (csw <= 0 || csh <= 0) return;

  const destX = Math.round((srcX0 - (sx - padSx)) * k);
  const destY = Math.round((srcY0 - (sy - padSy)) * k);
  const destW = Math.max(1, Math.min(bw, Math.round(csw * k)));
  const destH = Math.max(1, Math.min(bh, Math.round(csh * k)));

  scratchCtx.drawImage(source, srcX0, srcY0, csw, csh, destX, destY, destW, destH);

  // Clamp-to-edge extension, two passes (sides first, then top/bottom so the
  // corners pick up the correct nearest-edge color from the now-filled
  // sides rather than staying transparent).
  const left = destX;
  const right = bw - (destX + destW);
  const top = destY;
  const bottom = bh - (destY + destH);

  if (left > 0) scratchCtx.drawImage(scratch, destX, destY, 1, destH, 0, destY, left, destH);
  if (right > 0) {
    scratchCtx.drawImage(scratch, destX + destW - 1, destY, 1, destH, destX + destW, destY, right, destH);
  }
  if (top > 0) scratchCtx.drawImage(scratch, 0, destY, bw, 1, 0, 0, bw, top);
  if (bottom > 0) scratchCtx.drawImage(scratch, 0, destY + destH - 1, bw, 1, 0, destY + destH, bw, bottom);
}

function blurRegion(ctx, source, sourceW, sourceH, sx, sy, sw, sh, tx, ty, tw, th, radius) {
  tw = Math.ceil(tw);
  th = Math.ceil(th);
  if (tw <= 0 || th <= 0 || radius <= 0) return;

  const pad = Math.ceil(radius * 2);
  const bw = tw + pad * 2;
  const bh = th + pad * 2;
  const k = tw / sw; // source -> scratch scale (== th / sh)

  buildPaddedSource(source, sourceW, sourceH, sx, sy, sw, sh, k, pad, bw, bh);

  const imgData = scratchCtx.getImageData(0, 0, bw, bh);
  tripleBoxBlur(imgData.data, bw, bh, radius);
  scratchCtx.putImageData(imgData, 0, 0);

  ctx.save();
  ctx.beginPath();
  ctx.rect(tx, ty, tw, th);
  ctx.clip();
  ctx.drawImage(scratch, tx - pad, ty - pad, bw, bh);
  ctx.restore();
}

/**
 * Render blurred/pixelated regions into a target canvas.
 *
 * @param {HTMLCanvasElement} target        canvas to draw into (sized already)
 * @param {CanvasImageSource} source        original full-res image/canvas
 * @param {number} naturalW                 source width in natural px
 * @param {number} naturalH                 source height in natural px
 * @param {object} opts
 * @param {"blur"|"pixelate"} opts.effect
 * @param {number} opts.strength            blur radius or pixelate block, natural px
 * @param {Array<{x,y,w,h}>} opts.regions   regions in natural px
 */
export function render(target, source, naturalW, naturalH, opts) {
  const scale = target.width / naturalW; // natural -> target
  const ctx = target.getContext("2d");

  ctx.imageSmoothingEnabled = true;
  ctx.clearRect(0, 0, target.width, target.height);
  ctx.drawImage(source, 0, 0, naturalW, naturalH, 0, 0, target.width, target.height);

  const strengthPx = opts.strength * scale;

  for (const r of opts.regions) {
    const rx = Math.max(0, r.x);
    const ry = Math.max(0, r.y);
    const rw = Math.min(naturalW - rx, r.w);
    const rh = Math.min(naturalH - ry, r.h);
    if (rw <= 0 || rh <= 0) continue;

    if (opts.effect === "pixelate") {
      pixelateRegion(ctx, rx * scale, ry * scale, rw * scale, rh * scale, strengthPx);
    } else {
      blurRegion(
        ctx,
        source,
        naturalW,
        naturalH,
        rx,
        ry,
        rw,
        rh,
        rx * scale,
        ry * scale,
        rw * scale,
        rh * scale,
        strengthPx
      );
    }
  }
}
