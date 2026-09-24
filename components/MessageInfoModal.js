"use client";

import { X, Check, CheckCheck } from "lucide-react";
import { formatTime, formatDayLabel } from "@/lib/utils";

export default function MessageInfoModal({ message, onClose }) {
  const read = message.readByCount > 0;
  const delivered = message.deliveredCount > 0;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4" onClick={onClose}>
      <div
        className="bg-[var(--wa-panel)] rounded-xl shadow-xl w-full max-w-sm overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--wa-border-light)]">
          <h3 className="text-sm font-semibold text-[var(--wa-text-primary)]">Message info</h3>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-[var(--wa-panel-header)] text-[var(--wa-icon)]">
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-4 text-sm">
          {message.text && (
            <p className="text-[var(--wa-text-primary)] bg-[var(--wa-panel-header)] rounded-lg px-3 py-2 whitespace-pre-wrap break-words">
              {message.text}
            </p>
          )}

          <div className="flex items-center gap-2 text-[var(--wa-text-secondary)]">
            <CheckCheck size={16} className={read ? "text-[var(--wa-blue,#53bdeb)]" : ""} />
            <span>{read ? "Read" : "Not read yet"}</span>
          </div>
          <div className="flex items-center gap-2 text-[var(--wa-text-secondary)]">
            <Check size={16} />
            <span>{delivered ? "Delivered" : "Not delivered yet"}</span>
          </div>
          <div className="text-xs text-[var(--wa-text-muted)]">
            Sent {formatDayLabel(message.timestamp)} at {formatTime(message.timestamp)}
          </div>
        </div>
      </div>
    </div>
  );
}
