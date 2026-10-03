"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, BellRing, Loader2, Moon, Volume2 } from "lucide-react";
import { api } from "@/lib/api";
import type { NotifyPrefs, NotifyType, Prefs } from "@/lib/types";
import { disablePush, enablePush, getPushState, type PushState } from "@/lib/push";
import { playMessageSound } from "@/lib/sound";
import { useLive } from "./LiveUpdates";

const TYPES: { type: NotifyType; title: string; body: string }[] = [
  { type: "jobs", title: "New jobs for me", body: "When new jobs match your main profession, roles or sectors" },
  { type: "message", title: "Messages", body: "When an employer or candidate messages you" },
  { type: "interest", title: "Employer interest", body: "When an employer shortlists you or unlocks your contact" },
  { type: "autoApply", title: "Auto-apply updates", body: "When auto-apply sends applications or needs attention" },
  { type: "credits", title: "Credit top-ups", body: "When a payment goes through and credits are added" },
];

/**
 * Notification settings: turn push on for this device, choose which events
 * notify, the sound switch, and quiet hours. Every change saves immediately.
 */
export function NotificationSettings({
  prefs,
  savePrefs,
}: {
  prefs: Prefs;
  savePrefs: (next: Partial<Prefs>) => Promise<void> | void;
}) {
  const { setSoundOn } = useLive();
  const [push, setPush] = useState<PushState | "loading">("loading");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const notify = prefs.notify ?? {};
  const quiet = !!(notify.quietStart && notify.quietEnd);

  useEffect(() => {
    void getPushState().then(setPush);
  }, []);

  const save = (patch: NotifyPrefs) => savePrefs({ notify: { ...notify, ...patch } });

  async function togglePush() {
    setBusy(true);
    setNote(null);
    try {
      if (push === "on") {
        await disablePush();
        setPush("off");
        setNote({ ok: true, text: "Notifications are off on this device." });
      } else {
        const state = await enablePush();
        setPush(state);
        if (state === "on") setNote({ ok: true, text: "Notifications are on for this device." });
        else if (state === "denied") {
          setNote({ ok: false, text: "Notifications are blocked. Allow them for VacancyPal in your browser or phone settings, then try again." });
        }
      }
    } catch (e) {
      setNote({ ok: false, text: (e as Error).message || "Could not change notifications on this device." });
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    setBusy(true);
    setNote(null);
    try {
      const { sent } = await api.pushTest();
      setNote(sent ? { ok: true, text: "Test notification sent." } : { ok: false, text: "No device is subscribed yet." });
    } catch (e) {
      setNote({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="notifications" className="scroll-mt-24 space-y-4 rounded-lg border bg-white p-6">
      <h2 className="flex items-center gap-2 font-semibold">
        <Bell className="h-4 w-4 text-brand-600" /> Notifications
      </h2>

      {/* This device */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-gray-50/60 p-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            {push === "on" ? "On for this device" : "Push notifications on this device"}
          </p>
          <p className="text-xs text-gray-500">
            {push === "unsupported"
              ? "This browser can't receive push notifications. On iPhone, add VacancyPal to your Home Screen first."
              : push === "denied"
                ? "Blocked — allow notifications for VacancyPal in your browser or phone settings."
                : "Hear about new jobs and employer messages even when VacancyPal is closed."}
          </p>
        </div>
        {push === "loading" ? (
          <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
        ) : push === "unsupported" || push === "denied" ? (
          <BellOff className="h-5 w-5 text-gray-400" />
        ) : (
          <div className="flex items-center gap-2">
            {push === "on" && (
              <button onClick={sendTest} disabled={busy} className="rounded-full border px-3 py-1.5 text-xs text-gray-700 hover:bg-white disabled:opacity-50">
                Send test
              </button>
            )}
            <button
              onClick={togglePush}
              disabled={busy}
              className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium disabled:opacity-50 ${
                push === "on" ? "border text-gray-700 hover:bg-white" : "bg-brand-600 text-white hover:bg-brand-700"
              }`}
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BellRing className="h-3.5 w-3.5" />}
              {push === "on" ? "Turn off" : "Turn on"}
            </button>
          </div>
        )}
      </div>
      {note && <p className={`text-xs ${note.ok ? "text-green-700" : "text-red-600"}`}>{note.text}</p>}

      {/* What to notify about */}
      <div className="divide-y">
        {TYPES.map((t) => (
          <Switch
            key={t.type}
            title={t.title}
            body={t.body}
            checked={notify[t.type] !== false}
            onChange={(on) => save({ [t.type]: on })}
          />
        ))}
      </div>

      {/* Sound + quiet hours */}
      <div className="space-y-1 border-t pt-3">
        <Switch
          icon={<Volume2 className="h-4 w-4 text-gray-400" />}
          title="Sound"
          body="A chime for alerts while the app is open, and your device's notification sound when it's closed."
          checked={notify.sound !== false}
          onChange={(on) => {
            setSoundOn(on);
            if (on) playMessageSound();
            void save({ sound: on });
          }}
        />
        <Switch
          icon={<Moon className="h-4 w-4 text-gray-400" />}
          title="Quiet hours"
          body="Notifications still arrive, but without sound or vibration."
          checked={quiet}
          onChange={(on) => save(on ? { quietStart: "21:00", quietEnd: "06:00" } : { quietStart: null, quietEnd: null })}
        />
        {quiet && (
          <div className="flex items-center gap-2 pl-6 text-sm text-gray-600">
            <input
              type="time"
              value={notify.quietStart ?? "21:00"}
              onChange={(e) => e.target.value && save({ quietStart: e.target.value })}
              aria-label="Quiet hours start"
              className="rounded-md border px-2 py-1 text-sm"
            />
            <span>to</span>
            <input
              type="time"
              value={notify.quietEnd ?? "06:00"}
              onChange={(e) => e.target.value && save({ quietEnd: e.target.value })}
              aria-label="Quiet hours end"
              className="rounded-md border px-2 py-1 text-sm"
            />
          </div>
        )}
      </div>
    </section>
  );
}

function Switch({
  title,
  body,
  checked,
  onChange,
  icon,
}: {
  title: string;
  body: string;
  checked: boolean;
  onChange: (on: boolean) => void;
  icon?: React.ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 py-2.5">
      <span className="flex min-w-0 items-start gap-2">
        {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
        <span className="min-w-0">
          <span className="block text-sm font-medium text-gray-800">{title}</span>
          <span className="block text-xs text-gray-500">{body}</span>
        </span>
      </span>
      <span className="relative inline-flex shrink-0 items-center">
        <input
          type="checkbox"
          role="switch"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="peer sr-only"
        />
        <span className="h-6 w-11 rounded-full bg-gray-300 transition peer-checked:bg-brand-600 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500/40" />
        <span className="absolute left-0.5 h-5 w-5 rounded-full bg-white shadow transition peer-checked:translate-x-5" />
      </span>
    </label>
  );
}
