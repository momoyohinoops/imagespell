// main.js — UI controller for the Depth Map Generator.
import { estimateDepth, hasWebGPU, getBackend } from "./depth-engine.js";
import { estimateTiled } from "./tiling.js";
import { drawFieldToCanvas } from "./render.js";
import { exportPNG8, exportPNG16, triggerDownload, makeZip } from "./export.js";
import { COLORMAP_KEYS } from "./colormaps.js";
import { POSTPROCESS, HIRES, RUNTIME } from "./depth-config.js";
import {
  activateLicense, validateLicense, getStoredLicense, clearLicense,
  isPurchaseSuccessReturn, clearPurchaseMarker,
} from "./license.js";
import { openCheckout } from "./checkout.js";
import { PRO_ENABLED } from "./lemonsqueezy.config.js";

const $ = (id) => document.getElementById(id);
const state = {
  originalCanvas: null, // full-resolution source
  fileName: "image",
  field: null, fieldW: 0, fieldH: 0,
  isPro: false,
  busy: false,
};

// ── Options ────────────────────────────────────────────────────────────────
function currentOpts() {
  return { invert: $("invert").checked, colormapKey: $("colormap").value };
}

// ── Image loading ────────────────────────────────────────────────────────────
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function fileToCanvas(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const c = document.createElement("canvas");
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    c.getContext("2d").drawImage(img, 0, 0);
    return c;
  } finally { setTimeout(() => URL.revokeObjectURL(url), 2000); }
}

function downscaledForFree(canvas) {
  const maxSide = HIRES.freeMaxSide;
  const s = Math.max(canvas.width, canvas.height);
  if (s <= maxSide) return canvas;
  const scale = maxSide / s;
  const c = document.createElement("canvas");
  c.width = Math.round(canvas.width * scale);
  c.height = Math.round(canvas.height * scale);
  const ctx = c.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(canvas, 0, 0, c.width, c.height);
  return c;
}

// ── Progress UI ──────────────────────────────────────────────────────────────
function setProgress(p) {
  const bar = $("progressBar"), wrap = $("progress"), txt = $("progressText");
  wrap.hidden = false;
  bar.style.width = Math.round((p.progress0to1 || 0) * 100) + "%";
  txt.textContent = p.message || "";
}
function hideProgress() { $("progress").hidden = true; }

function setBackendBadge() {
  const b = getBackend();
  const badge = $("backendBadge");
  if (!b) { badge.hidden = true; return; }
  badge.hidden = false;
  if (b === "webgpu") { badge.textContent = "WebGPU"; badge.className = "badge ok"; }
  else { badge.textContent = "Slow mode (WASM)"; badge.className = "badge warn"; }
  $("slowNotice").hidden = (b === "webgpu");
}

// ── Core run ─────────────────────────────────────────────────────────────────
async function run(canvas) {
  if (state.busy) return;
  state.busy = true;
  state.originalCanvas = canvas;
  $("stage").hidden = false;
  // show source preview
  const sc = $("srcCanvas");
  sc.width = canvas.width; sc.height = canvas.height;
  sc.getContext("2d").drawImage(canvas, 0, 0);

  const wantHiRes = state.isPro && $("hires")?.checked;
  try {
    let result;
    if (wantHiRes) {
      result = await estimateTiled(canvas, { onProgress: setProgress });
    } else {
      const working = downscaledForFree(canvas);
      result = await estimateDepth(working, { onProgress: setProgress });
    }
    state.field = result.field; state.fieldW = result.width; state.fieldH = result.height;
    setBackendBadge();
    redraw();
    hideProgress();
    $("resultInfo").textContent =
      `Depth map: ${state.fieldW}×${state.fieldH} → export at input resolution ${canvas.width}×${canvas.height}`;
  } catch (e) {
    console.error(e);
    setProgress({ progress0to1: 0, message: "Error: " + (e?.message || e) });
  } finally {
    state.busy = false;
  }
}

function redraw() {
  if (!state.field) return;
  drawFieldToCanvas($("depthCanvas"), state.field, state.fieldW, state.fieldH, currentOpts());
}

// ── Exports ──────────────────────────────────────────────────────────────────
async function doExport8() {
  if (!state.field) return;
  const { width, height } = state.originalCanvas;
  const blob = await exportPNG8(state.field, state.fieldW, state.fieldH, width, height, currentOpts());
  triggerDownload(blob, `${state.fileName}-depth.png`);
}

async function doExport16() {
  if (!requirePro()) return;
  if (!state.field) return;
  const { width, height } = state.originalCanvas;
  setProgress({ progress0to1: 0.5, message: "Encoding 16-bit PNG…" });
  const blob = await exportPNG16(state.field, state.fieldW, state.fieldH, width, height, { invert: currentOpts().invert });
  hideProgress();
  triggerDownload(blob, `${state.fileName}-depth-16bit.png`);
}

// ── Batch (Pro) ──────────────────────────────────────────────────────────────
async function runBatch(files) {
  if (!requirePro()) return;
  if (!files.length) return;
  const results = [];
  const opts = currentOpts();
  const bits = $("batch16").checked ? 16 : 8;
  let i = 0;
  for (const file of files) {
    i++;
    setProgress({ progress0to1: i / (files.length + 1), message: `Batch ${i}/${files.length}: ${file.name}` });
    const canvas = await fileToCanvas(file);
    const working = downscaledForFree(canvas);
    const { field, width, height } = await estimateDepth(working);
    const base = file.name.replace(/\.[^.]+$/, "");
    const blob = bits === 16
      ? await exportPNG16(field, width, height, canvas.width, canvas.height, { invert: opts.invert })
      : await exportPNG8(field, width, height, canvas.width, canvas.height, opts);
    results.push({ name: `${base}-depth${bits === 16 ? "-16bit" : ""}.png`, blob });
  }
  setProgress({ progress0to1: 1, message: "Building ZIP…" });
  const zip = await makeZip(results);
  hideProgress();
  triggerDownload(zip, "depth-maps.zip");
}

// ── Pro / license ────────────────────────────────────────────────────────────
function requirePro() {
  if (state.isPro) return true;
  openProPanel(PRO_ENABLED
    ? "This is a Pro feature. Unlock it with your license key below."
    : "Pro is launching soon. If you already have a license key, paste it below to unlock.");
  return false;
}

function setProUI(isPro) {
  state.isPro = isPro;
  document.body.classList.toggle("is-pro", isPro);
  $("proBadge").hidden = !isPro;
  $("upgradeBtn").hidden = isPro;
  for (const el of document.querySelectorAll("[data-pro]")) el.disabled = !isPro;
}

function openProPanel(msg) {
  $("proPanel").hidden = false;
  $("proPanel").scrollIntoView({ behavior: "smooth", block: "center" });
  if (msg) $("licenseMsg").textContent = msg;
  $("licenseKey").focus();
}

async function onActivate() {
  const key = $("licenseKey").value;
  $("licenseMsg").textContent = "Checking…";
  const r = await activateLicense(key);
  $("licenseMsg").textContent = r.message;
  if (r.pro) { setProUI(true); $("proPanel").hidden = true; }
}

async function refreshLicenseOnLoad() {
  const stored = getStoredLicense();
  if (!stored) return;
  const r = await validateLicense();
  if (r.pro) setProUI(true);
  else if (r.offline) {
    // Keep the key; try again when back online.
    window.addEventListener("online", async () => {
      const v = await validateLicense();
      if (v.pro) setProUI(true);
    }, { once: true });
  } else {
    // Definitive failure → stay free but keep the key for the user to retry.
    setProUI(false);
  }
}

// ── Input wiring: drop / file / paste ────────────────────────────────────────
function wireInputs() {
  const drop = $("drop");
  ["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => {
    e.preventDefault(); drop.classList.add("drag");
  }));
  ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => {
    e.preventDefault(); drop.classList.remove("drag");
  }));
  drop.addEventListener("drop", async (e) => {
    const file = [...(e.dataTransfer?.files || [])].find((f) => f.type.startsWith("image/"));
    if (file) await handleFile(file);
  });
  $("fileInput").addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (file) await handleFile(file);
  });
  window.addEventListener("paste", async (e) => {
    const item = [...(e.clipboardData?.items || [])].find((it) => it.type.startsWith("image/"));
    if (item) { const f = item.getAsFile(); if (f) await handleFile(f); }
  });
}

async function handleFile(file) {
  state.fileName = (file.name || "image").replace(/\.[^.]+$/, "");
  const canvas = await fileToCanvas(file);
  await run(canvas);
}

// ── Boot ─────────────────────────────────────────────────────────────────────
function boot() {
  // populate colormap select
  const sel = $("colormap");
  for (const k of COLORMAP_KEYS) {
    const o = document.createElement("option");
    o.value = k; o.textContent = k === "grayscale" ? "Grayscale" : k;
    sel.appendChild(o);
  }
  $("invert").checked = POSTPROCESS.invertDefault;
  if (!hasWebGPU()) $("slowNotice").hidden = false;

  $("invert").addEventListener("change", redraw);
  $("colormap").addEventListener("change", redraw);
  $("export8").addEventListener("click", doExport8);
  $("export16").addEventListener("click", doExport16);
  setupUpgradeButton();
  $("activateBtn").addEventListener("click", onActivate);
  $("hires")?.addEventListener("change", () => { if (state.originalCanvas) run(state.originalCanvas); });
  $("batchInput")?.addEventListener("change", (e) => runBatch([...e.target.files]));
  $("hasKeyLink").addEventListener("click", (e) => { e.preventDefault(); openProPanel(); });

  wireInputs();
  setProUI(false);
  refreshLicenseOnLoad();

  // Post-purchase: auto-open the key input (the last mile).
  if (isPurchaseSuccessReturn()) {
    openProPanel("Thanks for your purchase! Paste the license key from your email below and press Unlock.");
    clearPurchaseMarker();
  }
}

// Gate the Upgrade button behind PRO_ENABLED. While Pro is not enabled (store
// KYC pending), show "Pro — coming soon" and don't open checkout; the license
// key panel stays reachable so an early key can still unlock.
function setupUpgradeButton() {
  const btn = $("upgradeBtn");
  const onBought = () => openProPanel("Thanks for your purchase! Paste the key from your email below.");
  if (PRO_ENABLED) {
    btn.addEventListener("click", () => openCheckout({ onSuccess: onBought }));
  } else {
    btn.textContent = "Pro — coming soon";
    btn.classList.add("is-soon");
    btn.addEventListener("click", () =>
      openProPanel("Pro is launching soon — checkout will open here. Already have a license key? Paste it below."));
  }
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
else boot();
