"use client";

import { useEffect, useState } from "react";

// Per-device preferences (Settings). Stored in this browser only.
const KEY = "yap_prefs_v1";
const EVENT = "yap-prefs";

export const DEFAULT_PREFS = {
  wallpaper: "default",
  textSize: "md", // sm | md | lg | xl
  reopenLast: false, // open the last chat on startup
  linkPreviews: true,
  notifMessages: false, // desktop notifications for every new message
  notifGroups: true, // ...including group messages
  sounds: true, // soft sound for incoming messages
  camera: "",
  mic: "",
  speaker: "",
  translateTo: "" // language for "Translate" in the message menu ("" = this browser's language)
};

export const TEXT_SIZES = { sm: 14, md: 16, lg: 18, xl: 20 };

export function getPrefs() {
  try {
    const raw = localStorage.getItem(KEY);
    return { ...DEFAULT_PREFS, ...(raw ? JSON.parse(raw) : {}) };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function setPref(key, value) {
  const next = { ...getPrefs(), [key]: value };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {}
  window.dispatchEvent(new Event(EVENT));
  return next;
}

export function applyPrefs(prefs = getPrefs()) {
  document.documentElement.style.fontSize = `${TEXT_SIZES[prefs.textSize] || 16}px`;
}

export function usePrefs() {
  const [prefs, setPrefs] = useState(DEFAULT_PREFS);
  useEffect(() => {
    const sync = () => setPrefs(getPrefs());
    sync();
    window.addEventListener(EVENT, sync);
    return () => window.removeEventListener(EVENT, sync);
  }, []);
  return prefs;
}

// getUserMedia constraints that honour the chosen camera / microphone.
// "ideal" (not "exact") so an unplugged device falls back to the default
// instead of failing the call.
export function mediaConstraints(type) {
  const p = getPrefs();
  return {
    audio: p.mic ? { deviceId: { ideal: p.mic } } : true,
    video: type === "video" ? (p.camera ? { deviceId: { ideal: p.camera } } : true) : false
  };
}

// route an <audio>/<video> element to the chosen speaker (Chromium only)
export function applySpeaker(el) {
  const { speaker } = getPrefs();
  if (el && speaker && typeof el.setSinkId === "function") el.setSinkId(speaker).catch(() => {});
}

// short two-note chime for an incoming message
let audioCtx = null;
export function playMessageSound() {
  if (!getPrefs().sounds) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const ctx = audioCtx;
    if (ctx.state === "suspended") ctx.resume();
    const t = ctx.currentTime;
    [660, 880].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t + i * 0.09);
      gain.gain.exponentialRampToValueAtTime(0.12, t + i * 0.09 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.09 + 0.16);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t + i * 0.09);
      osc.stop(t + i * 0.09 + 0.18);
    });
  } catch {}
}
