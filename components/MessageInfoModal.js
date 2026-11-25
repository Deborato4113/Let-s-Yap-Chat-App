"use client";

import { useEffect, useState } from "react";
import { X, Check, CheckCheck } from "lucide-react";
import Avatar from "./Avatar";
import api from "@/lib/api";
import { formatTime, formatDayLabel } from "@/lib/utils";

function PersonList({ title, icon, people }) {
  if (!people?.length) return null;
  return (
    <div>
      <p className="flex items-center gap-2 text-xs font-medium text-[var(--wa-green)] mb-1">
        {icon} {title} ({people.length})
      </p>
      {people.map((p) => (
        <div key={p.id} className="flex items-center gap-2.5 py-1.5">
          <Avatar name={p.name} color={p.avatarColor} avatarUrl={p.avatarUrl} size={28} />
          <span className="text-sm text-[var(--wa-text-primary)]">{p.name}</span>
        </div>
      ))}
    </div>
  );
}

export default function MessageInfoModal({ message, isOwn = true, isGroup = false, onClose }) {
  const [info, setInfo] = useState(null);
  const read = message.readByCount > 0;
  const delivered = message.deliveredCount > 0;

  useEffect(() => {
    if (!isGroup || !isOwn) return;
    api.get(`/messages/${message.id}/info`).then(({ data }) => setInfo(data)).catch(() => setInfo({ readBy: [], deliveredTo: [], pending: [] }));
  }, [message.id, isGroup, isOwn]);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4" onClick={onClose}>
      <div className="bg-[var(--wa-panel)] rounded-xl shadow-xl w-full max-w-sm overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--wa-border-light)]">
          <h3 className="text-sm font-semibold text-[var(--wa-text-primary)]">Message info</h3>
          <button onClick={onClose} aria-label="Close" className="p-1 rounded-full hover:bg-[var(--wa-panel-header)] text-[var(--wa-icon)]">
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-4 text-sm max-h-[70vh] overflow-y-auto">
          {message.text && (
            <p className="text-[var(--wa-text-primary)] bg-[var(--wa-panel-header)] rounded-lg px-3 py-2 whitespace-pre-wrap break-words">
              {message.text}
            </p>
          )}

          {isGroup && isOwn ? (
            info === null ? (
              <p className="text-[var(--wa-text-secondary)]">Loading…</p>
            ) : (
              <>
                <PersonList title="Read by" icon={<CheckCheck size={14} className="text-[var(--wa-blue,#53bdeb)]" />} people={info.readBy} />
                <PersonList title="Delivered to" icon={<CheckCheck size={14} />} people={info.deliveredTo} />
                <PersonList title="Not delivered yet" icon={<Check size={14} />} people={info.pending} />
                {!info.readBy.length && !info.deliveredTo.length && !info.pending.length && (
                  <p className="text-[var(--wa-text-secondary)]">No one else is in this group.</p>
                )}
              </>
            )
          ) : isOwn ? (
            <>
              <div className="flex items-center gap-2 text-[var(--wa-text-secondary)]">
                <CheckCheck size={16} className={read ? "text-[var(--wa-blue,#53bdeb)]" : ""} />
                <span>{read ? "Read" : "Not read yet"}</span>
              </div>
              <div className="flex items-center gap-2 text-[var(--wa-text-secondary)]">
                <Check size={16} />
                <span>{delivered ? "Delivered" : "Not delivered yet"}</span>
              </div>
            </>
          ) : null}
          <div className="text-xs text-[var(--wa-text-muted)]">
            Sent {formatDayLabel(message.timestamp)} at {formatTime(message.timestamp)}
          </div>
          {message.expiresAt && (
            <div className="text-xs text-[var(--wa-text-muted)]">
              Disappears {formatDayLabel(message.expiresAt)} at {formatTime(message.expiresAt)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
