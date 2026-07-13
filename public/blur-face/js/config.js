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
  url: "https://imagespell.com",
  blurFacePath: "/blur-face",
  ogImage: "/og-image.png",
  twitter: "",
};

// ---------------------------------------------------------------------------
// Analytics — cookie-less. Same placeholders as the other tools; the real
// token lives in whichever snippet is uncommented in index.html.
// ---------------------------------------------------------------------------
export const ANALYTICS = {
  cloudflareToken: "REPLACE_WITH_CF_TOKEN",
  plausibleDomain: "REPLACE_WITH_PLAUSIBLE_DOMAIN",
};
