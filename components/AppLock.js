"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Lock, X, ShieldCheck } from "lucide-react";

// App lock: a PIN that covers the app on this device. It's a privacy screen
// (someone picking up your unlocked laptop can't read your chats) - the PIN is
// stored only in this browser as a salted hash, never sent to the server.

const keyFor = (uid) => `yap_applock_${uid}`;
const enc = new TextEncoder();

function toHex(buf) {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hashPin(pin, salt) {
  const key = await crypto.subtle.importKey("raw", enc.encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: enc.encode(salt), iterations: 100000, hash: "SHA-256" },
    key,
    256
  );
  return toHex(bits);
}

export function readLockConfig(uid) {
  try {
    const raw = localStorage.getItem(keyFor(uid));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeLockConfig(uid, cfg) {
  try {
    localStorage.setItem(keyFor(uid), JSON.stringify(cfg));
  } catch {}
}

export function clearAppLock(uid) {
  if (!uid) return;
  try {
    localStorage.removeItem(keyFor(uid));
  } catch {}
}

async function verifyPin(uid, pin) {
  const cfg = readLockConfig(uid);
  if (!cfg) return true;
  return (await hashPin(pin, cfg.salt)) === cfg.hash;
}

async function savePin(uid, pin, minutes) {
  const salt = toHex(crypto.getRandomValues(new Uint8Array(16)));
  writeLockConfig(uid, { salt, hash: await hashPin(pin, salt), minutes });
}

// Tracks whether the app is locked: locks on load when a PIN is set, on demand,
// and after the chosen minutes without any mouse / keyboard / touch activity.
export function useAppLock(userId) {
  const [locked, setLocked] = useState(false);
  const [version, setVersion] = useState(0);
  const timer = useRef(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (userId && readLockConfig(userId)) setLocked(true);
  }, [userId]);

  useEffect(() => {
    if (!userId || locked) return;
    const cfg = readLockConfig(userId);
    if (!cfg || !cfg.minutes) return;
    const arm = () => {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setLocked(true), cfg.minutes * 60 * 1000);
    };
    const events = ["mousemove", "keydown", "click", "touchstart", "scroll"];
    events.forEach((e) => window.addEventListener(e, arm, { passive: true }));
    arm();
    return () => {
      clearTimeout(timer.current);
      events.forEach((e) => window.removeEventListener(e, arm));
    };
  }, [userId, locked, version]);

  const lockNow = useCallback(() => {
    if (userId && readLockConfig(userId)) setLocked(true);
  }, [userId]);

  return { locked, lockNow, unlock: () => setLocked(false), configChanged: () => setVersion((v) => v + 1) };
}

export function LockScreen({ userId, name, onUnlock, onForgot }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!pin || busy) return;
    setBusy(true);
    const ok = await verifyPin(userId, pin);
    setBusy(false);
    if (ok) return onUnlock();
    setError("Wrong PIN. Try again.");
    setPin("");
  }

  return (
    <div className="fixed inset-0 z-[100] bg-[var(--wa-panel-header)] flex items-center justify-center px-6">
      <form onSubmit={submit} className="w-full max-w-xs text-center">
        <div className="w-16 h-16 mx-auto rounded-full bg-[var(--wa-green)] text-white flex items-center justify-center mb-5">
          <Lock size={28} />
        </div>
        <h2 className="text-xl font-semibold text-[var(--wa-text-primary)]">Let&apos;s Yap is locked</h2>
        <p className="text-sm text-[var(--wa-text-secondary)] mt-1 mb-5">Enter your PIN{name ? `, ${name.split(" ")[0]}` : ""}.</p>
        <input
          autoFocus
          type="password"
          inputMode="numeric"
          autoComplete="off"
          value={pin}
          onChange={(e) => {
            setPin(e.target.value.replace(/\D/g, "").slice(0, 8));
            setError("");
          }}
          placeholder="PIN"
          className="w-full text-center tracking-[0.5em] text-lg rounded-lg px-4 py-3 bg-[var(--wa-panel)] border border-[var(--wa-border-light)] outline-none focus:border-[var(--wa-green)] text-[var(--wa-text-primary)]"
        />
        {error && <p className="text-sm text-[var(--wa-danger)] mt-2">{error}</p>}
        <button
          type="submit"
          disabled={!pin || busy}
          className="w-full mt-4 py-2.5 rounded-lg bg-[var(--wa-green)] text-white font-medium disabled:opacity-50"
        >
          Unlock
        </button>
        <button type="button" onClick={onForgot} className="mt-4 text-xs text-[var(--wa-text-secondary)] hover:underline">
          Forgot PIN? Log out
        </button>
      </form>
    </div>
  );
}

const TIMEOUTS = [
  { v: 1, l: "After 1 minute" },
  { v: 5, l: "After 5 minutes" },
  { v: 15, l: "After 15 minutes" },
  { v: 30, l: "After 30 minutes" },
  { v: 0, l: "Only when I lock it" }
];

// Settings dialog opened from the menu: turn on, change PIN, auto-lock time, turn off.
export default function AppLockModal({ userId, onClose, onLockNow, onChanged }) {
  const [cfg, setCfg] = useState(() => readLockConfig(userId));
  const [step, setStep] = useState(cfg ? "manage" : "set"); // set | manage | change | off
  const [current, setCurrent] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState("");

  const digits = (setter) => (e) => {
    setter(e.target.value.replace(/\D/g, "").slice(0, 8));
    setError("");
  };
  const field =
    "w-full rounded-lg px-3 py-2 text-sm tracking-widest bg-[var(--wa-panel-header)] border border-[var(--wa-border-light)] outline-none focus:border-[var(--wa-green)] text-[var(--wa-text-primary)]";

  async function saveNew(e) {
    e.preventDefault();
    if (pin.length < 4) return setError("Use at least 4 digits.");
    if (pin !== confirmPin) return setError("The PINs don't match.");
    if (step === "change" && !(await verifyPin(userId, current))) return setError("Current PIN is wrong.");
    await savePin(userId, pin, cfg?.minutes ?? 5);
    setCfg(readLockConfig(userId));
    onChanged?.();
    setPin("");
    setConfirmPin("");
    setCurrent("");
    setStep("manage");
  }

  async function turnOff(e) {
    e.preventDefault();
    if (!(await verifyPin(userId, current))) return setError("Wrong PIN.");
    clearAppLock(userId);
    onChanged?.();
    onClose();
  }

  function setMinutes(minutes) {
    const next = { ...cfg, minutes };
    writeLockConfig(userId, next);
    setCfg(next);
    onChanged?.();
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center px-4" onClick={onClose}>
      <div
        className="bg-[var(--wa-panel)] rounded-lg shadow-xl w-full max-w-sm overflow-hidden animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-[var(--wa-green-dark)] text-white px-4 py-4 flex items-center justify-between">
          <h2 className="font-medium text-lg flex items-center gap-2">
            <Lock size={18} /> App lock
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-white/10 rounded-full" aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <div className="p-5">
          {step === "manage" && (
            <div className="space-y-4">
              <p className="text-sm text-[var(--wa-text-primary)] flex items-center gap-2">
                <ShieldCheck size={18} className="text-[var(--wa-green)]" /> App lock is on for this device.
              </p>
              <label className="block text-xs text-[var(--wa-text-secondary)]">
                Lock automatically
                <select
                  value={cfg?.minutes ?? 5}
                  onChange={(e) => setMinutes(Number(e.target.value))}
                  className={`${field} mt-1 tracking-normal`}
                >
                  {TIMEOUTS.map((t) => (
                    <option key={t.v} value={t.v}>
                      {t.l}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => {
                    onClose();
                    onLockNow();
                  }}
                  className="w-full py-2.5 rounded-lg bg-[var(--wa-green)] text-white text-sm font-medium"
                >
                  Lock now
                </button>
                <button
                  onClick={() => setStep("change")}
                  className="w-full py-2.5 rounded-lg border border-[var(--wa-border-light)] text-sm text-[var(--wa-text-primary)] hover:bg-[var(--wa-sidebar-hover)]"
                >
                  Change PIN
                </button>
                <button
                  onClick={() => setStep("off")}
                  className="w-full py-2.5 rounded-lg text-sm text-[var(--wa-danger)] hover:bg-[var(--wa-sidebar-hover)]"
                >
                  Turn off app lock
                </button>
              </div>
            </div>
          )}

          {(step === "set" || step === "change") && (
            <form onSubmit={saveNew} className="space-y-3">
              <p className="text-sm text-[var(--wa-text-secondary)] leading-snug">
                {step === "set"
                  ? "Choose a PIN. You'll need it to open Let's Yap on this device. It's stored only on this device."
                  : "Enter your current PIN, then choose a new one."}
              </p>
              {step === "change" && (
                <input type="password" inputMode="numeric" autoFocus value={current} onChange={digits(setCurrent)} placeholder="Current PIN" className={field} />
              )}
              <input type="password" inputMode="numeric" autoFocus={step === "set"} value={pin} onChange={digits(setPin)} placeholder="New PIN (4-8 digits)" className={field} />
              <input type="password" inputMode="numeric" value={confirmPin} onChange={digits(setConfirmPin)} placeholder="Confirm PIN" className={field} />
              {error && <p className="text-sm text-[var(--wa-danger)]">{error}</p>}
              <button type="submit" className="w-full py-2.5 rounded-lg bg-[var(--wa-green)] text-white text-sm font-medium">
                {step === "set" ? "Turn on app lock" : "Save new PIN"}
              </button>
            </form>
          )}

          {step === "off" && (
            <form onSubmit={turnOff} className="space-y-3">
              <p className="text-sm text-[var(--wa-text-secondary)]">Enter your PIN to turn app lock off.</p>
              <input type="password" inputMode="numeric" autoFocus value={current} onChange={digits(setCurrent)} placeholder="PIN" className={field} />
              {error && <p className="text-sm text-[var(--wa-danger)]">{error}</p>}
              <button type="submit" className="w-full py-2.5 rounded-lg bg-[var(--wa-danger)] text-white text-sm font-medium">
                Turn off
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
