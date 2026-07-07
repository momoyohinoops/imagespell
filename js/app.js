import { render } from "./pixelate.js";
import { track } from "./analytics.js";
import { SITE } from "./config.js";

// Reflect configured site name into the DOM (title/URL live in one config file).
document.querySelectorAll("[data-site-name]").forEach((el) => {
  el.textContent = SITE.name;
});

// --- Constants -------------------------------------------------------------
const MAX_PREVIEW = 1600; // cap preview backing-store size for performance
const SLIDER_MIN = 2;
const SLIDER_MAX = 100;

// --- Element refs ----------------------------------------------------------
const $ = (id) => document.getElementById(id);
const dropzone = $("dropzone");
const fileInput = $("fileInput");
const stage = $("stage");
const canvas = $("canvas");
const overlay = $("overlay");
const controls = $("controls");
const blockSlider = $("blockSlider");
const blockValue = $("blockValue");
const modeWhole = $("modeWhole");
const modeRegions = $("modeRegions");
const faceBtn = $("faceBtn");
const clearBtn = $("clearBtn");
const resetBtn = $("resetBtn");
const formatSelect = $("formatSelect");
const downloadBtn = $("downloadBtn");
const statusEl = $("status");
const regionHint = $("regionHint");

const ctx = canvas.getContext("2d");
const octx = overlay.getContext("2d");

// --- State -----------------------------------------------------------------
const state = {
  sourceCanvas: null, // full-res original
  naturalW: 0,
  naturalH: 0,
  displayScale: 1, // natural -> display backing px
  block: 12,
  mode: "whole", // "whole" | "regions"
  rectRegions: [],
  faceRegions: [],
};

function activeRegions() {
  return state.rectRegions.concat(state.faceRegions);
}

// --- Status helper ---------------------------------------------------------
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

// --- Loading an image ------------------------------------------------------
async function loadFromBlob(blob) {
  if (!blob || !blob.type.startsWith("image/")) {
    setStatus("That doesn't look like an image file.");
    return;
  }
  let bitmap;
  try {
    bitmap = await createImageBitmap(blob);
  } catch (e) {
    // Fallback path (older Safari): use an <img>.
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
  state.rectRegions = [];
  state.faceRegions = [];

  // Sensible default block size relative to the image.
  const suggested = Math.round(Math.min(src.width, src.height) / 45);
  state.block = Math.min(SLIDER_MAX, Math.max(SLIDER_MIN, suggested || 12));
  blockSlider.value = state.block;
  blockValue.textContent = state.block;

  // Size the preview backing store (capped for perf).
  const s = Math.min(1, MAX_PREVIEW / Math.max(src.width, src.height));
  state.displayScale = s;
  canvas.width = Math.max(1, Math.round(src.width * s));
  canvas.height = Math.max(1, Math.round(src.height * s));
  overlay.width = canvas.width;
  overlay.height = canvas.height;

  showEditor();
  renderPreview();
  drawOverlay();
  track("Image Loaded");
  setStatus(`Loaded ${src.width}×${src.height}px`);
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

// --- Rendering -------------------------------------------------------------
function renderPreview() {
  if (!state.sourceCanvas) return;
  render(canvas, state.sourceCanvas, state.naturalW, state.naturalH, {
    block: state.block,
    mode: state.mode,
    regions: activeRegions(),
  });
}

// Overlay: selection outlines (display backing-store coords).
function drawOverlay(dragRect) {
  octx.clearRect(0, 0, overlay.width, overlay.height);
  if (state.mode !== "regions") return;
  const s = state.displayScale;

  octx.lineWidth = 2;
  octx.setLineDash([6, 4]);
  for (const r of state.rectRegions) {
    octx.strokeStyle = "rgba(37,99,235,0.9)";
    octx.strokeRect(r.x * s, r.y * s, r.w * s, r.h * s);
  }
  octx.strokeStyle = "rgba(220,38,38,0.9)";
  for (const r of state.faceRegions) {
    octx.strokeRect(r.x * s, r.y * s, r.w * s, r.h * s);
  }
  if (dragRect) {
    octx.strokeStyle = "rgba(37,99,235,0.9)";
    octx.strokeRect(dragRect.x, dragRect.y, dragRect.w, dragRect.h);
  }
}

function updateRegionHint() {
  const show =
    state.mode === "regions" &&
    state.rectRegions.length === 0 &&
    state.faceRegions.length === 0;
  regionHint.hidden = !show;
}

// --- Selection (pointer) ---------------------------------------------------
let dragging = null;

function pointerPos(e) {
  const rect = overlay.getBoundingClientRect();
  const x = ((e.clientX - rect.left) / rect.width) * overlay.width;
  const y = ((e.clientY - rect.top) / rect.height) * overlay.height;
  return {
    x: Math.max(0, Math.min(overlay.width, x)),
    y: Math.max(0, Math.min(overlay.height, y)),
  };
}

overlay.addEventListener("pointerdown", (e) => {
  if (state.mode !== "regions") return;
  overlay.setPointerCapture(e.pointerId);
  const p = pointerPos(e);
  dragging = { sx: p.x, sy: p.y, x: p.x, y: p.y, w: 0, h: 0 };
  e.preventDefault();
});

overlay.addEventListener("pointermove", (e) => {
  if (!dragging) return;
  const p = pointerPos(e);
  dragging.x = Math.min(dragging.sx, p.x);
  dragging.y = Math.min(dragging.sy, p.y);
  dragging.w = Math.abs(p.x - dragging.sx);
  dragging.h = Math.abs(p.y - dragging.sy);
  drawOverlay(dragging);
});

overlay.addEventListener("pointerup", (e) => {
  if (!dragging) return;
  const d = dragging;
  dragging = null;
  overlay.releasePointerCapture?.(e.pointerId);
  // Ignore tiny accidental taps.
  if (d.w > 4 && d.h > 4) {
    const s = state.displayScale;
    state.rectRegions.push({
      x: d.x / s,
      y: d.y / s,
      w: d.w / s,
      h: d.h / s,
    });
    renderPreview();
  }
  drawOverlay();
  updateRegionHint();
});

// --- Controls --------------------------------------------------------------
blockSlider.min = SLIDER_MIN;
blockSlider.max = SLIDER_MAX;

blockSlider.addEventListener("input", () => {
  state.block = Number(blockSlider.value);
  blockValue.textContent = state.block;
  renderPreview();
});

function setMode(mode) {
  state.mode = mode;
  modeWhole.classList.toggle("active", mode === "whole");
  modeWhole.setAttribute("aria-pressed", String(mode === "whole"));
  modeRegions.classList.toggle("active", mode === "regions");
  modeRegions.setAttribute("aria-pressed", String(mode === "regions"));
  overlay.classList.toggle("selectable", mode === "regions");
  renderPreview();
  drawOverlay();
  updateRegionHint();
}

modeWhole.addEventListener("click", () => setMode("whole"));
modeRegions.addEventListener("click", () => setMode("regions"));

clearBtn.addEventListener("click", () => {
  state.rectRegions = [];
  state.faceRegions = [];
  renderPreview();
  drawOverlay();
  updateRegionHint();
  setStatus("Selections cleared");
});

resetBtn.addEventListener("click", () => {
  state.sourceCanvas = null;
  dropzone.hidden = false;
  stage.hidden = true;
  controls.hidden = true;
  fileInput.value = "";
});

// --- Face detection (lazy) -------------------------------------------------
faceBtn.addEventListener("click", async () => {
  if (!state.sourceCanvas) return;
  faceBtn.disabled = true;
  const label = faceBtn.textContent;
  faceBtn.textContent = "Detecting…";
  setStatus("Loading face detector (first time only)…", true);
  try {
    const { detectFaces } = await import("./faces.js");
    const boxes = await detectFaces(state.sourceCanvas);
    if (boxes.length === 0) {
      setStatus("No faces detected.");
    } else {
      // De-dupe against existing face boxes if pressed twice.
      state.faceRegions = boxes;
      setMode("regions");
      setStatus(`Pixelated ${boxes.length} face${boxes.length > 1 ? "s" : ""}`);
      track("Face Mosaic", { count: boxes.length });
    }
  } catch (e) {
    console.error(e);
    setStatus("Face detection failed to load. Try again or use manual selection.");
  } finally {
    faceBtn.disabled = false;
    faceBtn.textContent = label;
  }
});

// --- Download --------------------------------------------------------------
const MIME = {
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

downloadBtn.addEventListener("click", async () => {
  if (!state.sourceCanvas) return;
  downloadBtn.disabled = true;
  setStatus("Preparing full-resolution export…", true);

  // Yield so the status text paints before we block on the big render.
  await new Promise((r) => requestAnimationFrame(r));

  const fmt = formatSelect.value;
  const mime = MIME[fmt] || "image/png";

  const out = document.createElement("canvas");
  out.width = state.naturalW;
  out.height = state.naturalH;
  const octxOut = out.getContext("2d");

  // JPEG has no alpha — paint a white background so transparency isn't black.
  if (mime === "image/jpeg") {
    octxOut.fillStyle = "#ffffff";
    octxOut.fillRect(0, 0, out.width, out.height);
    octxOut.drawImage(state.sourceCanvas, 0, 0);
  }

  render(out, state.sourceCanvas, state.naturalW, state.naturalH, {
    block: state.block,
    mode: state.mode,
    regions: activeRegions(),
  });

  out.toBlob(
    (blob) => {
      if (!blob) {
        setStatus("Export failed. Try a different format.");
        downloadBtn.disabled = false;
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `pixelated.${fmt === "jpeg" ? "jpg" : fmt}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      setStatus("Downloaded ✓");
      downloadBtn.disabled = false;
      track("Download", { format: fmt });
    },
    mime,
    0.92
  );
});

// --- Input paths -----------------------------------------------------------
// 1) File picker
fileInput.addEventListener("change", () => {
  if (fileInput.files && fileInput.files[0]) loadFromBlob(fileInput.files[0]);
});
dropzone.addEventListener("click", () => fileInput.click());
dropzone.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    fileInput.click();
  }
});

// 2) Drag & drop (accept anywhere on the tool area)
const toolArea = $("tool");
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
  if (file) loadFromBlob(file);
});

// 3) Clipboard paste (Ctrl/Cmd+V)
window.addEventListener("paste", (e) => {
  const items = e.clipboardData?.items || [];
  for (const item of items) {
    if (item.type.startsWith("image/")) {
      const blob = item.getAsFile();
      if (blob) {
        loadFromBlob(blob);
        e.preventDefault();
        break;
      }
    }
  }
});
