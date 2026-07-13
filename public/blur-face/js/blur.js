// ---------------------------------------------------------------------------
// Blur / pixelate render engine — pure Canvas, no dependencies.
//
// All region coordinates are stored in NATURAL image pixels so that the same
// data drives both the on-screen preview (scaled down) and the full-resolution
// export. Strength (blur radius / pixelate block size) is also natural px.
// ---------------------------------------------------------------------------

// A single reusable scratch canvas for the pixelate down/up-scale trick.
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

/**
 * Gaussian-blur a rectangular region using the Canvas 2D `filter` API
 * (supported in Safari 15+, all modern Chrome/Firefox).
 *
 * We draw from `source` (not from the already-drawn target) into a padded
 * scratch canvas, blur it, then paint only the unpadded center back onto the
 * target clipped to the region — this avoids the dark/transparent edge halo
 * that blurring a hard-clipped rect in place would produce.
 */
function blurRegion(ctx, source, sx, sy, sw, sh, tx, ty, tw, th, radius) {
  tw = Math.ceil(tw);
  th = Math.ceil(th);
  if (tw <= 0 || th <= 0 || radius <= 0) return;

  const pad = Math.ceil(radius * 2);
  const bw = tw + pad * 2;
  const bh = th + pad * 2;

  scratch.width = bw;
  scratch.height = bh;
  scratchCtx.clearRect(0, 0, bw, bh);
  scratchCtx.filter = `blur(${radius}px)`;
  // Source rect padded proportionally so the blur samples real neighboring
  // pixels instead of transparent void at the region's edges.
  const padSx = (pad / tw) * sw;
  const padSy = (pad / th) * sh;
  scratchCtx.drawImage(
    source,
    sx - padSx,
    sy - padSy,
    sw + padSx * 2,
    sh + padSy * 2,
    0,
    0,
    bw,
    bh
  );
  scratchCtx.filter = "none";

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
