// ---------------------------------------------------------------------------
// Site configuration — change these in ONE place when the domain is decided.
// ---------------------------------------------------------------------------
export const SITE = {
  name: "PixelTools",
  // Public URL of the deployed site (used for OGP / canonical). No trailing slash.
  url: "https://pixelate-tool.pages.dev",
  // OGP share image (relative to site root). Provide a real 1200x630 later.
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
