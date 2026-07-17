// splitter.js — pixel-exact grid/carousel split engine.
//
// Boundary math: cumulative Math.round(i * total / n) guarantees the pieces
// partition the full width/height with no gap and no overlap (boundaries are
// non-decreasing and the last one always equals `total` exactly), even when
// it doesn't divide evenly by n.

export function computeBoundaries(total, n) {
  const arr = [0];
  for (let i = 1; i <= n; i++) arr.push(Math.round((i * total) / n));
  return arr;
}

// Grid pieces in source-canvas pixel space, row-major order.
// Each piece: { row, col, sx, sy, sw, sh }
export function computeGridPieces(w, h, rows, cols) {
  const xs = computeBoundaries(w, cols);
  const ys = computeBoundaries(h, rows);
  const pieces = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      pieces.push({
        row: r,
        col: c,
        sx: xs[c],
        sy: ys[r],
        sw: xs[c + 1] - xs[c],
        sh: ys[r + 1] - ys[r],
      });
    }
  }
  return pieces;
}

// Carousel = N vertical strips, full height, split along width (the
// panorama-carousel trick: pieces posted left-to-right reassemble the photo).
// Each piece: { index, sx, sy, sw, sh }
export function computeCarouselPieces(w, h, n) {
  return computeGridPieces(w, h, 1, n).map((p) => ({
    index: p.col,
    sx: p.sx,
    sy: p.sy,
    sw: p.sw,
    sh: p.sh,
  }));
}

// Instagram 3-column preset: keep rows/cols so cells stay close to square,
// derived from the image's aspect ratio. Clamped to the 1-10 UI range.
export function instagramRows(w, h, cols = 3) {
  const rows = Math.round((cols * h) / w);
  return Math.min(10, Math.max(1, rows || 1));
}

// Crop one piece out of `sourceCanvas` into its own canvas. A direct 1:1
// drawImage (no scaling) is a lossless pixel copy — this is what makes PNG
// export pixel-exact (verified in acceptance criterion 3).
export function cropPiece(sourceCanvas, piece) {
  const c = document.createElement("canvas");
  c.width = piece.sw;
  c.height = piece.sh;
  c.getContext("2d").drawImage(
    sourceCanvas,
    piece.sx, piece.sy, piece.sw, piece.sh,
    0, 0, piece.sw, piece.sh
  );
  return c;
}
