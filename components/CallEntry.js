"use client";

import { Phone, PhoneIncoming, PhoneOutgoing, PhoneMissed, Video, VideoOff } from "lucide-react";
import { formatTime } from "@/lib/utils";

function formatDuration(sec) {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m} min ${r} sec`;
  return `${r} sec`;
}

// One line in the chat for a finished call. Worded from MY point of view:
//   I called:        "Voice call - 2 min 5 sec" / "Voice call - No answer" / "Video call - Declined"
//   They called me:  "Voice call - 2 min 5 sec" / "Missed voice call" / "Video call - You declined"
export default function CallEntry({ message, isOwn, onCallBack, canCallBack }) {
  const call = message.call || { kind: "audio", status: "missed", duration: 0 };
  const video = call.kind === "video";
  const noun = video ? "video call" : "voice call";
  const Noun = video ? "Video call" : "Voice call";

  let title;
  let detail = "";
  let missedForMe = false;
  if (call.status === "completed") {
    title = Noun;
    detail = formatDuration(call.duration);
  } else if (call.status === "declined") {
    title = Noun;
    detail = isOwn ? "Declined" : "You declined";
  } else if (isOwn) {
    title = Noun;
    detail = "No answer";
  } else {
    title = `Missed ${noun}`;
    missedForMe = true;
  }

  let Icon;
  if (video) Icon = missedForMe || (isOwn && call.status !== "completed") ? VideoOff : Video;
  else if (missedForMe) Icon = PhoneMissed;
  else if (call.status === "completed") Icon = isOwn ? PhoneOutgoing : PhoneIncoming;
  else Icon = isOwn ? PhoneOutgoing : Phone;

  const bad = missedForMe;

  return (
    <div className="flex justify-center my-2" id={`msg-${message.id}`}>
      <div className="flex items-center gap-2.5 bg-[var(--wa-panel)] shadow-sm rounded-lg pl-2.5 pr-3 py-1.5 max-w-[85%]">
        <span
          className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
            bad ? "bg-[var(--wa-danger)]/15 text-[var(--wa-danger)]" : "bg-[var(--wa-green)]/15 text-[var(--wa-green)]"
          }`}
        >
          <Icon size={16} />
        </span>
        <div className="min-w-0">
          <p className={`text-sm leading-tight ${bad ? "text-[var(--wa-danger)] font-medium" : "text-[var(--wa-text-primary)]"}`}>
            {title}
          </p>
          <p className="text-[11px] text-[var(--wa-text-secondary)] leading-tight mt-0.5">
            {detail ? `${detail} · ` : ""}
            {formatTime(message.timestamp)}
          </p>
        </div>
        {canCallBack && (
          <button
            type="button"
            onClick={() => onCallBack(video ? "video" : "audio")}
            className="ml-1 text-xs font-medium text-[var(--wa-green)] hover:underline shrink-0"
          >
            Call back
          </button>
        )}
      </div>
    </div>
  );
}
