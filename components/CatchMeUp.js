"use client";

import { useState, useEffect } from "react";
import { Sparkles, X } from "lucide-react";
import api from "@/lib/api";

const MODES = [
  ["since_me", "Since I last sent a message"],
  ["last50", "Last 50 messages"],
  ["day", "Last 24 hours"]
];

// "Catch me up" bar + panel, shown under the chat header.
// Usage in ChatWindow:  <CatchMeUp conversationId={conversation.id} />
export default function CatchMeUp({ conversationId }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState("since_me");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  // New chat -> start fresh.
  useEffect(() => {
    setOpen(false);
    setResult(null);
    setError("");
  }, [conversationId]);

  async function run() {
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const { data } = await api.post(`/conversations/${conversationId}/summary`, { mode });
      setResult(data);
    } catch (err) {
      setError(err.response?.data?.message || "Couldn't summarize right now.");
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <div className="px-4 py-1.5 bg-[var(--wa-panel-header)] border-b border-[var(--wa-border)]">
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 text-xs text-[var(--wa-green)] font-medium"
        >
          <Sparkles size={13} /> Catch me up
        </button>
      </div>
    );
  }

  const sum = result?.summary || null;

  return (
    <div className="px-4 py-3 bg-[var(--wa-panel-header)] border-b border-[var(--wa-border)] text-sm text-[var(--wa-text-primary)]">
      <div className="flex items-center justify-between mb-2">
        <span className="flex items-center gap-1.5 font-medium">
          <Sparkles size={14} className="text-[var(--wa-green)]" /> Catch me up
        </span>
        <button onClick={() => setOpen(false)} className="p-1 text-[var(--wa-icon)]" title="Close">
          <X size={16} />
        </button>
      </div>

      <div className="flex items-center gap-2 mb-2">
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value)}
          className="bg-[var(--wa-panel)] rounded px-2 py-1 text-xs outline-none"
        >
          {MODES.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <button
          onClick={run}
          disabled={loading}
          className="px-3 py-1 rounded-full text-xs bg-[var(--wa-green)] text-white disabled:opacity-50"
        >
          {loading ? "Summarizing…" : "Summarize"}
        </button>
      </div>

      {error && <p className="text-xs text-[var(--wa-danger)]">{error}</p>}

      {sum && sum.raw && <p className="text-[13px] text-[var(--wa-text-secondary)]">{sum.raw}</p>}

      {sum && !sum.raw && (
        <div className="space-y-2 text-[13px] max-h-56 overflow-y-auto">
          {sum.overview && <p className="font-medium">{sum.overview}</p>}
          {sum.points?.length > 0 && (
            <ul className="list-disc pl-5 space-y-1">
              {sum.points.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
          )}
          {sum.needsReply?.length > 0 && (
            <div className="rounded-md bg-[var(--wa-panel)] border-l-4 border-[var(--wa-green)] px-3 py-2">
              <p className="text-xs font-semibold text-[var(--wa-green)] mb-1">Needs your reply</p>
              <ul className="list-disc pl-4 space-y-1">
                {sum.needsReply.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            </div>
          )}
          {sum.needsReply?.length === 0 && (
            <p className="text-xs text-[var(--wa-text-secondary)]">Nothing needs a reply.</p>
          )}
        </div>
      )}

      <p className="mt-2 text-[10px] text-[var(--wa-text-secondary)]">
        AI-generated. The messages being summarized are sent to a third-party AI service (Groq or Google Gemini) to write this.
      </p>
    </div>
  );
}
