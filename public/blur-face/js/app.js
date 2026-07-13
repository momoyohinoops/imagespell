import { render } from "./blur.js?v=3";
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
const CLICK_SLOP = 4; // px of pointer movement still counted as a "click"

// --- Element refs ----------------------------------------------------------
const $ = (id) => document.getElementById(id);
const dropzone = $("dropzone");
const fileInput = $("fileInput");
const stage = $("stage");
const canvas = $("canvas");
const overlay = $("overlay");
const controls = $("controls");
const strengthSlider = $("strengthSlider");
const strengthValue = $("strengthValue");
const strengthLabel = $("strengthLabel");
const modeBlur = $("modeBlur");
const modePixelate = $("modePixelate");
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
  strength: 16,
  effect: "blur", // "blur" | "pixelate"
  rectRegions: [], // manual: {x,y,w,h}
  faceRegions: [], // auto-detected: {x,y,w,h,enabled}
};

function activeRegions() {
  return state.rectRegions.concat(state.faceRegions.filter((r) => r.enabled));
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

  // Sensible default strength relative to the image, refined once faces
  // are found (see autoDetect below).
  const suggested = Math.round(Math.min(src.width, src.height) / 60);
  state.strength = clampStrength(suggested);
  strengthSlider.value = state.strength;
  strengthValue.textContent = state.strength;

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
  updateRegionHint();
  track("Image Loaded");
  autoDetect();
}

function clampStrength(v) {
  return Math.min(SLIDER_MAX, Math.max(SLIDER_MIN, v || SLIDER_MIN));
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
    effect: state.effect,
    strength: state.strength,
    regions: activeRegions(),
  });
}

// Overlay: selection outlines (display backing-store coords).
function drawOverlay(dragRect) {
  octx.clearRect(0, 0, overlay.width, overlay.height);
  const s = state.displayScale;

  octx.lineWidth = 2;
  octx.setLineDash([]);
  octx.strokeStyle = "rgba(37,99,235,0.9)";
  for (const r of state.rectRegions) {
    octx.strokeRect(r.x * s, r.y * s, r.w * s, r.h * s);
  }

  for (const r of state.faceRegions) {
    if (r.enabled) {
      octx.setLineDash([]);
      octx.strokeStyle = "rgba(220,38,38,0.9)";
      octx.lineWidth = 2;
    } else {
      octx.setLineDash([5, 4]);
      octx.strokeStyle = "rgba(107,114,128,0.85)";
      octx.lineWidth = 2;
    }
    octx.strokeRect(r.x * s, r.y * s, r.w * s, r.h * s);
  }

  if (dragRect) {
    octx.setLineDash([]);
    octx.strokeStyle = "rgba(37,99,235,0.9)";
    octx.strokeRect(dragRect.x, dragRect.y, dragRect.w, dragRect.h);
  }
}

function updateRegionHint() {
  const hasFaces = state.faceRegions.length > 0;
  regionHint.textContent = hasFaces
    ? "Click a face box to toggle its blur on or off. Drag anywhere else to add a custom area."
    : "Drag on the image to blur a custom area (great for license plates or missed faces).";
  regionHint.hidden = false;
}

// --- Selection (pointer) -----------------------------------------------
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

// Hit-test a display-space point against a natural-space region list.
function hitRegion(p, regions) {
  const s = state.displayScale;
  for (let i = regions.length - 1; i >= 0; i--) {
    const r = regions[i];
    if (
      p.x >= r.x * s &&
      p.x <= (r.x + r.w) * s &&
      p.y >= r.y * s &&
      p.y <= (r.y + r.h) * s
    ) {
      return i;
    }
  }
  return -1;
}

overlay.addEventListener("pointerdown", (e) => {
  if (!state.sourceCanvas) return;
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

  if (d.w <= CLICK_SLOP && d.h <= CLICK_SLOP) {
    // Treat as a click/tap: toggle a face, or remove a manual region.
    const p = { x: d.sx, y: d.sy };
    const faceIdx = hitRegion(p, state.faceRegions);
    if (faceIdx !== -1) {
      state.faceRegions[faceIdx].enabled = !state.faceRegions[faceIdx].enabled;
      renderPreview();
      drawOverlay();
      return;
    }
    const rectIdx = hitRegion(p, state.rectRegions);
    if (rectIdx !== -1) {
      state.rectRegions.splice(rectIdx, 1);
      renderPreview();
      drawOverlay();
      setStatus("Area removed");
      return;
    }
    drawOverlay();
    return;
  }

  // Drag: add a new manual region.
  const s = state.displayScale;
  state.rectRegions.push({
    x: d.x / s,
    y: d.y / s,
    w: d.w / s,
    h: d.h / s,
  });
  renderPreview();
  drawOverlay();
});

// --- Controls --------------------------------------------------------------
strengthSlider.min = SLIDER_MIN;
strengthSlider.max = SLIDER_MAX;

strengthSlider.addEventListener("input", () => {
  state.strength = Number(strengthSlider.value);
  strengthValue.textContent = state.strength;
  renderPreview();
});

function setEffect(effect) {
  state.effect = effect;
  modeBlur.classList.toggle("active", effect === "blur");
  modeBlur.setAttribute("aria-pressed", String(effect === "blur"));
  modePixelate.classList.toggle("active", effect === "pixelate");
  modePixelate.setAttribute("aria-pressed", String(effect === "pixelate"));
  strengthLabel.textContent = effect === "blur" ? "Blur strength" : "Pixelate size";
  renderPreview();
}

modeBlur.addEventListener("click", () => setEffect("blur"));
modePixelate.addEventListener("click", () => setEffect("pixelate"));

resetBtn.addEventListener("click", () => {
  state.sourceCanvas = null;
  dropzone.hidden = false;
  stage.hidden = true;
  controls.hidden = true;
  fileInput.value = "";
});

// --- Face detection (lazy, automatic on load) -------------------------------
async function autoDetect() {
  if (!state.sourceCanvas) return;
  setStatus("Loading face detector (first time only)…", true);
  try {
    const { detectFaces } = await import("./faces.js?v=3");
    if (!state.sourceCanvas) return; // user swapped images while loading
    const boxes = await detectFaces(state.sourceCanvas);
    if (!state.sourceCanvas) return;
    if (boxes.length === 0) {
      setStatus("No faces detected — drag on the image to blur an area manually.");
    } else {
      state.faceRegions = boxes.map((b) => ({ ...b, enabled: true }));
      // Refine default strength using the smallest detected face so it's
      // reliably obscured without over-blurring the whole preview.
      const minDim = Math.min(...boxes.map((b) => Math.min(b.w, b.h)));
      state.strength = clampStrength(Math.round(minDim * 0.22));
      strengthSlider.value = state.strength;
      strengthValue.textContent = state.strength;
      renderPreview();
      setStatus(`Blurred ${boxes.length} face${boxes.length > 1 ? "s" : ""} automatically`);
      track("Auto Blur", { count: boxes.length });
    }
  } catch (e) {
    console.error(e);
    setStatus("Face detection failed to load. Drag on the image to blur an area manually.");
  } finally {
    drawOverlay();
    updateRegionHint();
  }
}

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
    effect: state.effect,
    strength: state.strength,
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
      a.download = `blurred.${fmt === "jpeg" ? "jpg" : fmt}`;
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
// The dropzone is a <label> wrapping #fileInput, so a tap/click opens the
// native file picker with no JS — the most reliable path on iOS Safari, where
// a programmatic fileInput.click() is unreliable. (Keyboard: the focusable,
// visually-hidden input activates on Enter/Space natively.)

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
