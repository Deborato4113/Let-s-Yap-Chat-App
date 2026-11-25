"use client";

import api from "./api";

// Browser side of notifications when the tab is closed (Settings > Notifications).

export function pushSupported() {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

function urlB64ToUint8Array(b64) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export async function registerServiceWorker() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js");
  } catch {
    return null;
  }
}

export async function getPushState() {
  if (!pushSupported()) return { supported: false, permission: "unsupported", subscribed: false };
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  return { supported: true, permission: Notification.permission, subscribed: !!sub };
}

export async function enablePush() {
  if (!pushSupported()) throw new Error("This browser can't show notifications when the app is closed.");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Notifications are blocked. Allow them in your browser's site settings, then try again.");
  const reg = (await navigator.serviceWorker.getRegistration()) || (await registerServiceWorker());
  if (!reg) throw new Error("Couldn't start the notification service.");
  await navigator.serviceWorker.ready;
  const { data } = await api.get("/push/public-key");
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8Array(data.publicKey) });
  }
  await api.post("/push/subscribe", sub.toJSON());
  return true;
}

// token is passed explicitly so this still works while logging out
export async function disablePush(token) {
  if (!pushSupported()) return;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  if (!sub) return;
  try {
    await api.post("/push/unsubscribe", { endpoint: sub.endpoint }, token ? { headers: { Authorization: `Bearer ${token}` } } : undefined);
  } catch { /* the server drops dead endpoints on its own */ }
  await sub.unsubscribe().catch(() => {});
}
