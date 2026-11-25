"use client";

import { useEffect, useState } from "react";
import { Wand2, X, Undo2 } from "lucide-react";
import api from "@/lib/api";

const STYLES = [
  { id: "fix", label: "Fix grammar" },
  { id: "friendly", label: "Friendlier" },
  { id: "professional", label: "More professional" },
  { id: "shorter", label: "Shorter" }
];

// "Rewrite" strip above the message box: improves what you've typed before you send it.
// Nothing is sent to the AI until you pick a style.
export default function RewriteBar({ text, conversationId, onApply }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [undo, setUndo] = useState(null); // text before the last rewrite

  useEffect(() => {
    setOpen(false); setBusy(""); setError(""); setUndo(null);
  }, [conversationId]);

  const trimmed = text.trim();
  if (trimmed.length < 4 && !undo) return null;

  async function run(style) {
    setBusy(style); setError("");
    try {
      const { data } = await api.post("/ai/rewrite", { text: trimmed, style });
      setUndo(text);
      onApply(data.text);
      setOpen(false);
    } catch (err) {
      setError(err.response?.data?.message || "Couldn't rewrite that.");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="px-4 pt-2 flex items-center gap-2 flex-wrap" data-testid="rewrite-bar">
      {!open && trimmed.length >= 4 && (
        <button type="button" onClick={() => setOpen(true)} className="flex items-center gap-1.5 text-xs text-[var(--wa-green)] font-medium hover:underline">
          <Wand2 size={13} /> Rewrite
        </button>
      )}
      {open && (
        <>
          {STYLES.map((s) => (
            <button
              key={s.id}
              type="button"
              disabled={!!busy}
              onClick={() => run(s.id)}
              className="text-xs text-[var(--wa-text-primary)] bg-[var(--wa-panel)] border border-[var(--wa-border-light)] rounded-full px-3 py-1 hover:bg-[var(--wa-active)] disabled:opacity-60"
            >
              {busy === s.id ? "Working…" : s.label}
            </button>
          ))}
          <button type="button" onClick={() => setOpen(false)} className="p-1 text-[var(--wa-icon)]" title="Close">
            <X size={14} />
          </button>
        </>
      )}
      {undo && !open && (
        <button
          type="button"
          onClick={() => { onApply(undo); setUndo(null); }}
          className="flex items-center gap-1 text-xs text-[var(--wa-text-secondary)] hover:underline"
        >
          <Undo2 size={12} /> Undo rewrite
        </button>
      )}
      {error && <span className="text-xs text-[var(--wa-danger)]">{error}</span>}
    </div>
  );
}
