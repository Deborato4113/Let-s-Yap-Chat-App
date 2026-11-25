"use client";

import { useEffect, useState } from "react";
import { X, Star } from "lucide-react";
import api from "@/lib/api";

function labelFor(m) {
  if (m.text) return m.text;
  if (m.type === "image") return "📷 Photo";
  if (m.type === "video") return "🎥 Video";
  if (m.type === "audio") return "🎤 Voice message";
  if (m.type === "file") return `📄 ${m.fileName || "Document"}`;
  if (m.type === "poll") return "📊 Poll";
  return `(${m.type})`;
}

// Every message I've starred, across all chats. Clicking one opens that chat
// and scrolls to the message.
export default function StarredPanel({ currentUserId, onClose, onOpen }) {
  const [items, setItems] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get("/starred")
      .then(({ data }) => !cancelled && setItems(data.starred || []))
      .catch(() => !cancelled && setItems([]));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center px-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-[var(--wa-panel)] rounded-lg shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col animate-fade-in"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--wa-border)] shrink-0">
          <h3 className="text-base font-medium text-[var(--wa-text-primary)] flex items-center gap-2">
            <Star size={18} className="text-[#ffc107] fill-current" /> Starred messages
          </h3>
          <button onClick={onClose} className="p-1 text-[var(--wa-icon)]" title="Close">
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto">
          {items === null ? (
            <p className="px-5 py-8 text-center text-sm text-[var(--wa-text-secondary)]">Loading…</p>
          ) : items.length === 0 ? (
            <p className="px-6 py-10 text-center text-sm text-[var(--wa-text-secondary)]">
              No starred messages yet. Open a message&apos;s menu and choose Star to keep it here.
            </p>
          ) : (
            items.map((m) => (
              <button
                key={m.id}
                onClick={() => onOpen(m)}
                className="w-full text-left px-5 py-3 border-b border-[var(--wa-border)] last:border-b-0 hover:bg-[var(--wa-sidebar-hover)]"
              >
                <div className="flex justify-between gap-3 text-xs text-[var(--wa-text-secondary)]">
                  <span className="truncate">
                    <span className="font-medium text-[var(--wa-green)]">
                      {String(m.senderId) === String(currentUserId) ? "You" : m.senderName}
                    </span>
                    {" · "}
                    {m.conversationName}
                  </span>
                  <span className="shrink-0">
                    {new Date(m.timestamp).toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" })}
                  </span>
                </div>
                <p className="text-sm text-[var(--wa-text-primary)] mt-0.5 line-clamp-2 break-words">{labelFor(m)}</p>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
