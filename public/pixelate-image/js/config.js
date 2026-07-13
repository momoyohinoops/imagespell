// ---------------------------------------------------------------------------
// Site configuration.
//
// Only `name` is read at runtime today (app.js reflects it into [data-site-name]).
// canonical / og:url / og:image are hard-coded in index.html's <head> so the
// crawler sees them without running JS. The fields below are therefore RESERVED,
// not live: they document the intended single source of truth for when a build
// step (or JS-injected meta) is introduced. Until then, if you change a URL/OGP
// value you must also edit index.html — these constants won't do it for you.
// ---------------------------------------------------------------------------
export const SITE = {
  name: "ImageSpell", // live — reflected into [data-site-name]

  // ── Reserved (not currently read; mirror index.html <head> if you build one) ──
  // Public URL of the deployed site (used for OGP / canonical). No trailing slash.
  url: "https://imagespell.com",
  // Path of the pixelate tool under the umbrella site.
  pixelatePath: "/pixelate-image",
  // OGP share image (relative to site root).
  ogImage: "/og-image.png",
  // Twitter/X handle for the card (optional, include the @).
  twitter: "",
};

// ---------------------------------------------------------------------------
// Analytics — cookie-less. Fill in the real ID/domain, then uncomment the
// matching snippet in index.html. Left as placeholders on purpose for v1.
// ---------------------------------------------------------------------------
export const ANALYTICS = {
  // Cloudflare Web Analytics token, e.g. "abcdef1234567890".
  cloudflareToken: "REPLACE_WITH_CF_TOKEN",
  // Or Plausible domain, e.g. "pixelate-tool.pages.dev".
  plausibleDomain: "REPLACE_WITH_PLAUSIBLE_DOMAIN",
};
