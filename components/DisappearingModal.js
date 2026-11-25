"use client";

import { X, Timer } from "lucide-react";

export const TIMER_OPTIONS = [
  [0, "Off"],
  [86400, "24 hours"],
  [604800, "7 days"],
  [7776000, "90 days"]
];

export function timerLabel(seconds) {
  return TIMER_OPTIONS.find(([s]) => s === seconds)?.[1] || "Off";
}

export default function DisappearingModal({ current = 0, onSelect, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4" onClick={onClose}>
      <div className="bg-[var(--wa-panel)] rounded-xl shadow-xl w-full max-w-sm overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--wa-border-light)]">
          <h3 className="text-sm font-semibold text-[var(--wa-text-primary)] flex items-center gap-2">
            <Timer size={16} /> Disappearing messages
          </h3>
          <button onClick={onClose} aria-label="Close" className="p-1 rounded-full hover:bg-[var(--wa-panel-header)] text-[var(--wa-icon)]">
            <X size={18} />
          </button>
        </div>
        <div className="p-4">
          <p className="text-xs text-[var(--wa-text-secondary)] mb-3 leading-snug">
            New messages in this chat are deleted for everyone after the time you choose. Messages already sent aren&apos;t affected.
          </p>
          {TIMER_OPTIONS.map(([seconds, label]) => (
            <label key={seconds} className="flex items-center gap-3 py-2.5 cursor-pointer text-sm text-[var(--wa-text-primary)]">
              <input
                type="radio"
                name="disappearing"
                checked={current === seconds}
                onChange={() => {
                  onSelect(seconds);
                  onClose();
                }}
                className="accent-[var(--wa-green)] w-4 h-4"
              />
              {label}
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
