// Lemon Squeezy — PUBLIC configuration (safe to ship to the browser).
//
// These are public identifiers used to open the hosted checkout and to call
// the public License API (activate/validate). They are NOT secrets.
//
// ⚠️  The Lemon Squeezy API KEY must NEVER appear in this file or anywhere in
//     frontend code. It lives only in `.env` and is used for dev-time admin
//     tasks (e.g. fetching the Variant ID below).
//
// Source of truth: fetched via the LS API on 2026-07-10 (implementation step 2).
//   Store 428235 → product 1209872 ("ImageSpell Pro — Depth Map Generator",
//   published, $19.00) → variant 1891543 (Default, price 1900, one-time).

// ── Feature flag ────────────────────────────────────────────────────────────
// Pro purchasing is GATED OFF until the Lemon Squeezy store clears KYC (test
// mode is currently locked). While false:
//   • the "Upgrade to Pro" button shows "Pro — coming soon" and does NOT open
//     checkout;
//   • the license-key input stays available (so an early key can still unlock).
// Flip to `true` after KYC to enable the checkout overlay. One place to edit.
export const PRO_ENABLED = false;

export const LEMONSQUEEZY = Object.freeze({
  storeId: "428235",
  productId: "1209872",
  variantId: "1891543", // $19 one-time — used for checkout overlay
  variantSlug: "50776f87-3e21-49bf-a586-16e88b7ed70c", // checkout UUID
  storeSubdomain: "imagespell.lemonsqueezy.com",

  // Official hosted checkout URL (from LS API `buy_now_url`). Open as an
  // overlay via LS.js by appending `?embed=1`.
  checkoutUrl: "https://imagespell.lemonsqueezy.com/checkout/buy/50776f87-3e21-49bf-a586-16e88b7ed70c",

  // Where LS returns the buyer after purchase (configured in LS dashboard).
  // The page must detect ?purchase=success and auto-open the license-key input.
  purchaseSuccessUrl: "https://imagespell.com/depth-map-generator?purchase=success",

  // Public License API endpoints (NO API key required — safe from the browser).
  licenseApi: {
    activate: "https://api.lemonsqueezy.com/v1/licenses/activate",
    validate: "https://api.lemonsqueezy.com/v1/licenses/validate",
    deactivate: "https://api.lemonsqueezy.com/v1/licenses/deactivate",
  },

  // Matches LS product setting: activation limit = 3, expiry = unlimited.
  activationLimit: 3,
});
