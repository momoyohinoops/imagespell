import { track } from "./analytics.js";
import { SITE } from "./config.js";
import {
  computeGridPieces,
  computeCarouselPieces,
  instagramRows,
  cropPiece,
} from "./splitter.js";
import { triggerDownload, makeZip } from "./export.js";

// Reflect configured site name into the DOM (title/URL live in one config file).
document.querySelectorAll("[data-site-name]").forEach((el) => {
  el.textContent = SITE.name;
});

// --- Constants -------------------------------------------------------------
const MAX_PREVIEW = 1400; // cap preview backing-store size for performance
const MIME = { png: "image/png", jpeg: "image/jpeg" };
const EXT = { png: "png", jpeg: "jpg" };
const JPEG_QUALITY = 0.95;

// --- Web Share API feature detection -----------------------------------------
// A minimal valid 1x1 transparent PNG, used only to probe whether this browser
// can share image files at all (support varies: iOS/Android Safari & Chrome
// generally can, most desktop browsers can't) — never actually shared itself.
const PROBE_PNG_BYTES = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
  ),
  (c) => c.charCodeAt(0)
);
function canShareFiles() {
  if (typeof navigator.share !== "function" || typeof navigator.canShare !== "function") {
    return false;
  }
  try {
    const probe = new File([PROBE_PNG_BYTES], "probe.png", { type: "image/png" });
    return navigator.canShare({ files: [probe] });
  } catch (_) {
    return false;
  }
}
// Feature is static for the session — decide visibility once at load, no need
// to re-check per image. Hidden entirely (not just disabled) when unsupported,
// so unsupported browsers see exactly the v1 download/zip flow, unchanged.
if (canShareFiles()) sharePiecesBtn.hidden = false;

// --- Element refs ------------------------------------------------------------
const $ = (id) => document.getElementById(id);
const dropzone = $("dropzone");
const fileInput = $("fileInput");
const toolArea = $("tool");
const stage = $("stage");
const pieceGrid = $("pieceGrid");
const controls = $("controls");
const modeGrid = $("modeGrid");
const modeCarousel = $("modeCarousel");
const gridControls = $("gridControls");
const carouselControls = $("carouselControls");
const colsSlider = $("colsSlider");
const colsValue = $("colsValue");
const rowsSlider = $("rowsSlider");
const rowsValue = $("rowsValue");
const igPresetBtn = $("igPresetBtn");
const slicesSlider = $("slicesSlider");
const slicesValue = $("slicesValue");
const formatSelect = $("formatSelect");
const sharePiecesBtn = $("sharePiecesBtn");
const downloadZipBtn = $("downloadZipBtn");
const resetBtn = $("resetBtn");
const statusEl = $("status");
const pieceCountEl = $("pieceCount");

// --- State -------------------------------------------------------------------
const state = {
  sourceCanvas: null, // full-res original
  previewCanvas: null, // downscaled, capped at MAX_PREVIEW, for fast slicing
  naturalW: 0,
  naturalH: 0,
  fileBase: "image",
  mode: "grid", // "grid" | "carousel"
  cols: 3,
  rows: 3,
  slices: 3,
  format: "png",
  fullPieces: [], // current pieces in full-res pixel space, order matches DOM
};

// --- Status helper -------------------------------------------------------------
let statusTimer = null;
function setStatus(msg, sticky = false) {
  statusEl.textContent = msg || "";
  statusEl.classList.toggle("visible", !!msg);
  clearTimeout(statusTimer);
  if (msg && !sticky) {
    statusTimer = setTimeout(() => {
      statusEl.classList.remove("visible");
    }, 2500);
  }
}

// --- Loading an image ----------------------------------------------------------
async function loadFromBlob(blob, name) {
  if (!blob || !blob.type.startsWith("image/")) {
    setStatus("That doesn't look like an image file.");
    return;
  }
  let bitmap;
  try {
    bitmap = await createImageBitmap(blob);
  } catch (e) {
    bitmap = await loadViaImgElement(blob);
  }

  const src = document.createElement("canvas");
  src.width = bitmap.width;
  src.height = bitmap.height;
  src.getContext("2d").drawImage(bitmap, 0, 0);
  if (bitmap.close) bitmap.close();

  state.sourceCanvas = src;
  state.naturalW = src.width;
  state.naturalH = src.height;
  state.fileBase = baseName(name);

  const s = Math.min(1, MAX_PREVIEW / Math.max(src.width, src.height));
  const preview = document.createElement("canvas");
  preview.width = Math.max(1, Math.round(src.width * s));
  preview.height = Math.max(1, Math.round(src.height * s));
  preview.getContext("2d").drawImage(src, 0, 0, preview.width, preview.height);
  state.previewCanvas = preview;

  // Default state: Grid 3x3, zero clicks needed to see a result.
  state.mode = "grid";
  state.cols = 3;
  state.rows = 3;
  state.slices = 3;
  colsSlider.value = 3;
  rowsSlider.value = 3;
  slicesSlider.value = 3;
  colsValue.textContent = 3;
  rowsValue.textContent = 3;
  slicesValue.textContent = 3;
  setMode("grid");

  showEditor();
  rebuildPreview();
  track("Image Loaded");
}

function baseName(name) {
  if (!name) return "image";
  return name.replace(/\.[^./\\]+$/, "").trim() || "image";
}

function loadViaImgElement(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}

function showEditor() {
  dropzone.hidden = true;
  stage.hidden = false;
  controls.hidden = false;
}

// --- Mode switching --------------------------------------------------------
function setMode(mode) {
  state.mode = mode;
  modeGrid.classList.toggle("active", mode === "grid");
  modeGrid.setAttribute("aria-pressed", String(mode === "grid"));
  modeCarousel.classList.toggle("active", mode === "carousel");
  modeCarousel.setAttribute("aria-pressed", String(mode === "carousel"));
  gridControls.hidden = mode !== "grid";
  carouselControls.hidden = mode !== "carousel";
}

modeGrid.addEventListener("click", () => {
  setMode("grid");
  scheduleRebuild();
});
modeCarousel.addEventListener("click", () => {
  setMode("carousel");
  scheduleRebuild();
});

// --- Grid/carousel controls --------------------------------------------------
colsSlider.addEventListener("input", () => {
  state.cols = Number(colsSlider.value);
  colsValue.textContent = state.cols;
  scheduleRebuild();
});
rowsSlider.addEventListener("input", () => {
  state.rows = Number(rowsSlider.value);
  rowsValue.textContent = state.rows;
  scheduleRebuild();
});
slicesSlider.addEventListener("input", () => {
  state.slices = Number(slicesSlider.value);
  slicesValue.textContent = state.slices;
  scheduleRebuild();
});

igPresetBtn.addEventListener("click", () => {
  if (!state.sourceCanvas) return;
  state.cols = 3;
  state.rows = instagramRows(state.naturalW, state.naturalH, 3);
  colsSlider.value = state.cols;
  rowsSlider.value = state.rows;
  colsValue.textContent = state.cols;
  rowsValue.textContent = state.rows;
  setMode("grid");
  scheduleRebuild();
  setStatus(`Instagram preset: 3 × ${state.rows}`);
  track("Instagram Preset", { rows: state.rows });
});

formatSelect.addEventListener("change", () => {
  state.format = formatSelect.value;
});

// --- Preview rendering (debounced to one rebuild per animation frame) ------
let rebuildScheduled = false;
function scheduleRebuild() {
  if (rebuildScheduled) return;
  rebuildScheduled = true;
  requestAnimationFrame(() => {
    rebuildScheduled = false;
    rebuildPreview();
  });
}

// Full-res pieces, computed fresh from the live control values rather than
// cached — downloads must never race the preview's rAF-debounced rebuild.
function computeCurrentFullPieces() {
  return state.mode === "grid"
    ? computeGridPieces(state.naturalW, state.naturalH, state.rows, state.cols)
    : computeCarouselPieces(state.naturalW, state.naturalH, state.slices);
}

function rebuildPreview() {
  if (!state.sourceCanvas) return;
  const pc = state.previewCanvas;

  const previewPieces =
    state.mode === "grid"
      ? computeGridPieces(pc.width, pc.height, state.rows, state.cols)
      : computeCarouselPieces(pc.width, pc.height, state.slices);
  state.fullPieces = computeCurrentFullPieces();

  pieceGrid.className = "piece-grid " + (state.mode === "grid" ? "is-grid" : "is-carousel");
  pieceGrid.style.setProperty("--cols", state.mode === "grid" ? state.cols : state.slices);
  pieceGrid.style.setProperty("--rows", state.mode === "grid" ? state.rows : 1);
  pieceGrid.style.setProperty("--ar", (pc.width / pc.height).toFixed(4));
  pieceGrid.textContent = "";

  previewPieces.forEach((piece, i) => {
    const wrap = document.createElement("div");
    wrap.className = "piece";

    const canvas = cropPiece(pc, piece);
    canvas.className = "piece-canvas";
    wrap.appendChild(canvas);

    const label = document.createElement("span");
    label.className = "piece-label";
    label.textContent =
      state.mode === "grid" ? `${piece.row + 1}·${piece.col + 1}` : String(i + 1);
    wrap.appendChild(label);

    const dlBtn = document.createElement("button");
    dlBtn.type = "button";
    dlBtn.className = "piece-dl";
    dlBtn.setAttribute("aria-label", "Download this piece");
    dlBtn.textContent = "⬇";
    dlBtn.addEventListener("click", () => downloadSinglePiece(i));
    wrap.appendChild(dlBtn);

    pieceGrid.appendChild(wrap);
  });

  pieceCountEl.textContent =
    state.fullPieces.length === 1 ? "1 piece" : `${state.fullPieces.length} pieces`;
}

// --- Downloads -----------------------------------------------------------------
function pieceFilename(piece, i) {
  const ext = EXT[state.format] || "png";
  if (state.mode === "grid") {
    return `${state.fileBase}-r${piece.row + 1}-c${piece.col + 1}.${ext}`;
  }
  return `${state.fileBase}-part${i + 1}.${ext}`;
}

function pieceToBlob(piece) {
  const canvas = cropPiece(state.sourceCanvas, piece);
  const mime = MIME[state.format] || "image/png";
  return new Promise((resolve) => {
    if (mime === "image/jpeg") {
      // JPEG has no alpha — paint a white background so transparency isn't black.
      const flat = document.createElement("canvas");
      flat.width = canvas.width;
      flat.height = canvas.height;
      const fctx = flat.getContext("2d");
      fctx.fillStyle = "#ffffff";
      fctx.fillRect(0, 0, flat.width, flat.height);
      fctx.drawImage(canvas, 0, 0);
      flat.toBlob((b) => resolve(b), mime, JPEG_QUALITY);
    } else {
      canvas.toBlob((b) => resolve(b), mime);
    }
  });
}

async function downloadSinglePiece(i) {
  const piece = state.fullPieces[i];
  if (!piece) return;
  const blob = await pieceToBlob(piece);
  if (!blob) {
    setStatus("Export failed. Try a different format.");
    return;
  }
  triggerDownload(blob, pieceFilename(piece, i));
  track("Download Piece", { format: state.format });
}

downloadZipBtn.addEventListener("click", async () => {
  if (!state.sourceCanvas) return;
  // Recompute from live control values — must not depend on the preview's
  // rAF-debounced rebuild, which could still be pending a slider change.
  const pieces = computeCurrentFullPieces();
  if (!pieces.length) return;
  downloadZipBtn.disabled = true;
  const total = pieces.length;
  const files = [];

  for (let i = 0; i < total; i++) {
    setStatus(`Building ZIP… ${i + 1}/${total}`, true);
    // setTimeout (not requestAnimationFrame) — rAF is suspended entirely on
    // backgrounded/hidden tabs, which would hang a large export forever if
    // the user switches away while it's building.
    if (i % 4 === 0) await new Promise((r) => setTimeout(r, 0));
    const piece = pieces[i];
    const blob = await pieceToBlob(piece);
    if (blob) files.push({ name: pieceFilename(piece, i), blob });
  }

  if (!files.length) {
    setStatus("Export failed. Try a different format.");
    downloadZipBtn.disabled = false;
    return;
  }

  const zip = await makeZip(files);
  triggerDownload(zip, `${state.fileBase}-split.zip`);
  setStatus(`Downloaded ✓ (${files.length} pieces)`);
  downloadZipBtn.disabled = false;
  track("Download Zip", { mode: state.mode, count: files.length, format: state.format });
});

// "Save to Photos" — only wired up when canShareFiles() revealed the button.
// On iOS/Android this hands the OS share sheet real image Files, letting the
// user save straight to the Photos app (or share into Instagram directly)
// instead of the ZIP-to-Files-app route, which iOS Safari has no way around.
sharePiecesBtn.addEventListener("click", async () => {
  if (!state.sourceCanvas) return;
  // Same fresh-recompute + pieceToBlob pipeline as the ZIP button — full
  // resolution, same EXIF-free canvas export, no reuse of the downscaled
  // preview canvas.
  const pieces = computeCurrentFullPieces();
  if (!pieces.length) return;
  sharePiecesBtn.disabled = true;

  try {
    const total = pieces.length;
    const files = [];
    for (let i = 0; i < total; i++) {
      setStatus(`Preparing to share… ${i + 1}/${total}`, true);
      if (i % 4 === 0) await new Promise((r) => setTimeout(r, 0));
      const piece = pieces[i];
      const blob = await pieceToBlob(piece);
      if (blob) files.push(new File([blob], pieceFilename(piece, i), { type: MIME[state.format] || "image/png" }));
    }

    if (!files.length) {
      setStatus("Export failed. Try a different format.");
      return;
    }

    if (navigator.canShare?.({ files })) {
      // Whole-batch share: on iOS this is the one-tap "Save N Images" path.
      await navigator.share({ files });
      setStatus(`Shared ✓ (${files.length} pieces)`);
    } else {
      // Platform can share files but rejected this batch (e.g. a file-count
      // or size ceiling) — fall back to sharing pieces one at a time.
      let shared = 0;
      for (const file of files) {
        if (!navigator.canShare?.({ files: [file] })) continue;
        try {
          await navigator.share({ files: [file] });
          shared++;
        } catch (e) {
          if (e instanceof DOMException && e.name === "AbortError") break; // user cancelled
        }
      }
      setStatus(
        shared
          ? `Shared ✓ (${shared}/${files.length} pieces)`
          : "Sharing isn't supported for this file — try Download ZIP instead."
      );
    }
    track("Share Pieces", { mode: state.mode, count: files.length, format: state.format });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      setStatus(""); // user cancelled the share sheet — not an error
    } else {
      setStatus("Sharing failed. Try Download ZIP instead.");
    }
  } finally {
    sharePiecesBtn.disabled = false;
  }
});

resetBtn.addEventListener("click", () => {
  state.sourceCanvas = null;
  state.previewCanvas = null;
  state.fullPieces = [];
  pieceGrid.textContent = "";
  dropzone.hidden = false;
  stage.hidden = true;
  controls.hidden = true;
  fileInput.value = "";
});

// --- Input paths -----------------------------------------------------------
// 1) File picker
fileInput.addEventListener("change", () => {
  if (fileInput.files && fileInput.files[0]) {
    loadFromBlob(fileInput.files[0], fileInput.files[0].name);
  }
});
// The dropzone is a <label> wrapping #fileInput, so a tap/click opens the
// native file picker with no JS — the most reliable path on iOS Safari, where
// a programmatic fileInput.click() is unreliable.

// 2) Drag & drop (accept anywhere on the tool area)
["dragenter", "dragover"].forEach((type) =>
  toolArea.addEventListener(type, (e) => {
    e.preventDefault();
    dropzone.classList.add("dragover");
  })
);
["dragleave", "drop"].forEach((type) =>
  toolArea.addEventListener(type, (e) => {
    e.preventDefault();
    if (type === "dragleave" && toolArea.contains(e.relatedTarget)) return;
    dropzone.classList.remove("dragover");
  })
);
toolArea.addEventListener("drop", (e) => {
  const file = e.dataTransfer?.files?.[0];
  if (file) loadFromBlob(file, file.name);
});

// 3) Clipboard paste (Ctrl/Cmd+V)
window.addEventListener("paste", (e) => {
  const items = e.clipboardData?.items || [];
  for (const item of items) {
    if (item.type.startsWith("image/")) {
      const blob = item.getAsFile();
      if (blob) {
        loadFromBlob(blob, blob.name);
        e.preventDefault();
        break;
      }
    }
  }
});
