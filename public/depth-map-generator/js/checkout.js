// checkout.js — open the Lemon Squeezy hosted checkout as an overlay (LS.js).
import { LEMONSQUEEZY } from "./lemonsqueezy.config.js";

let _loaded = null;

function loadLemonJS() {
  if (_loaded) return _loaded;
  _loaded = new Promise((resolve, reject) => {
    if (window.LemonSqueezy) return resolve();
    const s = document.createElement("script");
    s.src = "https://assets.lemonsqueezy.com/lemon.js";
    s.defer = true;
    s.onload = () => {
      try { window.createLemonSqueezy?.(); } catch {}
      resolve();
    };
    s.onerror = () => reject(new Error("Failed to load Lemon Squeezy checkout"));
    document.head.appendChild(s);
  });
  return _loaded;
}

// Open the overlay. onSuccess() fires when LS reports a completed checkout
// (in addition to the post-purchase redirect to ?purchase=success).
export async function openCheckout({ onSuccess } = {}) {
  await loadLemonJS();
  if (window.LemonSqueezy?.Setup) {
    window.LemonSqueezy.Setup({
      eventHandler: (event) => {
        if (event?.event === "Checkout.Success") onSuccess?.(event);
      },
    });
  }
  const url = LEMONSQUEEZY.checkoutUrl + (LEMONSQUEEZY.checkoutUrl.includes("?") ? "&" : "?") + "embed=1";
  if (window.LemonSqueezy?.Url?.Open) {
    window.LemonSqueezy.Url.Open(url);
  } else {
    window.open(url, "_blank", "noopener"); // graceful fallback
  }
}
