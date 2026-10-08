/**
 * "Install VacancyPal" (add the website to the home screen as an app).
 *
 * Chrome/Edge fire `beforeinstallprompt` once the site is installable — often
 * before React has hydrated — so a tiny inline script in <head> catches it and
 * keeps it on `window` for <InstallPrompt>. Safari on iPhone has no such event;
 * there we show the Share → Add to Home Screen steps instead.
 */

/** Chrome's install event (not in the TS DOM lib yet). */
export type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

declare global {
  interface Window {
    __vpInstall?: InstallEvent | null;
  }
}

export const INSTALLED_KEY = "vp_installed";
export const SNOOZE_KEY = "vp_install_snooze";
export const SNOOZE_MS = 14 * 24 * 60 * 60 * 1000;

/** Runs in <head>: holds on to the install event until the prompt is ready to show it. */
export const INSTALL_CAPTURE_SCRIPT = `(function(){try{window.addEventListener("beforeinstallprompt",function(e){e.preventDefault();window.__vpInstall=e;window.dispatchEvent(new Event("vp:installable"));});window.addEventListener("appinstalled",function(){window.__vpInstall=null;try{localStorage.setItem("${INSTALLED_KEY}","1")}catch(e){}});}catch(e){}})();`;

/** Already running as an installed app (home-screen app, or iOS standalone). */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    window.matchMedia?.("(display-mode: window-controls-overlay)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** iPhone/iPad Safari — the only browser there that can add to the home screen properly. */
export function isIosSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
  return ios && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
}
