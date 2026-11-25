"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { X, Send, CornerUpLeft } from "lucide-react";
import api from "@/lib/api";
import RichText from "./RichText";
import { formatTime } from "@/lib/utils";

// Side panel showing one message and every reply to it, with a box to reply
// inside the thread. New replies arriving live (from `messages`) appear here
// too. Replying uses the normal reply mechanism, so it also shows in the chat.
export default function ThreadPanel({ conversationId, rootId, messages, currentUserId, members, onClose, onSend, onJump }) {
  const [fetched, setFetched] = useState({ root: null, replies: [] });
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const bottomRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .get(`/conversations/${conversationId}/thread`, { params: { messageId: rootId } })
      .then(({ data }) => !cancelled && setFetched({ root: data.root, replies: data.replies || [] }))
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [conversationId, rootId]);

  // live copy of the root + replies from the open chat wins over the fetched one
  const root = messages.find((m) => m.id === String(rootId)) || fetched.root;
  const replies = useMemo(() => {
    const byId = new Map();
    fetched.replies.forEach((m) => byId.set(m.id, m));
    messages.filter((m) => m.replyTo && String(m.replyTo.id) === String(rootId)).forEach((m) => byId.set(m.id, m));
    return [...byId.values()].filter((m) => !m.deletedForEveryone).sort((a, b) => a.timestamp - b.timestamp);
  }, [fetched.replies, messages, rootId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [replies.length]);

  function submit(e) {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    onSend({ type: "text", text, replyToId: rootId });
    setDraft("");
  }

  function renderBubble(m) {
    const own = String(m.sender?.id) === String(currentUserId);
    return (
      <div key={m.id} className={`flex ${own ? "justify-end" : "justify-start"} mb-2`}>
        <div className={`max-w-[85%] rounded-lg px-2.5 py-1.5 shadow-sm ${own ? "bg-[var(--wa-bubble-out)]" : "bg-[var(--wa-panel)]"}`}>
          {!own && <p className="text-xs font-semibold text-[var(--wa-green)]">{m.sender?.name}</p>}
          <p className="text-sm text-[var(--wa-text-primary)] whitespace-pre-wrap break-words">
            {m.type === "text" ? <RichText text={m.text} members={members} meId={currentUserId} /> : m.text || `(${m.type})`}
          </p>
          <p className="text-[10px] text-[var(--wa-text-secondary)] text-right mt-0.5">{formatTime(m.timestamp)}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="absolute inset-y-0 right-0 z-30 w-full sm:w-[360px] bg-[var(--wa-panel)] border-l border-[var(--wa-border)] shadow-xl flex flex-col">
      <div className="h-16 shrink-0 bg-[var(--wa-panel-header)] flex items-center gap-3 px-4">
        <button onClick={onClose} className="p-1 text-[var(--wa-icon)]" title="Close thread">
          <X size={20} />
        </button>
        <p className="text-sm font-medium text-[var(--wa-text-primary)]">Thread</p>
      </div>

      <div className="flex-1 overflow-y-auto chat-bg-pattern px-3 py-3">
        {loading && !root ? (
          <p className="text-center text-xs text-[var(--wa-text-secondary)] mt-6">Loading…</p>
        ) : !root ? (
          <p className="text-center text-xs text-[var(--wa-text-secondary)] mt-6">This message isn&apos;t available.</p>
        ) : (
          <>
            <button
              onClick={() => onJump?.(root.id, root.timestamp)}
              className="w-full text-left mb-3 rounded-lg bg-[var(--wa-panel)] border-l-4 border-[var(--wa-green)] px-3 py-2 shadow-sm"
              title="Show in chat"
            >
              <p className="text-xs font-semibold text-[var(--wa-green)]">{root.sender?.name}</p>
              <p className="text-sm text-[var(--wa-text-primary)] whitespace-pre-wrap break-words line-clamp-6">
                {root.deletedForEveryone ? "This message was deleted" : root.text || `(${root.type})`}
              </p>
              <p className="text-[10px] text-[var(--wa-text-secondary)] mt-1">{formatTime(root.timestamp)}</p>
            </button>
            <p className="flex items-center gap-1.5 text-xs text-[var(--wa-text-secondary)] mb-2">
              <CornerUpLeft size={12} /> {replies.length} {replies.length === 1 ? "reply" : "replies"}
            </p>
            {replies.map((m) => renderBubble(m))}
          </>
        )}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={submit} className="shrink-0 bg-[var(--wa-panel-header)] px-3 py-2.5 flex items-center gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Reply in thread"
          className="flex-1 bg-[var(--wa-panel)] rounded-lg px-3 py-2 text-sm outline-none text-[var(--wa-text-primary)]"
        />
        <button
          type="submit"
          disabled={!draft.trim()}
          className="p-2.5 rounded-full bg-[var(--wa-green)] text-white hover:bg-[var(--wa-green-dark)] disabled:opacity-50"
        >
          <Send size={16} />
        </button>
      </form>
    </div>
  );
}
