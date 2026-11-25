"use client";

import { useState } from "react";
import { X, Flag } from "lucide-react";
import api from "@/lib/api";

const REASONS = [
  ["spam", "Spam"],
  ["harassment", "Harassment or bullying"],
  ["inappropriate", "Inappropriate content"],
  ["scam", "Scam or fraud"],
  ["impersonation", "Pretending to be someone else"],
  ["other", "Something else"]
];

// target: { userId, userName, conversationId, messageId? }
export default function ReportModal({ target, canBlock = true, onClose }) {
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [alsoBlock, setAlsoBlock] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function submit() {
    if (!reason || busy) return;
    setBusy(true);
    setError("");
    try {
      await api.post("/reports", {
        userId: target.userId,
        conversationId: target.conversationId,
        messageId: target.messageId,
        reason,
        details
      });
      if (alsoBlock && target.userId) {
        await api.post("/users/block", { userId: target.userId, block: true }).catch(() => {});
      }
      setDone(true);
    } catch (err) {
      setError(err.response?.data?.message || "Couldn't send the report. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4" onClick={onClose}>
      <div className="bg-[var(--wa-panel)] rounded-xl shadow-xl w-full max-w-sm overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--wa-border-light)]">
          <h3 className="text-sm font-semibold text-[var(--wa-text-primary)] flex items-center gap-2">
            <Flag size={16} /> {target.messageId ? "Report message" : `Report ${target.userName || "user"}`}
          </h3>
          <button onClick={onClose} aria-label="Close" className="p-1 rounded-full hover:bg-[var(--wa-panel-header)] text-[var(--wa-icon)]">
            <X size={18} />
          </button>
        </div>
        {done ? (
          <div className="p-6 text-center">
            <p className="text-sm text-[var(--wa-text-primary)] mb-1">Report sent</p>
            <p className="text-xs text-[var(--wa-text-secondary)] mb-4">
              Thanks. {target.userName || "They"} won&apos;t be told that you reported them.
            </p>
            <button onClick={onClose} className="px-4 py-2 rounded-full bg-[var(--wa-green)] text-white text-sm">Done</button>
          </div>
        ) : (
          <div className="p-4 text-sm">
            <p className="text-xs text-[var(--wa-text-secondary)] mb-2">Why are you reporting this?</p>
            {REASONS.map(([key, label]) => (
              <label key={key} className="flex items-center gap-3 py-2 cursor-pointer text-[var(--wa-text-primary)]">
                <input type="radio" name="reason" checked={reason === key} onChange={() => setReason(key)} className="accent-[var(--wa-green)] w-4 h-4" />
                {label}
              </label>
            ))}
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value.slice(0, 500))}
              placeholder="Add details (optional)"
              rows={3}
              className="mt-2 w-full resize-none rounded-lg bg-[var(--wa-panel-header)] px-3 py-2 text-sm outline-none text-[var(--wa-text-primary)]"
            />
            {canBlock && target.userId && (
              <label className="flex items-center gap-3 mt-3 cursor-pointer text-[var(--wa-text-primary)]">
                <input type="checkbox" checked={alsoBlock} onChange={(e) => setAlsoBlock(e.target.checked)} className="accent-[var(--wa-green)] w-4 h-4" />
                Also block {target.userName || "this person"}
              </label>
            )}
            {error && <p className="text-xs text-[var(--wa-danger)] mt-2">{error}</p>}
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={onClose} className="px-4 py-2 rounded-full text-sm text-[var(--wa-text-secondary)] hover:bg-[var(--wa-sidebar-hover)]">Cancel</button>
              <button
                onClick={submit}
                disabled={!reason || busy}
                className="px-4 py-2 rounded-full bg-[var(--wa-danger)] text-white text-sm disabled:opacity-40"
              >
                {busy ? "Sending…" : "Send report"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
