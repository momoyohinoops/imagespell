// license.js — Polar Customer Portal License Key API (public, unauthenticated
// — no API key needed from the browser; Polar's docs explicitly state these
// endpoints are safe to call from an untrusted public client). Handles
// activate / validate, localStorage persistence, and graceful offline
// degradation (never freeze the app on a failed check).
import { getPolarConfig } from "./polar.config.js";

// v2: replaces the previous provider's v1 schema (instanceId/variantId).
// No migration from v1 — the migration order confirmed zero real purchasers
// existed under LS, so old records are simply abandoned/ignored.
const LS_KEY = "imagespell.dmg.license.v2";

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

// Stable-ish per-browser label so repeat activations reuse the same Polar
// "activation" slot (activation limit = 3). Persisted alongside the license.
// (Generic concept, not Polar-specific — kept the same storage key/shape
// across the LS -> Polar migration.)
function instanceLabel() {
  let id = localStorage.getItem("imagespell.dmg.instance");
  if (!id) { id = "imagespell-dmg-" + Math.random().toString(36).slice(2, 10); localStorage.setItem("imagespell.dmg.instance", id); }
  return id;
}

async function postJson(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Accept": "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

// Activate a license key. Returns { pro, message }.
export async function activateLicense(rawKey) {
  const key = (rawKey || "").trim();
  if (!key) return { pro: false, message: "Please enter your license key." };
  const cfg = await getPolarConfig();
  try {
    const { ok, status, data } = await postJson(cfg.apiBase + cfg.licenseApi.activate, {
      key,
      organization_id: cfg.organizationId,
      label: instanceLabel(),
    });
    if (ok && data.id && data.license_key) {
      // Product scoping: replaces the old LS variant_id compare. A license
      // key belongs to a specific benefit; reject anything not ours (e.g. a
      // key copy-pasted from a different Polar product/organization).
      const benefitId = data.license_key.benefit_id;
      if (benefitId && benefitId !== cfg.benefitId) {
        return { pro: false, message: "This key is for a different product." };
      }
      saveStored({
        key,
        activationId: data.id,
        benefitId: benefitId || cfg.benefitId,
        status: data.license_key.status || "granted",
        lastValidated: Date.now(),
      });
      return { pro: true, message: "Pro unlocked. Thank you!" };
    }
    return { pro: false, message: humanizeError(status, data) };
  } catch (e) {
    return { pro: false, offline: true, message: "Couldn't reach the license server (offline?)." };
  }
}

// Validate the (stored or given) license. Returns { pro, offline?, message }.
export async function validateLicense(rawKey) {
  const stored = loadStored();
  const key = (rawKey || stored?.key || "").trim();
  if (!key) return { pro: false, message: "No license registered." };
  const cfg = await getPolarConfig();
  try {
    const params = { key, organization_id: cfg.organizationId, benefit_id: cfg.benefitId };
    if (stored?.activationId) params.activation_id = stored.activationId;
    const { ok, status, data } = await postJson(cfg.apiBase + cfg.licenseApi.validate, params);
    const valid = ok && data.status === "granted" && (!data.benefit_id || data.benefit_id === cfg.benefitId);
    if (valid) {
      if (stored) saveStored({ ...stored, status: data.status, lastValidated: Date.now() });
      return { pro: true, message: "License valid." };
    }
    if (ok && data.benefit_id && data.benefit_id !== cfg.benefitId) {
      return { pro: false, message: "This key is for a different product." };
    }
    // Definitive failure (revoked/disabled/not found) → downgrade to free.
    return { pro: false, message: humanizeError(status, data, ok ? data.status : null) };
  } catch (e) {
    // Network error: degrade to free for this session, but KEEP the key so a
    // later online check can re-enable Pro. Never freeze the app.
    return { pro: false, offline: true, message: "Couldn't verify your license (offline). We'll re-check when you're back online." };
  }
}

// Error classification, calibrated against REAL Polar responses (captured
// 2026-07-21 against the live API — do not "simplify" back to status codes):
//   activate, limit reached → 403 {detail:"License key activation limit already reached"}
//   activate, revoked key   → 403 {detail:"License key is no longer active. …"}
//   validate, revoked key   → 404 {detail:"License key is no longer active."}
//   any, unknown key        → 404 {detail:"Not found"}
// So an HTTP status alone is ambiguous (403 = limit OR revoked; 404 = typo OR
// revoked) — the `detail` text is the only reliable discriminator. `status`
// covers the 200-with-status-field shape as a defensive extra.
function humanizeError(httpStatus, data, status) {
  const detail = String(data?.detail || "").toLowerCase();
  if (status === "revoked" || detail.includes("no longer active")) return "This license has been revoked.";
  if (status === "disabled") return "This license has been disabled.";
  if (httpStatus === 403 && detail.includes("activation limit")) return "Activation limit reached (3 devices).";
  if (httpStatus === 403) return "This license can't be activated.";
  if (httpStatus === 404) return "Key not found. Please check what you entered.";
  if (httpStatus === 422) return "That doesn't look like a valid license key.";
  return "Couldn't verify your license.";
}

// True if URL carries the Polar post-purchase marker (configured on the
// Polar checkout link's confirmation/success URL — see polar.config.js).
export function isPurchaseSuccessReturn() {
  return new URLSearchParams(location.search).get("purchase") === "success";
}

// Remove the ?purchase=success marker from the URL bar (keep history clean).
export function clearPurchaseMarker() {
  const url = new URL(location.href);
  url.searchParams.delete("purchase");
  history.replaceState({}, "", url.pathname + (url.search || "") + url.hash);
}
