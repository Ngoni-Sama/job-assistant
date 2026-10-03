"use client";

import { useSyncExternalStore } from "react";

/**
 * Which side of VacancyPal someone is using right now: looking for work, or hiring.
 * The menu only shows what fits the current mode. Remembered on this device; set
 * by the homepage buttons ("I'm looking for work" / "I'm hiring") and the menu switch.
 */
export type Mode = "seeker" | "employer";

const KEY = "vp:mode";
const listeners = new Set<() => void>();

function read(): Mode | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === "seeker" || v === "employer" ? v : null;
  } catch {
    return null;
  }
}

/** The mode they chose, or null if they've never chosen one on this device. */
export function storedMode(): Mode | null {
  return typeof window === "undefined" ? null : read();
}

export function setMode(mode: Mode): void {
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    /* private mode etc. — still switch for this page view */
  }
  current = mode;
  listeners.forEach((l) => l());
}

let current: Mode | null = null;

function snapshot(): Mode {
  return current ?? read() ?? "seeker";
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      current = null;
      cb();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

/** Current mode ("seeker" on the server and until the browser has loaded). */
export function useMode(): Mode {
  return useSyncExternalStore(subscribe, snapshot, () => "seeker");
}
