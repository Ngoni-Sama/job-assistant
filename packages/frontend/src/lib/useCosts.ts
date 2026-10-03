"use client";

import { useEffect, useState } from "react";
import { api } from "./api";
import type { ActionCosts } from "./types";

/** Shown until the live prices load (same as the server defaults). */
const FALLBACK: ActionCosts = { quickMatch: 10, optimise: 3, matchAll: 5, unlockContact: 20, atsCv: 40, cvQuestions: 0 };

let cached: ActionCosts | null = null;
let pending: Promise<ActionCosts> | null = null;

/** Current credit prices (set by the admin), fetched once per page load. */
export function useCosts(): ActionCosts {
  const [costs, setCosts] = useState<ActionCosts>(cached ?? FALLBACK);
  useEffect(() => {
    if (cached) return;
    pending ??= api
      .getCredits()
      .then((r) => (cached = { ...FALLBACK, ...(r.costs as Partial<ActionCosts>) }))
      .catch(() => FALLBACK);
    let alive = true;
    void pending.then((c) => alive && setCosts(c));
    return () => {
      alive = false;
    };
  }, []);
  return costs;
}
