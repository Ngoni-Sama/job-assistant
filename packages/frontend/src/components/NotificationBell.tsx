"use client";

import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { api } from "@/lib/api";
import type { Announcement } from "@/lib/types";

export function NotificationBell() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    api
      .getAnnouncements()
      .then((r) => {
        setItems(r.announcements);
        setUnread(r.unread);
      })
      .catch(() => {});
  }, []);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && unread > 0) {
      setUnread(0);
      api.markAnnouncementsSeen().catch(() => {});
    }
  }

  return (
    <div className="relative">
      <button onClick={toggle} className="relative rounded-full p-2 text-gray-600 hover:bg-white/50" aria-label="Updates">
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unread}
          </span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="glass-strong absolute right-0 z-20 mt-2 max-h-96 w-80 overflow-y-auto rounded-2xl p-2 shadow-xl">
            <p className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-gray-400">What’s new</p>
            {items.length === 0 ? (
              <p className="px-2 py-3 text-sm text-gray-500">No updates yet.</p>
            ) : (
              items.map((a) => (
                <div key={a.id} className="rounded-xl px-2 py-2 hover:bg-white/50">
                  <p className="text-sm font-medium">{a.title}</p>
                  <p className="mt-0.5 text-xs text-gray-600">{a.body}</p>
                  <p className="mt-1 text-[10px] text-gray-400">{new Date(a.at).toLocaleDateString()}</p>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
