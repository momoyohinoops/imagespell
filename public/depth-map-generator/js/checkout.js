// checkout.js — send the buyer to the Polar hosted checkout.
//
// Polar's checkout is a plain link, so this is just a same-tab navigation —
// no SDK to load, no overlay event to listen for. Works uniformly for both
// checkout URL shapes Polar uses: the short `https://buy.polar.sh/<id>` form
// and the `/v1/checkout-links/<id>/redirect` API-redirect form — both are
// just URLs a browser GET/redirect-follows.
//
// Success is detected after the browser lands back on this page with
// `?purchase=success` (configured on the Polar checkout link's confirmation
// URL) — see isPurchaseSuccessReturn()/clearPurchaseMarker() in license.js.
import { getPolarConfig } from "./polar.config.js";

// `onSuccess` is accepted for call-site compatibility with the previous
// in-page-overlay contract, but it will NOT fire here: navigating to
// Polar's checkout leaves this page entirely, so there is no in-page success
// event. The actual "welcome back, paste your key" moment is handled by the
// ?purchase=success return-URL check in main.js's boot(), independent of
// this function.
export async function openCheckout({ onSuccess } = {}) {
  const cfg = await getPolarConfig();
  window.location.href = cfg.checkoutUrl;
}
