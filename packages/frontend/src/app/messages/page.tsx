"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession, signIn } from "next-auth/react";
import { MessageSquare, Send, ChevronLeft, Lock, Check, CheckCheck } from "lucide-react";
import { api } from "@/lib/api";
import type { Thread, ThreadSummary } from "@/lib/types";
import { useLive, type PushData } from "@/components/LiveUpdates";
import { offerPush } from "@/lib/push";
import { playMessageSound } from "@/lib/sound";

/** One-tap replies, by side of the conversation. */
const QUICK_REPLIES = {
  candidate: ["I'm available for an interview", "What is the salary range?", "Please send the job description"],
  employer: ["Are you available for an interview?", "When could you start?", "Please send your latest CV"],
} as const;

/** How often an open conversation checks for new messages. */
const POLL_MS = 15_000;

function when(iso: string): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return d.toDateString() === new Date().toDateString()
    ? time
    : `${d.toLocaleDateString([], { day: "numeric", month: "short" })}, ${time}`;
}

export default function MessagesPage() {
  const { data: session, status } = useSession();
  const authed = status === "authenticated";
  const { refresh: refreshUnread, soundOn } = useLive();
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [openThread, setOpenThread] = useState<Thread | null>(null);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const openRef = useRef<Thread | null>(null);
  openRef.current = openThread;
  const soundRef = useRef(soundOn);
  soundRef.current = soundOn;

  const myEmail = session?.user?.email ?? "";
  const myRole = openThread
    ? openThread.employerUserId.toLowerCase() === myEmail.toLowerCase()
      ? "employer"
      : "candidate"
    : null;
  const otherRole = myRole === "employer" ? "candidate" : "employer";

  const loadThreads = useCallback(() => {
    return api
      .getThreads()
      .then((r) => setThreads(r.threads))
      .catch(() => {});
  }, []);

  /** Load (or reload) a conversation. Opening it marks it read on the server. */
  const open = useCallback(
    async (id: string, quiet = false) => {
      try {
        const { thread } = await api.getThread(id);
        const before = openRef.current;
        // A new message from the other side arrived while this chat was open.
        if (
          quiet &&
          before?.id === thread.id &&
          thread.messages.length > before.messages.length &&
          thread.messages[thread.messages.length - 1].from !==
            (thread.employerUserId.toLowerCase() === myEmail.toLowerCase() ? "employer" : "candidate") &&
          soundRef.current
        ) {
          playMessageSound();
        }
        setOpenThread(thread);
        refreshUnread();
      } catch (e) {
        if (!quiet) setError((e as Error).message);
      }
    },
    [myEmail, refreshUnread],
  );

  useEffect(() => {
    if (status === "loading") return;
    if (!authed) {
      setLoading(false);
      return;
    }
    // A notification opens its conversation directly (/messages?t=<id>).
    const linked = new URLSearchParams(window.location.search).get("t");
    void loadThreads().finally(() => setLoading(false));
    if (linked) void open(linked);
  }, [status, authed, loadThreads, open]);

  // Live updates: a push refreshes straight away; otherwise an open
  // conversation checks every few seconds while the tab is visible.
  useEffect(() => {
    if (!authed) return;
    const onPush = (e: Event) => {
      const data = (e as CustomEvent<PushData>).detail;
      if (data?.type !== "message") return;
      const current = openRef.current;
      if (current) void open(current.id, true);
      else void loadThreads();
    };
    window.addEventListener("vp:push", onPush);
    const timer = window.setInterval(() => {
      const current = openRef.current;
      if (current && document.visibilityState === "visible") void open(current.id, true);
    }, POLL_MS);
    return () => {
      window.removeEventListener("vp:push", onPush);
      window.clearInterval(timer);
    };
  }, [authed, loadThreads, open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [openThread?.messages.length]);

  async function send(message = text) {
    const body = message.trim();
    if (!openThread || !body || sending) return;
    setSending(true);
    setError("");
    try {
      const { thread } = await api.replyThread(openThread.id, body);
      setOpenThread(thread);
      if (message === text) setText("");
      // A good moment to offer notifications: they'll want to know about the reply.
      offerPush("message");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  }

  function back() {
    setOpenThread(null);
    setError("");
    void loadThreads();
    refreshUnread();
    // Drop ?t= so a refresh shows the inbox.
    window.history.replaceState(null, "", "/messages");
  }

  if (!authed && status !== "loading") {
    return (
      <div className="glass mx-auto max-w-md rounded-2xl p-8 text-center">
        <Lock className="mx-auto h-8 w-8 text-brand-600" />
        <p className="mt-2 text-gray-600">Sign in to view your messages.</p>
        <button onClick={() => signIn("google")} className="mt-3 rounded-full bg-brand-600 px-4 py-2 text-sm text-white">
          Sign in
        </button>
      </div>
    );
  }

  if (loading) return <p className="text-gray-500">Loading…</p>;

  if (openThread && myRole) {
    const seenAt = openThread.readAt?.[otherRole];
    // Index of my last message the other person has opened the chat after.
    let lastSeen = -1;
    openThread.messages.forEach((m, i) => {
      if (m.from === myRole && seenAt && seenAt >= m.at) lastSeen = i;
    });
    const lastMine = openThread.messages.map((m) => m.from).lastIndexOf(myRole);

    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <button onClick={back} className="flex items-center gap-1 text-sm text-gray-600 hover:text-brand-700">
          <ChevronLeft className="h-4 w-4" /> Inbox
        </button>
        <h1 className="text-xl font-bold">
          {myRole === "employer" ? openThread.candidateName : openThread.employerCompany}
        </h1>
        <div className="glass max-h-[60vh] space-y-2 overflow-y-auto rounded-2xl p-4">
          {openThread.messages.map((m, i) => {
            const mine = m.from === myRole;
            return (
              <div key={i} className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
                <div
                  className={`max-w-[80%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm ${
                    mine ? "bg-gradient-to-r from-brand-600 to-violet-600 text-white" : "bg-white text-gray-700"
                  }`}
                >
                  {m.text}
                </div>
                <span className="mt-0.5 flex items-center gap-1 px-1 text-[11px] text-gray-400">
                  {when(m.at)}
                  {mine && i === lastSeen && (
                    <span className="flex items-center gap-0.5 text-brand-600">
                      <CheckCheck className="h-3.5 w-3.5" /> Seen
                    </span>
                  )}
                  {mine && i === lastMine && i !== lastSeen && (
                    <span className="flex items-center gap-0.5" title="Sent">
                      <Check className="h-3.5 w-3.5" /> Sent
                    </span>
                  )}
                </span>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        {/* One-tap replies */}
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none]">
          {QUICK_REPLIES[myRole].map((q) => (
            <button
              key={q}
              onClick={() => send(q)}
              disabled={sending}
              className="shrink-0 rounded-full border border-brand-200 bg-white/70 px-3 py-1.5 text-xs text-brand-700 hover:bg-brand-50 disabled:opacity-50"
            >
              {q}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder="Type a message…"
            maxLength={2000}
            className="min-w-0 flex-1 rounded-full border px-4 py-2 text-sm focus:border-brand-500 focus:outline-none"
          />
          <button
            onClick={() => send()}
            disabled={sending || !text.trim()}
            aria-label="Send"
            className="flex items-center gap-1 rounded-full bg-gradient-to-r from-brand-600 to-violet-600 px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="flex items-center gap-2 text-2xl font-bold">
        <MessageSquare className="h-6 w-6 text-brand-600" /> Messages
      </h1>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {threads.length === 0 ? (
        <div className="glass rounded-2xl p-8 text-center text-gray-500">
          No conversations yet.
        </div>
      ) : (
        <div className="space-y-2">
          {threads.map((t) => {
            const unread = t.unread ?? 0;
            return (
              <button
                key={t.id}
                onClick={() => open(t.id)}
                className="glass flex w-full items-center justify-between gap-3 rounded-2xl p-4 text-left hover:shadow-md"
              >
                <div className="min-w-0">
                  <p className={`truncate ${unread ? "font-bold" : "font-medium"}`}>{t.withName}</p>
                  <p className={`truncate text-sm ${unread ? "text-gray-800" : "text-gray-500"}`}>{t.lastMessage}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="text-xs text-gray-400">{new Date(t.updatedAt).toLocaleDateString()}</span>
                  {unread > 0 && (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-600 px-1.5 text-[11px] font-bold text-white">
                      {unread > 9 ? "9+" : unread}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
