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

// A second scratch canvas for the blur pass — drawing a canvas onto itself
// with a filter applied is unreliable across browsers, so the unblurred
// composite goes here first, then gets blurred into `blurScratch`.
const blurScratch = document.createElement("canvas");
const blurScratchCtx = blurScratch.getContext("2d", { willReadFrequently: false });

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
 *
 * When the padded source rect would extend past the source image's edges
 * (common — faces are often close to the top/side of a photo), we clamp it
 * ourselves and compute the matching destination rect by hand instead of
 * passing an out-of-bounds rect to drawImage. Browsers disagree on how to
 * handle that: some stretch the in-bounds portion to fill the full
 * destination (looks like the box "zooms"), others leave the remainder
 * transparent, which the blur then bleeds into as a faint ghost of the
 * unblurred image beneath. Explicit clamping avoids relying on either
 * engine-specific behavior. A low-res stretched pre-fill covers the (rare)
 * remaining sliver near an image edge so no transparency can bleed at all.
 */
function blurRegion(ctx, source, sourceW, sourceH, sx, sy, sw, sh, tx, ty, tw, th, radius) {
  tw = Math.ceil(tw);
  th = Math.ceil(th);
  if (tw <= 0 || th <= 0 || radius <= 0) return;

  const pad = Math.ceil(radius * 2);
  const bw = tw + pad * 2;
  const bh = th + pad * 2;
  const k = tw / sw; // source -> scratch scale (== th / sh)

  scratch.width = bw;
  scratch.height = bh;
  scratchCtx.clearRect(0, 0, bw, bh);

  // Fallback fill: stretch just the region itself across the whole padded
  // canvas first, so there is no transparent margin even if the precise
  // padded draw below has to be clamped near a source image edge.
  scratchCtx.drawImage(source, sx, sy, sw, sh, 0, 0, bw, bh);

  // Precise padded draw, clamped to the source image bounds so every
  // parameter passed to drawImage is always fully in-bounds.
  const padSx = pad / k;
  const padSy = pad / k;
  const srcX0 = Math.max(0, sx - padSx);
  const srcY0 = Math.max(0, sy - padSy);
  const srcX1 = Math.min(sourceW, sx + sw + padSx);
  const srcY1 = Math.min(sourceH, sy + sh + padSy);
  const csw = srcX1 - srcX0;
  const csh = srcY1 - srcY0;
  if (csw > 0 && csh > 0) {
    const destX = (srcX0 - (sx - padSx)) * k;
    const destY = (srcY0 - (sy - padSy)) * k;
    scratchCtx.drawImage(source, srcX0, srcY0, csw, csh, destX, destY, csw * k, csh * k);
  }

  blurScratch.width = bw;
  blurScratch.height = bh;
  blurScratchCtx.clearRect(0, 0, bw, bh);
  blurScratchCtx.filter = `blur(${radius}px)`;
  blurScratchCtx.drawImage(scratch, 0, 0);
  blurScratchCtx.filter = "none";

  ctx.save();
  ctx.beginPath();
  ctx.rect(tx, ty, tw, th);
  ctx.clip();
  ctx.drawImage(blurScratch, tx - pad, ty - pad, bw, bh);
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
