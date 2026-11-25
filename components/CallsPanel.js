"use client";

import { useEffect, useMemo, useState } from "react";
import { Phone, Video, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import api from "@/lib/api";
import Avatar from "./Avatar";
import { formatDayLabel, formatTime } from "@/lib/utils";

function formatDuration(sec) {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m >= 60) return `${Math.floor(m / 60)}h ${m % 60}m`;
  return m > 0 ? `${m} min ${r} sec` : `${r} sec`;
}

// Call history for the Calls / Video calls tabs. Tapping a row opens that
// chat; the phone/video button calls the person straight back.
export default function CallsPanel({ kind, query, version, callActive, onCall, onOpenChat, presence = {} }) {
  const [calls, setCalls] = useState(null);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCalls(null);
    api
      .get("/calls", { params: { kind } })
      .then(({ data }) => !cancelled && setCalls(data.calls || []))
      .catch(() => !cancelled && setCalls([]));
    return () => {
      cancelled = true;
    };
  }, [kind, version]);

  const shown = useMemo(() => {
    if (!calls) return [];
    const q = query.trim().toLowerCase();
    return q ? calls.filter((c) => c.peer.name.toLowerCase().includes(q)) : calls;
  }, [calls, query]);

  const Icon = kind === "video" ? Video : Phone;

  if (calls === null) {
    return <p className="text-center text-sm text-[var(--wa-text-secondary)] mt-10">Loading…</p>;
  }
  if (shown.length === 0) {
    return (
      <div className="text-center text-sm text-[var(--wa-text-secondary)] mt-12 px-8 leading-snug">
        <Icon size={32} className="mx-auto mb-3 text-[var(--wa-text-muted)]" />
        {query.trim()
          ? "No calls match your search."
          : kind === "video"
          ? "No video calls yet. Start one from a chat's video button."
          : "No voice calls yet. Start one from a chat's phone button."}
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {shown.map((c) => {
        const missed = c.status === "missed" && c.direction === "incoming";
        const detail =
          c.status === "completed"
            ? formatDuration(c.duration)
            : c.status === "declined"
            ? c.direction === "outgoing"
              ? "Declined"
              : "You declined"
            : c.direction === "outgoing"
            ? "No answer"
            : "Missed";
        const Dir = c.direction === "incoming" ? ArrowDownLeft : ArrowUpRight;
        const canCall = !c.peer.isBot && !callActive;
        return (
          <div
            key={c.id}
            className="flex items-center gap-3 px-3 py-2.5 border-b border-[var(--wa-panel-header)] hover:bg-[var(--wa-sidebar-hover)]"
          >
            <button onClick={() => onOpenChat(c.conversationId)} className="flex items-center gap-3 min-w-0 flex-1 text-left">
              <Avatar
                name={c.peer.name}
                color={c.peer.avatarColor}
                avatarUrl={c.peer.avatarUrl}
                size={48}
                online={presence[c.peer.id] === "online"}
                showStatus
              />
              <div className="min-w-0">
                <p className={`text-sm font-medium truncate ${missed ? "text-[var(--wa-danger)]" : "text-[var(--wa-text-primary)]"}`}>
                  {c.peer.name}
                </p>
                <p className="text-xs text-[var(--wa-text-secondary)] flex items-center gap-1 truncate">
                  <Dir size={13} className={missed ? "text-[var(--wa-danger)]" : "text-[var(--wa-green)]"} />
                  {formatDayLabel(c.timestamp)}, {formatTime(c.timestamp)} · {detail}
                </p>
              </div>
            </button>
            <button
              onClick={() => onCall(c.peer, c.kind)}
              disabled={!canCall}
              title={kind === "video" ? "Video call" : "Voice call"}
              className="p-2 rounded-full text-[var(--wa-green)] hover:bg-[var(--wa-border)] disabled:opacity-40 disabled:hover:bg-transparent"
            >
              <Icon size={20} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
