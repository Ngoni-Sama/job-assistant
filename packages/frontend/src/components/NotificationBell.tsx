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
      <button onClick={toggle} className="relative flex h-10 w-10 items-center justify-center rounded-full text-gray-600 hover:bg-white/50" aria-label="Updates">
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
          <div className="popover fixed left-3 right-3 top-16 z-20 max-h-[70vh] overflow-y-auto overflow-x-hidden rounded-2xl p-2 shadow-xl sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:max-h-96 sm:w-80">
            <p className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-gray-500">What’s new</p>
            {items.length === 0 ? (
              <p className="px-2 py-3 text-sm text-gray-500">No updates yet.</p>
            ) : (
              items.map((a) => (
                <div key={a.id} className="rounded-xl px-2 py-2 hover:bg-gray-50">
                  <p className="text-sm font-medium break-words">{a.title}</p>
                  <p className="mt-0.5 text-sm text-gray-700 break-words">{a.body}</p>
                  <p className="mt-1 text-[11px] text-gray-500">{new Date(a.at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</p>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
