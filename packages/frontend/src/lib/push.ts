import { api } from "./api";

export type PushState = "unsupported" | "denied" | "off" | "on";

const ASKED_KEY = "vp_push_asked";
const ASK_AGAIN_MS = 7 * 24 * 60 * 60 * 1000;

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

function keyToBytes(base64url: string): ArrayBuffer {
  const padded = base64url
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(base64url.length / 4) * 4, "=");
  const raw = atob(padded);
  const buffer = new ArrayBuffer(raw.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return buffer;
}

/** The service worker registration (registering it if this page hasn't yet). */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    return (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/sw.js"));
  } catch {
    return null;
  }
}

/** Where this browser stands: can't do push, blocked, not subscribed, subscribed. */
export async function getPushState(): Promise<PushState> {
  if (!pushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  if (Notification.permission !== "granted") return "off";
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    return (await reg?.pushManager.getSubscription()) ? "on" : "off";
  } catch {
    return "off";
  }
}

/**
 * Subscribe this browser to push and register it with the server. Asks for
 * notification permission if needed, so call it from a tap/click.
 */
export async function enablePush(): Promise<PushState> {
  if (!pushSupported()) return "unsupported";
  const permission =
    Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
  if (permission !== "granted") return permission === "denied" ? "denied" : "off";

  await registerServiceWorker();
  const reg = await navigator.serviceWorker.ready;
  const { publicKey } = await api.getPushKey();
  let sub = await reg.pushManager.getSubscription();
  // A subscription made with a different server key can't be used — replace it.
  const currentKey = sub?.options.applicationServerKey;
  if (sub && currentKey && !sameBytes(currentKey, keyToBytes(publicKey))) {
    await sub.unsubscribe().catch(() => {});
    sub = null;
  }
  if (!sub) {
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(publicKey) });
  }
  const json = sub.toJSON();
  await api.pushSubscribe({ endpoint: sub.endpoint, keys: { p256dh: json.keys?.p256dh ?? "", auth: json.keys?.auth ?? "" } });
  return "on";
}

function sameBytes(a: ArrayBuffer, b: ArrayBuffer): boolean {
  const x = new Uint8Array(a);
  const y = new Uint8Array(b);
  return x.length === y.length && x.every((v, i) => v === y[i]);
}

/** Stop push on this browser (other devices stay subscribed). */
export async function disablePush(): Promise<void> {
  if (!pushSupported()) return;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await api.pushUnsubscribe(sub.endpoint).catch(() => {});
  await sub.unsubscribe().catch(() => {});
}

/**
 * Should we offer notifications now? Only when the browser can do push, the
 * user hasn't decided yet, and we haven't asked in the last week.
 */
export function shouldOfferPush(): boolean {
  if (!pushSupported() || Notification.permission !== "default") return false;
  try {
    return Date.now() - Number(localStorage.getItem(ASKED_KEY) ?? 0) > ASK_AGAIN_MS;
  } catch {
    return true;
  }
}

export function rememberPushOffer(): void {
  try {
    localStorage.setItem(ASKED_KEY, String(Date.now()));
  } catch {
    /* storage blocked — fine */
  }
}

/**
 * Ask the app to offer notifications at a moment they obviously help — right
 * after the user sent an application or a message. Never on page load.
 */
export function offerPush(reason: "apply" | "message"): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("vp:offer-push", { detail: reason }));
}
