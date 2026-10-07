/**
 * "App mode": the site running inside the VacancyPal Android app (a Trusted Web
 * Activity that opens /?source=twa). Google Play doesn't allow selling credits
 * outside Play billing inside an app, so everything tagged `web-only` (credit
 * packs, prices to buy, top-up links) is hidden there. People top up on the
 * website instead — and the app must not say so.
 *
 * A tiny inline script (below) runs before the page paints, so nothing flashes.
 */

export const APP_COOKIE = "vp_app";

/** Runs in <head> before first paint: remembers app mode and marks <html>. */
export const APP_MODE_SCRIPT = `(function(){try{var q=location.search.indexOf("source=twa")>-1;var r=(document.referrer||"").indexOf("android-app://")===0;if(q||r){document.cookie="${APP_COOKIE}=1;path=/;max-age=31536000;samesite=lax";}if(q||r||document.cookie.indexOf("${APP_COOKIE}=1")>-1){document.documentElement.setAttribute("data-app","android");}}catch(e){}})();`;

/** True when running inside the Android app (client-side only). */
export function isInApp(): boolean {
  return typeof document !== "undefined" && document.documentElement.getAttribute("data-app") === "android";
}
