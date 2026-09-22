"use client";

import { X, Ban, ShieldCheck } from "lucide-react";
import Avatar from "./Avatar";

export default function ContactInfoPanel({ conversation, isBlocked, onClose, onToggleBlock }) {
  const peer = conversation.peer;
  const label = conversation.isGroup ? conversation.groupName : peer?.name || "Unknown";
  const color = conversation.isGroup ? conversation.groupAvatarColor : peer?.avatarColor;
  const avatarUrl = conversation.isGroup ? "" : peer?.avatarUrl;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-[var(--wa-panel)] rounded-lg shadow-xl w-full max-w-sm overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-[var(--wa-green-dark)] text-white px-4 py-4 flex items-center justify-between">
          <h2 className="font-medium text-lg">Contact info</h2>
          <button onClick={onClose} className="p-1 hover:bg-white/10 rounded-full">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 flex flex-col items-center border-b border-[var(--wa-border)]">
          <Avatar name={label} color={color} avatarUrl={avatarUrl} size={96} isGroup={conversation.isGroup} />
          <p className="mt-3 text-lg font-medium text-[var(--wa-text-primary)]">{label}</p>
          {!conversation.isGroup && <p className="text-sm text-[var(--wa-text-secondary)]">@{peer?.username}</p>}
        </div>

        {!conversation.isGroup && (
          <div className="px-6 py-4 border-b border-[var(--wa-border)]">
            <p className="text-xs text-[var(--wa-green)] font-medium mb-1">Status</p>
            <p className="text-sm text-[var(--wa-text-primary)]">{peer?.bio || "Hey there! I am using Let's Yap."}</p>
          </div>
        )}

        {conversation.isGroup && (
          <div className="px-6 py-4 border-b border-[var(--wa-border)]">
            <p className="text-xs text-[var(--wa-green)] font-medium mb-2">
              {conversation.participants?.length || 0} members
            </p>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {conversation.participants?.map((p) => (
                <div key={p.id} className="flex items-center gap-2.5">
                  <Avatar name={p.name} color={p.avatarColor} avatarUrl={p.avatarUrl} size={32} />
                  <span className="text-sm text-[var(--wa-text-primary)]">{p.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {!conversation.isGroup && (
          <div className="p-3">
            <button
              onClick={onToggleBlock}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-[var(--wa-sidebar-hover)] text-left text-sm ${
                isBlocked ? "text-[var(--wa-green)]" : "text-[var(--wa-danger)]"
              }`}
            >
              {isBlocked ? <ShieldCheck size={18} /> : <Ban size={18} />}
              {isBlocked ? `Unblock ${peer?.name}` : `Block ${peer?.name}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
