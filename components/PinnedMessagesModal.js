"use client";

import { useEffect, useState } from "react";
import { X, Pin, PinOff } from "lucide-react";
import api from "@/lib/api";
import { formatDayLabel, formatTime } from "@/lib/utils";

const TYPE_LABEL = { image: "📷 Photo", video: "🎥 Video", audio: "🎤 Voice message", file: "📄 File", poll: "📊 Poll" };

export default function PinnedMessagesModal({ conversationId, onJump, onUnpin, onClose }) {
  const [items, setItems] = useState(null);

  useEffect(() => {
    api.get(`/conversations/${conversationId}/pinned`).then(({ data }) => setItems(data.items)).catch(() => setItems([]));
  }, [conversationId]);

  function unpin(it) {
    onUnpin?.(it.id);
    setItems((list) => list.filter((x) => x.id !== it.id));
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4" onClick={onClose}>
      <div className="bg-[var(--wa-panel)] rounded-xl shadow-xl w-full max-w-sm overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--wa-border-light)]">
          <h3 className="text-sm font-semibold text-[var(--wa-text-primary)] flex items-center gap-2">
            <Pin size={16} /> Pinned messages
          </h3>
          <button onClick={onClose} aria-label="Close" className="p-1 rounded-full hover:bg-[var(--wa-panel-header)] text-[var(--wa-icon)]">
            <X size={18} />
          </button>
        </div>
        <div className="max-h-[65vh] overflow-y-auto">
          {items === null && <p className="text-sm text-[var(--wa-text-secondary)] text-center py-8">Loading…</p>}
          {items?.length === 0 && (
            <p className="text-sm text-[var(--wa-text-secondary)] text-center py-8 px-6">No pinned messages. Use a message&apos;s menu to pin it.</p>
          )}
          {items?.map((it) => (
            <div key={it.id} className="flex items-center gap-2 px-4 py-3 border-b border-[var(--wa-border-light)] hover:bg-[var(--wa-sidebar-hover)]">
              <button
                onClick={() => {
                  onJump(it);
                  onClose();
                }}
                className="flex-1 min-w-0 text-left"
              >
                <p className="text-xs text-[var(--wa-green)] font-medium">
                  {it.senderName} · {formatDayLabel(it.timestamp)} {formatTime(it.timestamp)}
                </p>
                <p className="text-sm text-[var(--wa-text-primary)] line-clamp-2 break-words">{it.text || TYPE_LABEL[it.type] || it.fileName || "Message"}</p>
              </button>
              <button onClick={() => unpin(it)} aria-label="Unpin" title="Unpin" className="p-2 rounded-full hover:bg-[var(--wa-panel-header)] text-[var(--wa-icon)]">
                <PinOff size={16} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
