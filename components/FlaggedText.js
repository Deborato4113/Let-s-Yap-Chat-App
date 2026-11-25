"use client";

import { useState } from "react";
import { ShieldAlert } from "lucide-react";
import api from "@/lib/api";

// Renders a message's text. If the toxicity classifier flagged it (and I'm
// the receiver), it's hidden behind a notice with two choices:
//   "Show"      - just reveal it for now
//   "Not toxic" - reveal it AND tell the system it was a false positive
// (stored in moderation_feedback, used to evaluate / tune the classifier).
export default function FlaggedText({ message, isOwn, render }) {
  const [revealed, setRevealed] = useState(false);
  const [sentFeedback, setSentFeedback] = useState(false);

  if (!message.flagged) return render(message.text);

  if (isOwn) {
    return (
      <>
        {render(message.text)}
        <span className="flex items-center gap-1 mt-1 text-[11px] text-[var(--wa-text-secondary)]">
          <ShieldAlert size={12} /> Flagged as potentially harmful
        </span>
      </>
    );
  }

  if (revealed) return render(message.text);

  async function notToxic() {
    setRevealed(true);
    if (sentFeedback) return;
    setSentFeedback(true);
    try {
      await api.post(`/messages/${message.id}/moderation`, { verdict: "false_positive" });
    } catch {
      /* feedback is best-effort */
    }
  }

  return (
    <span className="block">
      <span className="flex items-center gap-1.5 text-sm italic text-[var(--wa-text-secondary)]">
        <ShieldAlert size={14} className="text-[var(--wa-danger)] shrink-0" />
        This message may be harmful.
      </span>
      <span className="flex gap-3 mt-1 text-xs">
        <button onClick={() => setRevealed(true)} className="text-[var(--wa-green)] font-medium">
          Show
        </button>
        <button onClick={notToxic} className="text-[var(--wa-green)] font-medium">
          Not toxic
        </button>
      </span>
    </span>
  );
}
