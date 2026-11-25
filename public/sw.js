/* Let's Yap service worker: makes the app installable, shows push notifications
   when no tab is open, and opens the right chat when one is tapped. It does not
   cache pages or API calls, so chats are always live. */
const SHELL = "yap-shell-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(["/icons/icon-192.png"])).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== SHELL).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

// An installable app needs a fetch handler; ours simply goes to the network.
self.addEventListener("fetch", () => {});

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: "Let's Yap", body: event.data ? event.data.text() : "" }; }
  event.waitUntil((async () => {
    // If the app is open and in view the person is already seeing it live.
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    if (wins.some((w) => w.visibilityState === "visible" && w.focused)) return;
    await self.registration.showNotification(data.title || "Let's Yap", {
      body: data.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-96.png",
      tag: data.tag || undefined,
      renotify: !!data.tag,
      data: { conversationId: data.conversationId || null }
    });
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const id = event.notification.data && event.notification.data.conversationId;
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const open = wins.find((w) => new URL(w.url).pathname.startsWith("/chat")) || wins[0];
    if (open) {
      await open.focus();
      if (id) open.postMessage({ type: "yap-open-chat", conversationId: id });
      return;
    }
    await self.clients.openWindow(id ? `/chat?c=${encodeURIComponent(id)}` : "/chat");
  })());
});
