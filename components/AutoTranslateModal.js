"use client";

import { X, Languages } from "lucide-react";
import { TRANSLATE_LANGUAGES } from "@/lib/languages";

// Pick the language every incoming message in this chat is translated into.
export default function AutoTranslateModal({ current, chatName, onPick, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4" onClick={onClose}>
      <div className="bg-[var(--wa-panel)] rounded-xl shadow-xl w-full max-w-sm max-h-[80vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()} data-testid="autotranslate-modal">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--wa-border-light)]">
          <h3 className="text-sm font-semibold text-[var(--wa-text-primary)] flex items-center gap-2"><Languages size={16} /> Auto-translate {chatName}</h3>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-[var(--wa-panel-header)] text-[var(--wa-icon)]"><X size={18} /></button>
        </div>
        <p className="px-4 pt-3 text-xs text-[var(--wa-text-secondary)] leading-snug">
          New and recent messages from others in this chat are translated under the original, on this device. The text is sent to Yap AI to translate.
        </p>
        <div className="flex-1 overflow-y-auto p-3 flex flex-wrap gap-1.5">
          {TRANSLATE_LANGUAGES.map((l) => (
            <button
              key={l}
              onClick={() => onPick(l)}
              className={`text-sm rounded-full px-3 py-1.5 border ${l === current ? "border-[var(--wa-green)] text-[var(--wa-green)]" : "border-[var(--wa-border-light)] text-[var(--wa-text-primary)]"} hover:bg-[var(--wa-active)]`}
            >
              {l}
            </button>
          ))}
        </div>
        {current && (
          <div className="p-3 border-t border-[var(--wa-border-light)]">
            <button onClick={() => onPick("")} className="w-full text-sm text-[var(--wa-danger)] py-2 hover:bg-[var(--wa-sidebar-hover)] rounded-lg">Turn off auto-translate</button>
          </div>
        )}
      </div>
    </div>
  );
}
