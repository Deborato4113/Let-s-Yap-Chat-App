"use client";

import { useEffect, useState } from "react";
import { X, Sparkles, Send } from "lucide-react";
import api from "@/lib/api";

// "Yap AI" - a quick, contextual take on a single message, launched from its
// context menu (same slot as "Ask Meta AI" in WhatsApp).
export default function YapAiPopover({ message, onClose, onUseReply }) {
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    api
      .post("/ai/yap", { text: message.text || "", type: message.type })
      .then(({ data }) => {
        if (!cancelled) setReply(data.reply);
      })
      .catch(() => {
        if (!cancelled) setError("Yap AI couldn't respond right now.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message.id]);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4" onClick={onClose}>
      <div
        className="bg-[var(--wa-panel)] rounded-xl shadow-xl w-full max-w-sm overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--wa-border-light)]">
          <h3 className="text-sm font-semibold text-[var(--wa-text-primary)] flex items-center gap-2">
            <Sparkles size={16} className="text-[var(--wa-green)]" /> Yap AI
          </h3>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-[var(--wa-panel-header)] text-[var(--wa-icon)]">
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <p className="text-xs text-[var(--wa-text-muted)] italic bg-[var(--wa-panel-header)] rounded-lg px-3 py-2 line-clamp-2">
            {message.text || `(${message.type} message)`}
          </p>

          {loading ? (
            <div className="flex items-center gap-2 text-sm text-[var(--wa-text-secondary)] py-3">
              <span className="w-1.5 h-1.5 bg-[var(--wa-text-muted)] rounded-full typing-dot" />
              <span className="w-1.5 h-1.5 bg-[var(--wa-text-muted)] rounded-full typing-dot" />
              <span className="w-1.5 h-1.5 bg-[var(--wa-text-muted)] rounded-full typing-dot" />
              Thinking…
            </div>
          ) : error ? (
            <p className="text-sm text-[var(--wa-danger)]">{error}</p>
          ) : (
            <p className="text-sm text-[var(--wa-text-primary)] whitespace-pre-wrap">{reply}</p>
          )}

          {!loading && !error && (
            <button
              onClick={() => {
                onUseReply(reply);
                onClose();
              }}
              className="w-full flex items-center justify-center gap-2 bg-[var(--wa-green)] hover:bg-[var(--wa-green-dark)] text-white rounded-lg py-2 text-sm font-medium"
            >
              <Send size={14} /> Use as reply
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
