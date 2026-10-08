"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Download, Share, X } from "lucide-react";
import { isInApp } from "@/lib/inApp";
import { registerServiceWorker } from "@/lib/push";
import {
  INSTALLED_KEY,
  SNOOZE_KEY,
  SNOOZE_MS,
  isIosSafari,
  isStandalone,
  type InstallEvent,
} from "@/lib/install";

/** Let people settle in before asking. */
const SHOW_AFTER_MS = 12_000;

function readFlag(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeFlag(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode — the prompt just comes back next visit */
  }
}

/**
 * Bottom card offering to install VacancyPal as an app. Uses the browser's own
 * install dialog where there is one (Android, desktop Chrome/Edge), and shows
 * the Add to Home Screen steps on iPhone. Never shown inside the Play Store app,
 * once installed, on admin pages, or for 14 days after "Not now".
 *
 * `blocked` keeps it out of the way while another bottom prompt is open.
 */
export function InstallPrompt({ blocked = false }: { blocked?: boolean }) {
  const pathname = usePathname();
  const [mode, setMode] = useState<"prompt" | "ios" | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (isInApp() || isStandalone() || readFlag(INSTALLED_KEY)) return;
    const snoozed = Number(readFlag(SNOOZE_KEY) || 0);
    if (snoozed && Date.now() - snoozed < SNOOZE_MS) return;

    // Older Chrome versions only treat the site as installable with a service worker.
    void registerServiceWorker();

    const pick = () => {
      if (window.__vpInstall) setMode("prompt");
      else if (isIosSafari()) setMode("ios");
    };
    pick();
    window.addEventListener("vp:installable", pick);
    const onInstalled = () => setMode(null);
    window.addEventListener("appinstalled", onInstalled);
    const t = window.setTimeout(() => setReady(true), SHOW_AFTER_MS);
    return () => {
      window.removeEventListener("vp:installable", pick);
      window.removeEventListener("appinstalled", onInstalled);
      window.clearTimeout(t);
    };
  }, []);

  if (!mode || !ready || blocked || pathname?.startsWith("/admin")) return null;

  function snooze() {
    writeFlag(SNOOZE_KEY, String(Date.now()));
    setMode(null);
  }

  async function install() {
    const evt = window.__vpInstall as InstallEvent | null | undefined;
    if (!evt) return setMode(null);
    window.__vpInstall = null; // the event can only be used once
    await evt.prompt();
    const { outcome } = await evt.userChoice;
    if (outcome === "accepted") writeFlag(INSTALLED_KEY, "1");
    else writeFlag(SNOOZE_KEY, String(Date.now()));
    setMode(null);
  }

  return (
    <div
      role="dialog"
      aria-label="Install VacancyPal"
      className="popover fixed bottom-20 left-3 right-3 z-40 md:bottom-4 rounded-2xl p-4 sm:left-auto sm:right-4 sm:w-96"
    >
      <div className="flex items-start gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/icon-192.png" alt="" width={40} height={40} className="h-10 w-10 shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900">Install VacancyPal</p>
          {mode === "prompt" ? (
            <p className="mt-0.5 text-xs text-gray-600">
              Add it to your home screen for one-tap access to your job matches and alerts. It opens full screen,
              like an app.
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-gray-600">
              Tap <Share className="inline h-3.5 w-3.5 -translate-y-px text-brand-700" aria-label="Share" /> at the
              bottom of Safari, then <b>Add to Home Screen</b>. You&apos;ll get job alerts on your iPhone too.
            </p>
          )}
          <div className="mt-3 flex gap-2">
            {mode === "prompt" && (
              <button
                onClick={install}
                className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-brand-500 to-brand-800 px-4 py-1.5 text-xs font-medium text-white"
              >
                <Download className="h-3.5 w-3.5" /> Install
              </button>
            )}
            <button onClick={snooze} className="rounded-full px-3 py-1.5 text-xs text-gray-600 hover:bg-white/60">
              {mode === "prompt" ? "Not now" : "Got it"}
            </button>
          </div>
        </div>
        <button onClick={snooze} aria-label="Dismiss" className="rounded-full p-1 text-gray-400 hover:bg-white/60">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
