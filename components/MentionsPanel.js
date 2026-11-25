"use client";

import { useEffect, useState } from "react";
import { X, AtSign } from "lucide-react";
import api from "@/lib/api";

// "Mentions" filter for groups: every message that @mentions me. Clicking one
// jumps to it in the chat.
export default function MentionsPanel({ conversationId, currentUserId, onClose, onJump }) {
  const [results, setResults] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get(`/conversations/${conversationId}/mentions`)
      .then(({ data }) => !cancelled && setResults(data.results || []))
      .catch(() => !cancelled && setResults([]));
    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  return (
    <div className="bg-[var(--wa-panel)] border-b border-[var(--wa-border)]">
      <div className="flex items-center gap-2 px-4 py-2">
        <AtSign size={16} className="text-[var(--wa-green)] shrink-0" />
        <p className="flex-1 text-sm font-medium text-[var(--wa-text-primary)]">Messages that mention you</p>
        <button onClick={onClose} className="p-1 text-[var(--wa-icon)]" title="Close">
          <X size={18} />
        </button>
      </div>
      <div className="max-h-64 overflow-y-auto border-t border-[var(--wa-border)]">
        {results === null ? (
          <p className="px-4 py-3 text-xs text-[var(--wa-text-secondary)]">Loading…</p>
        ) : results.length === 0 ? (
          <p className="px-4 py-3 text-xs text-[var(--wa-text-secondary)]">Nobody has mentioned you in this chat yet.</p>
        ) : (
          results.map((r) => (
            <button
              key={r.id}
              onClick={() => onJump(r.id, r.timestamp)}
              className="w-full text-left px-4 py-2 hover:bg-[var(--wa-sidebar-hover)] border-b border-[var(--wa-border)] last:border-b-0"
            >
              <div className="flex justify-between gap-2 text-xs text-[var(--wa-text-secondary)]">
                <span className="truncate">{String(r.senderId) === String(currentUserId) ? "You" : r.senderName}</span>
                <span className="shrink-0">
                  {new Date(r.timestamp).toLocaleDateString([], { day: "numeric", month: "short" })}{" "}
                  {new Date(r.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
              <p className="text-sm text-[var(--wa-text-primary)] truncate">{r.text}</p>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
