"use client";

import { X, Check, Sun, Moon } from "lucide-react";
import { useTheme, ACCENT_THEMES } from "@/lib/ThemeContext";

export default function ThemeModal({ onClose }) {
  const { accentTheme, darkMode, setAccentTheme, setDarkMode } = useTheme();

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-[var(--wa-panel)] rounded-lg shadow-xl w-full max-w-sm overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-[var(--wa-green-dark)] text-white px-4 py-4 flex items-center justify-between">
          <h2 className="font-medium text-lg">Chat theme</h2>
          <button onClick={onClose} className="p-1 hover:bg-white/10 rounded-full">
            <X size={20} />
          </button>
        </div>

        <div className="p-5">
          <p className="text-xs font-medium text-[var(--wa-green)] mb-2">Display</p>
          <div className="flex gap-2 mb-6">
            <button
              onClick={() => setDarkMode(false)}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm border-2 ${
                !darkMode ? "border-[var(--wa-green)] text-[var(--wa-green)]" : "border-[var(--wa-border)] text-[var(--wa-text-secondary)]"
              }`}
            >
              <Sun size={16} /> Light
            </button>
            <button
              onClick={() => setDarkMode(true)}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm border-2 ${
                darkMode ? "border-[var(--wa-green)] text-[var(--wa-green)]" : "border-[var(--wa-border)] text-[var(--wa-text-secondary)]"
              }`}
            >
              <Moon size={16} /> Dark
            </button>
          </div>

          <p className="text-xs font-medium text-[var(--wa-green)] mb-2">Accent color</p>
          <div className="grid grid-cols-4 gap-3">
            {ACCENT_THEMES.map((t) => (
              <button key={t.id} onClick={() => setAccentTheme(t.id)} className="flex flex-col items-center gap-1.5">
                <span
                  className="w-11 h-11 rounded-full flex items-center justify-center border-2"
                  style={{
                    backgroundColor: t.swatch,
                    borderColor: accentTheme === t.id ? "var(--wa-text-primary)" : "transparent"
                  }}
                >
                  {accentTheme === t.id && <Check size={18} className="text-white" />}
                </span>
                <span className="text-[11px] text-[var(--wa-text-secondary)]">{t.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
