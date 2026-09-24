"use client";

import { useState } from "react";
import { X, Send } from "lucide-react";
import Avatar from "./Avatar";

export default function ForwardModal({ conversations, onClose, onForward }) {
  const [selected, setSelected] = useState(new Set());

  function toggle(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleSend() {
    if (selected.size === 0) return;
    onForward([...selected]);
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4" onClick={onClose}>
      <div
        className="bg-[var(--wa-panel)] rounded-xl shadow-xl w-full max-w-sm max-h-[80vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--wa-border-light)]">
          <h3 className="text-sm font-semibold text-[var(--wa-text-primary)]">Forward to</h3>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-[var(--wa-panel-header)] text-[var(--wa-icon)]">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 && (
            <p className="text-sm text-[var(--wa-text-secondary)] text-center py-8">No other chats to forward to.</p>
          )}
          {conversations.map((c) => {
            const label = c.isGroup ? c.groupName : c.peer?.name || "Unknown";
            const color = c.isGroup ? c.groupAvatarColor : c.peer?.avatarColor;
            const avatarUrl = c.isGroup ? "" : c.peer?.avatarUrl;
            const checked = selected.has(c.id);
            return (
              <button
                key={c.id}
                onClick={() => toggle(c.id)}
                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--wa-sidebar-hover)] text-left"
              >
                <Avatar name={label} color={color} avatarUrl={avatarUrl} size={38} isGroup={c.isGroup} />
                <span className="flex-1 min-w-0 text-sm text-[var(--wa-text-primary)] truncate">{label}</span>
                <span
                  className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                    checked ? "bg-[var(--wa-green)] border-[var(--wa-green)]" : "border-[var(--wa-border-light)]"
                  }`}
                >
                  {checked && <span className="w-2 h-2 rounded-full bg-white" />}
                </span>
              </button>
            );
          })}
        </div>

        {selected.size > 0 && (
          <div className="p-3 border-t border-[var(--wa-border-light)] flex justify-end">
            <button
              onClick={handleSend}
              className="flex items-center gap-2 bg-[var(--wa-green)] hover:bg-[var(--wa-green-dark)] text-white rounded-full px-4 py-2 text-sm font-medium"
            >
              <Send size={16} /> Send ({selected.size})
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
