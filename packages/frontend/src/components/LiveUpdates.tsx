"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { Bell, Briefcase, X } from "lucide-react";
import { api } from "@/lib/api";
import { enablePush, pushSupported, registerServiceWorker, rememberPushOffer, shouldOfferPush } from "@/lib/push";
import { playMessageSound } from "@/lib/sound";
import { InstallPrompt } from "@/components/InstallPrompt";

/** What the service worker forwards from a push notification. */
export type PushData = {
  type?: string;
  title?: string;
  body?: string;
  url?: string;
  tag?: string;
  silent?: boolean;
  badge?: number;
};

type Live = {
  /** Unread messages across all conversations. */
  unread: number;
  refresh: () => void;
  soundOn: boolean;
  setSoundOn: (on: boolean) => void;
};

const Ctx = createContext<Live>({ unread: 0, refresh: () => {}, soundOn: true, setSoundOn: () => {} });

export function useLive(): Live {
  return useContext(Ctx);
}

const PROFESSION_PROMPTED = "vp_profession_prompted";

/**
 * App-wide live layer for signed-in users: keeps the unread-messages count
 * fresh (nav badge + app icon badge), reacts to push notifications while the
 * app is open (sound + in-app alert), and shows two gentle prompts — one
 * offering notifications after an application or message is sent, and a
 * one-time "what's your main profession?" for existing candidates.
 */
export function LiveUpdates({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
  const authed = status === "authenticated";
  const pathname = usePathname();
  const [unread, setUnread] = useState(0);
  const [soundOn, setSoundOn] = useState(true);
  const [alert, setAlert] = useState<PushData | null>(null);
  const [offer, setOffer] = useState<"apply" | "message" | null>(null);
  const [askProfession, setAskProfession] = useState(false);
  const [profession, setProfession] = useState("");
  const [busy, setBusy] = useState(false);
  const soundRef = useRef(soundOn);
  soundRef.current = soundOn;

  const refresh = useCallback(() => {
    if (!authed) return;
    api
      .getUnread()
      .then((r) => setUnread(r.messages))
      .catch(() => {});
  }, [authed]);

  // On sign-in: settings, service worker, and (if already allowed) make sure
  // this device is registered to the signed-in account.
  useEffect(() => {
    if (!authed) {
      setUnread(0);
      return;
    }
    api
      .getPrefs()
      .then((r) => setSoundOn(r.prefs.notify?.sound !== false))
      .catch(() => {});
    void registerServiceWorker();
    if (pushSupported() && Notification.permission === "granted") void enablePush().catch(() => {});

    // Candidates who set up before "main profession" existed get asked once.
    let prompted = true;
    try {
      prompted = localStorage.getItem(PROFESSION_PROMPTED) === "1";
    } catch {
      /* storage blocked — don't prompt */
    }
    if (!prompted) {
      api
        .getProfile()
        .then(({ profile }) => {
          const active = profile.availability !== "not_looking" || !!profile.headline || !!profile.sector;
          if (active && !profile.mainProfession) setAskProfession(true);
        })
        .catch(() => {});
    }
  }, [authed]);

  // Keep the count fresh: on navigation, when the tab comes back, every 2 minutes.
  useEffect(() => {
    refresh();
  }, [refresh, pathname]);
  useEffect(() => {
    if (!authed) return;
    const onVisible = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVisible);
    const timer = window.setInterval(onVisible, 120_000);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(timer);
    };
  }, [authed, refresh]);

  // A push arrived while the app is open: update, tell the page, alert in-app.
  useEffect(() => {
    if (!authed || typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const onMessage = (e: MessageEvent) => {
      const msg = e.data as { type?: string; data?: PushData } | null;
      if (msg?.type !== "push" || !msg.data) return;
      const data = msg.data;
      if (typeof data.badge === "number") setUnread(data.badge);
      else refresh();
      window.dispatchEvent(new CustomEvent<PushData>("vp:push", { detail: data }));
      if (document.visibilityState !== "visible" || data.type === "test") return;
      if (soundRef.current && !data.silent) playMessageSound();
      setAlert(data);
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [authed, refresh]);

  // In-app alert hides itself.
  useEffect(() => {
    if (!alert) return;
    const t = window.setTimeout(() => setAlert(null), 8000);
    return () => window.clearTimeout(t);
  }, [alert]);

  // Offer notifications after the user sent an application or a message.
  useEffect(() => {
    const onOffer = (e: Event) => {
      if (!authed || !shouldOfferPush()) return;
      rememberPushOffer();
      setOffer((e as CustomEvent<"apply" | "message">).detail ?? "apply");
    };
    window.addEventListener("vp:offer-push", onOffer);
    return () => window.removeEventListener("vp:offer-push", onOffer);
  }, [authed]);

  // Unread count on the installed app's icon.
  useEffect(() => {
    if (typeof navigator === "undefined" || !("setAppBadge" in navigator)) return;
    const nav = navigator as Navigator & {
      setAppBadge: (n?: number) => Promise<void>;
      clearAppBadge: () => Promise<void>;
    };
    void (unread > 0 ? nav.setAppBadge(unread) : nav.clearAppBadge()).catch(() => {});
  }, [unread]);

  async function turnOnPush() {
    setBusy(true);
    try {
      await enablePush();
    } catch {
      /* they can retry from Settings */
    } finally {
      setBusy(false);
      setOffer(null);
    }
  }

  function closeProfession() {
    try {
      localStorage.setItem(PROFESSION_PROMPTED, "1");
    } catch {
      /* fine */
    }
    setAskProfession(false);
  }

  async function saveProfession() {
    const value = profession.trim();
    if (!value) return;
    setBusy(true);
    try {
      await api.saveProfile({ mainProfession: value });
      closeProfession();
    } catch {
      /* keep the prompt open so they can retry */
    } finally {
      setBusy(false);
    }
  }

  const value = useMemo<Live>(() => ({ unread, refresh, soundOn, setSoundOn }), [unread, refresh, soundOn]);
  // The alert for a chat the user is already looking at would be noise.
  const showAlert = alert && !(alert.type === "message" && pathname === "/messages");

  return (
    <Ctx.Provider value={value}>
      {children}

      {showAlert && (
        <div
          role="status"
          className="popover fixed left-3 right-3 top-20 z-40 flex items-start gap-3 rounded-2xl p-3 shadow-xl sm:left-auto sm:right-4 sm:w-80"
        >
          <Bell className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-gray-900">{alert.title}</p>
            {alert.body && <p className="line-clamp-2 break-words text-xs text-gray-600">{alert.body}</p>}
            {alert.url && (
              <Link
                href={alert.url}
                onClick={() => setAlert(null)}
                className="mt-1 inline-block text-xs font-medium text-brand-700 underline"
              >
                Open
              </Link>
            )}
          </div>
          <button onClick={() => setAlert(null)} aria-label="Dismiss" className="rounded-full p-1 text-gray-400 hover:bg-white/60">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {offer && (
        <div className="popover fixed bottom-20 left-3 right-3 z-40 md:bottom-4 rounded-2xl p-4 sm:left-auto sm:right-4 sm:w-96">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-800 text-white">
              <Bell className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-gray-900">
                {offer === "message" ? "Get notified when they reply?" : "Get notified about new jobs and replies?"}
              </p>
              <p className="mt-0.5 text-xs text-gray-600">
                We&apos;ll alert you about employer messages and new jobs in your field — even when VacancyPal is
                closed. Change it any time in Settings.
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={turnOnPush}
                  disabled={busy}
                  className="rounded-full bg-gradient-to-r from-brand-500 to-brand-800 px-4 py-1.5 text-xs font-medium text-white disabled:opacity-60"
                >
                  {busy ? "Turning on…" : "Turn on"}
                </button>
                <button onClick={() => setOffer(null)} className="rounded-full px-3 py-1.5 text-xs text-gray-600 hover:bg-white/60">
                  Not now
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {askProfession && !offer && (
        <div className="popover fixed bottom-20 left-3 right-3 z-40 md:bottom-4 rounded-2xl p-4 sm:left-auto sm:right-4 sm:w-96">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-800 text-white">
              <Briefcase className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-gray-900">What&apos;s your main profession?</p>
              <p className="mt-0.5 text-xs text-gray-600">
                Employers see it on your profile, and you hear about matching jobs first.
              </p>
              <input
                value={profession}
                onChange={(e) => setProfession(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && saveProfession()}
                maxLength={60}
                placeholder="e.g. Registered Nurse"
                aria-label="Main profession"
                className="mt-2 w-full rounded-md border px-3 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
              />
              <div className="mt-3 flex gap-2">
                <button
                  onClick={saveProfession}
                  disabled={busy || !profession.trim()}
                  className="rounded-full bg-gradient-to-r from-brand-500 to-brand-800 px-4 py-1.5 text-xs font-medium text-white disabled:opacity-60"
                >
                  Save
                </button>
                <button onClick={closeProfession} className="rounded-full px-3 py-1.5 text-xs text-gray-600 hover:bg-white/60">
                  Later
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <InstallPrompt blocked={!!offer || askProfession} />
    </Ctx.Provider>
  );
}
