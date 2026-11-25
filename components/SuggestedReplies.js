"use client";

import { useEffect, useState } from "react";
import { Sparkles, X } from "lucide-react";
import api from "@/lib/api";

// "Suggest replies" strip above the message box. Shown only when the latest message
// in the chat is a text from someone else. Nothing is fetched until it's tapped.
export default function SuggestedReplies({ conversationId, messages, currentUserId, onPick }) {
  const last = [...messages].reverse().find((m) => m.type !== "system" && m.type !== "call");
  const eligible = !!last && last.type === "text" && !last.deletedForEveryone && !!last.text && String(last.sender?.id) !== String(currentUserId);
  const key = `${conversationId}:${last?.id}`;
  const [state, setState] = useState({ key: null, loading: false, list: null, error: "" });

  // a new message or a different chat clears old suggestions
  useEffect(() => {
    setState({ key: null, loading: false, list: null, error: "" });
  }, [key]);

  if (!eligible) return null;

  async function load() {
    setState({ key, loading: true, list: null, error: "" });
    try {
      const { data } = await api.post("/ai/suggest-replies", { conversationId });
      setState({ key, loading: false, list: data.suggestions || [], error: "" });
    } catch (err) {
      setState({ key, loading: false, list: null, error: err.response?.data?.message || "Couldn't get suggestions." });
    }
  }

  if (state.key !== key) {
    return (
      <div className="px-4 pt-2">
        <button type="button" onClick={load} className="flex items-center gap-1.5 text-xs text-[var(--wa-green)] font-medium hover:underline">
          <Sparkles size={13} /> Suggest replies
        </button>
      </div>
    );
  }

  return (
    <div className="px-4 pt-2 flex items-center gap-2 flex-wrap" data-testid="suggested-replies">
      {state.loading && <span className="text-xs text-[var(--wa-text-secondary)]">Thinking of replies…</span>}
      {state.error && <span className="text-xs text-[var(--wa-danger)]">{state.error}</span>}
      {state.list && state.list.length === 0 && <span className="text-xs text-[var(--wa-text-secondary)]">No suggestions for this message.</span>}
      {state.list?.map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => { onPick(s); setState({ key: null, loading: false, list: null, error: "" }); }}
          className="text-sm text-[var(--wa-text-primary)] bg-[var(--wa-panel)] border border-[var(--wa-border-light)] rounded-full px-3 py-1 hover:bg-[var(--wa-active)] text-left"
        >
          {s}
        </button>
      ))}
      {!state.loading && (
        <button type="button" onClick={() => setState({ key: null, loading: false, list: null, error: "" })} className="p-1 text-[var(--wa-icon)]" title="Hide suggestions">
          <X size={14} />
        </button>
      )}
    </div>
  );
}
