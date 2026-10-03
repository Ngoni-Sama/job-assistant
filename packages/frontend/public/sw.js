/*
 * VacancyPal service worker — push notifications only. It caches nothing, so
 * deploys are never served stale.
 *
 * Shows a notification (new job, employer message, auto-apply result…) when
 * the app is closed or in the background, and opens the right page when it's
 * tapped. When the app is on screen it just tells the page, which plays its
 * own sound and shows an in-app alert instead.
 */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "VacancyPal", body: event.data ? event.data.text() : "" };
  }

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      // Let any open page refresh straight away (unread badge, open chat).
      for (const c of windows) c.postMessage({ type: "push", data });

      if (typeof data.badge === "number" && "setAppBadge" in self.navigator) {
        const set = data.badge > 0 ? self.navigator.setAppBadge(data.badge) : self.navigator.clearAppBadge();
        await set.catch(() => {});
      }

      const onScreen = windows.some((c) => c.visibilityState === "visible");
      // iOS drops a subscription that receives pushes without showing anything,
      // so there the notification is still shown — just quietly.
      const isApple = /iPhone|iPad|iPod/.test(self.navigator.userAgent);
      if (onScreen && data.type !== "test") {
        if (!isApple) return;
        data.silent = true;
      }

      await self.registration.showNotification(data.title || "VacancyPal", {
        body: data.body || "",
        icon: "/brand/icon-192.png",
        badge: "/brand/icon-192.png",
        tag: data.tag,
        renotify: !!data.tag,
        // The device's own notification sound plays unless the user chose
        // silence (sound switch off, or quiet hours).
        silent: !!data.silent,
        vibrate: data.silent ? undefined : [200, 100, 200],
        data: { url: data.url || "/" },
      });
    })()
  );
});

self.addEventListener("notificationclick", (event) => {
  const { url } = event.notification.data || {};
  event.notification.close();
  const target = new URL(url || "/", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      // Reuse an open VacancyPal window rather than opening another tab.
      for (const c of windows) {
        if ("focus" in c) {
          await c.focus();
          if ("navigate" in c) await c.navigate(target).catch(() => {});
          return;
        }
      }
      await self.clients.openWindow(target);
    })()
  );
});
