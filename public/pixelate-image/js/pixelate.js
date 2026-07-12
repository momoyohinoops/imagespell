// ---------------------------------------------------------------------------
// Pixelation engine — pure Canvas, no dependencies.
//
// All region coordinates are stored in NATURAL image pixels so that the same
// data drives both the on-screen preview (scaled down) and the full-resolution
// export. Block size is also expressed in natural pixels.
// ---------------------------------------------------------------------------

// A single reusable scratch canvas for the down/up-scale trick.
const scratch = document.createElement("canvas");
const scratchCtx = scratch.getContext("2d", { willReadFrequently: false });

/**
 * Pixelate a rectangular region that is ALREADY drawn onto `ctx`.
 * Works by down-scaling the region into a tiny canvas (nearest neighbour) and
 * scaling it back up — the classic mosaic effect. Fast even on huge images
 * because the tiny canvas is proportional to region / block.
 *
 * All args are in the target canvas' own pixel space.
 */
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
  // Copy the region out of the target, shrinking it.
  scratchCtx.drawImage(ctx.canvas, x, y, w, h, 0, 0, sw, sh);

  // Blow it back up, blocky.
  const prevSmoothing = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(scratch, 0, 0, sw, sh, x, y, w, h);
  ctx.imageSmoothingEnabled = prevSmoothing;
}

/**
 * Render the pixelated image into a target canvas.
 *
 * @param {HTMLCanvasElement} target        canvas to draw into (sized already)
 * @param {CanvasImageSource} source        original full-res image/canvas
 * @param {number} naturalW                 source width in natural px
 * @param {number} naturalH                 source height in natural px
 * @param {object} opts
 * @param {number} opts.block               block size in natural px
 * @param {"whole"|"regions"} opts.mode
 * @param {Array<{x,y,w,h}>} opts.regions   regions in natural px (regions mode)
 */
export function render(target, source, naturalW, naturalH, opts) {
  const scale = target.width / naturalW; // natural -> target
  const ctx = target.getContext("2d");

  ctx.imageSmoothingEnabled = true;
  ctx.clearRect(0, 0, target.width, target.height);
  ctx.drawImage(source, 0, 0, naturalW, naturalH, 0, 0, target.width, target.height);

  const blockPx = opts.block * scale;

  if (opts.mode === "whole") {
    pixelateRegion(ctx, 0, 0, target.width, target.height, blockPx);
    return;
  }

  // regions mode
  for (const r of opts.regions) {
    // Clamp region to canvas bounds.
    const rx = Math.max(0, r.x) * scale;
    const ry = Math.max(0, r.y) * scale;
    const rw = Math.min(naturalW - Math.max(0, r.x), r.w) * scale;
    const rh = Math.min(naturalH - Math.max(0, r.y), r.h) * scale;
    pixelateRegion(ctx, rx, ry, rw, rh, blockPx);
  }
}
