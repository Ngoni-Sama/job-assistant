"use client";

import { useEffect, useRef, useState } from "react";
import { useSession, signIn } from "next-auth/react";
import { MessageSquare, Send, ChevronLeft, Lock } from "lucide-react";
import { api } from "@/lib/api";
import type { Thread, ThreadSummary } from "@/lib/types";

export default function MessagesPage() {
  const { data: session, status } = useSession();
  const authed = status === "authenticated";
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [openThread, setOpenThread] = useState<Thread | null>(null);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const myEmail = session?.user?.email ?? "";
  const myRole = openThread
    ? openThread.employerUserId.toLowerCase() === myEmail.toLowerCase()
      ? "employer"
      : "candidate"
    : null;

  useEffect(() => {
    if (status === "loading") return;
    if (!authed) {
      setLoading(false);
      return;
    }
    api
      .getThreads()
      .then((r) => setThreads(r.threads))
      .finally(() => setLoading(false));
  }, [status, authed]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [openThread?.messages.length]);

  async function open(id: string) {
    const { thread } = await api.getThread(id);
    setOpenThread(thread);
  }

  async function send() {
    if (!openThread || !text.trim()) return;
    setSending(true);
    try {
      const { thread } = await api.replyThread(openThread.id, text.trim());
      setOpenThread(thread);
      setText("");
    } finally {
      setSending(false);
    }
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

  if (openThread) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <button onClick={() => setOpenThread(null)} className="flex items-center gap-1 text-sm text-gray-600 hover:text-brand-700">
          <ChevronLeft className="h-4 w-4" /> Inbox
        </button>
        <h1 className="text-xl font-bold">
          {myRole === "employer" ? openThread.candidateName : openThread.employerCompany}
        </h1>
        <div className="glass max-h-[60vh] space-y-2 overflow-y-auto rounded-2xl p-4">
          {openThread.messages.map((m, i) => {
            const mine = m.from === myRole;
            return (
              <div key={i} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${
                    mine ? "bg-gradient-to-r from-brand-600 to-violet-600 text-white" : "bg-white text-gray-700"
                  }`}
                >
                  {m.text}
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
        <div className="flex gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder="Type a message…"
            className="flex-1 rounded-full border px-4 py-2 text-sm focus:border-brand-500 focus:outline-none"
          />
          <button
            onClick={send}
            disabled={sending || !text.trim()}
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
      {threads.length === 0 ? (
        <div className="glass rounded-2xl p-8 text-center text-gray-500">
          No conversations yet.
        </div>
      ) : (
        <div className="space-y-2">
          {threads.map((t) => (
            <button
              key={t.id}
              onClick={() => open(t.id)}
              className="glass flex w-full items-center justify-between gap-3 rounded-2xl p-4 text-left hover:shadow-md"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {t.withName}
                  {t.unreadFrom && <span className="ml-2 inline-block h-2 w-2 rounded-full bg-brand-600" />}
                </p>
                <p className="truncate text-sm text-gray-500">{t.lastMessage}</p>
              </div>
              <span className="shrink-0 text-xs text-gray-400">
                {new Date(t.updatedAt).toLocaleDateString()}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
