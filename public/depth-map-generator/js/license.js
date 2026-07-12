// license.js — Lemon Squeezy License API (public, no API key needed from the
// browser). Handles activate / validate, localStorage persistence, and graceful
// offline degradation (never freeze the app on a failed check).
import { LEMONSQUEEZY } from "./lemonsqueezy.config.js";

const LS_KEY = "imagespell.dmg.license.v1";

function loadStored() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "null"); } catch { return null; }
}
function saveStored(obj) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(obj)); } catch {}
}
export function clearLicense() {
  try { localStorage.removeItem(LS_KEY); } catch {}
}
export function getStoredLicense() { return loadStored(); }

// Stable-ish per-browser instance name so repeat activations reuse a slot
// (activation limit = 3). Persisted alongside the license.
function instanceName() {
  let id = localStorage.getItem("imagespell.dmg.instance");
  if (!id) { id = "imagespell-dmg-" + Math.random().toString(36).slice(2, 10); localStorage.setItem("imagespell.dmg.instance", id); }
  return id;
}

async function postForm(url, params) {
  const body = new URLSearchParams(params);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Accept": "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

// Activate a license key. Returns { pro, message, instanceId }.
export async function activateLicense(rawKey) {
  const key = (rawKey || "").trim();
  if (!key) return { pro: false, message: "Please enter your license key." };
  try {
    const { ok, data } = await postForm(LEMONSQUEEZY.licenseApi.activate, {
      license_key: key, instance_name: instanceName(),
    });
    // LS returns { activated:true, instance:{id}, license_key:{status}, meta:{...} }
    if (ok && data.activated && data.instance?.id) {
      const record = {
        key,
        instanceId: data.instance.id,
        status: data.license_key?.status || "active",
        lastValidated: Date.now(),
        variantId: String(data.meta?.variant_id ?? ""),
      };
      // Guard: only unlock for OUR product variant.
      if (record.variantId && record.variantId !== LEMONSQUEEZY.variantId) {
        return { pro: false, message: "This key is for a different product." };
      }
      saveStored(record);
      return { pro: true, message: "Pro unlocked. Thank you!", instanceId: record.instanceId };
    }
    // Already activated on this instance, or limit reached, etc.
    const err = data.error || data.license_key?.status || "activation failed";
    if (/already/i.test(String(err))) {
      // Fall back to validate to confirm it's usable.
      const v = await validateLicense(key);
      if (v.pro) return v;
    }
    return { pro: false, message: humanizeError(err) };
  } catch (e) {
    return { pro: false, offline: true, message: "Couldn't reach the license server (offline?)." };
  }
}

// Validate the (stored or given) license. Returns { pro, offline?, message }.
export async function validateLicense(rawKey) {
  const stored = loadStored();
  const key = (rawKey || stored?.key || "").trim();
  if (!key) return { pro: false, message: "No license registered." };
  try {
    const params = { license_key: key };
    if (stored?.instanceId) params.instance_id = stored.instanceId;
    const { ok, data } = await postForm(LEMONSQUEEZY.licenseApi.validate, params);
    const status = data.license_key?.status;
    const valid = ok && data.valid && (status === "active");
    if (valid) {
      if (stored) saveStored({ ...stored, status, lastValidated: Date.now() });
      return { pro: true, message: "License valid." };
    }
    // Definitive failure (expired/disabled/invalid) → downgrade to free.
    return { pro: false, message: humanizeError(status || data.error || "invalid license") };
  } catch (e) {
    // Network error: degrade to free for this session, but KEEP the key so a
    // later online check can re-enable Pro. Never freeze the app.
    return { pro: false, offline: true, message: "Couldn't verify your license (offline). We'll re-check when you're back online." };
  }
}

function humanizeError(code) {
  const s = String(code).toLowerCase();
  if (s.includes("expired")) return "This license has expired.";
  if (s.includes("disabled")) return "This license has been disabled.";
  if (s.includes("limit")) return "Activation limit reached (3 devices).";
  if (s.includes("not found") || s.includes("invalid")) return "Key not found. Please check what you entered.";
  return "Couldn't verify your license.";
}

// True if URL carries the LS post-purchase marker.
export function isPurchaseSuccessReturn() {
  return new URLSearchParams(location.search).get("purchase") === "success";
}

// Remove the ?purchase=success marker from the URL bar (keep history clean).
export function clearPurchaseMarker() {
  const url = new URL(location.href);
  url.searchParams.delete("purchase");
  history.replaceState({}, "", url.pathname + (url.search || "") + url.hash);
}
