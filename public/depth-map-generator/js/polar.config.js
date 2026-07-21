// Polar — PUBLIC configuration (safe to ship to the browser).
//
// These are public identifiers used to open the hosted checkout and to call
// the public, unauthenticated Customer Portal License Key API. They are NOT
// secrets — Polar's docs explicitly state these endpoints are safe to call
// from an untrusted public client (browser, desktop app, mobile app).
//
// No API key is used anywhere in this file or in frontend code, ever.
//
// Source of truth: values supplied by the requester (2026-07-16 order),
// organization confirmed approved/Payouts-Ready 2026-07-15.
//   Organization: ImageSpell → product "ImageSpell Pro — Depth Map Generator"
//   ($19 one-time, license keys: Unlimited expiry, activation limit 3).

// ── Feature flag ────────────────────────────────────────────────────────────
// Pro purchasing is GATED OFF until the migration's E2E acceptance criteria
// (production real-purchase E2E) pass. While false:
//   • the "Upgrade to Pro" button shows "Pro — coming soon" and does NOT open
//     checkout;
//   • the license-key input stays available (so an early key can still unlock).
// Flip to `true` in a dedicated commit, only after the requester explicitly
// instructs it post-E2E. One place to edit.
export const PRO_ENABLED = false;

// Production values (this file is committed and shipped as-is).
const PRODUCTION = Object.freeze({
  apiBase: "https://api.polar.sh",
  organizationId: "beb2e6f8-76b0-42d9-b762-59ae5e2e522e",
  benefitId: "f45f7515-0207-48f3-afe0-d81f162bbb6c", // license-key benefit for product scoping
  checkoutUrl: "https://buy.polar.sh/polar_cl_pSdqQpYaEWdW0PdaDlp1yc0ByEiL4W9IjvWjk1alopf",
  activationLimit: 3, // matches the Polar dashboard setting; not enforced client-side

  // Documentation only (not read by any code): configured on the Polar
  // dashboard checkout link itself, not something this app sets at runtime.
  purchaseSuccessUrl: "https://imagespell.com/depth-map-generator/?purchase=success",

  // Public, unauthenticated Customer Portal License Key API (no API key
  // needed — see module comment above). Paths are joined onto `apiBase`.
  licenseApi: {
    activate: "/v1/customer-portal/license-keys/activate",
    validate: "/v1/customer-portal/license-keys/validate",
    deactivate: "/v1/customer-portal/license-keys/deactivate",
  },
});

let _resolved = null;

// Resolves the active Polar config: PRODUCTION values, overridden by
// public/depth-map-generator/js/polar.config.local.js if that file is
// present. That file is gitignored and exists only in local dev checkouts
// (holds non-production override values for local testing) — it is never deployed, so a
// dynamic import of it 404s harmlessly in production and we fall back to
// PRODUCTION. Result is cached after first resolution.
export async function getPolarConfig() {
  if (_resolved) return _resolved;
  let overrides = null;
  try {
    const mod = await import("./polar.config.local.js");
    overrides = mod.POLAR_LOCAL || null;
  } catch {
    // Not present — expected in production. Ignore.
  }
  _resolved = Object.freeze({
    ...PRODUCTION,
    ...(overrides || {}),
    licenseApi: Object.freeze({ ...PRODUCTION.licenseApi, ...(overrides?.licenseApi || {}) }),
  });
  return _resolved;
}
