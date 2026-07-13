// ---------------------------------------------------------------------------
// Minimal, cookie-less analytics event helper.
//
// Works with either Plausible (window.plausible) or Cloudflare Web Analytics.
// Cloudflare only does pageviews, so custom events are best-effort no-ops there.
// If no analytics script is loaded, every call is a silent no-op — safe for dev.
// ---------------------------------------------------------------------------

export function track(event, props) {
  try {
    if (typeof window.plausible === "function") {
      window.plausible(event, props ? { props } : undefined);
    }
    // Cloudflare Web Analytics has no custom-event API; pageview only.
  } catch (_) {
    /* never let analytics break the tool */
  }
}
