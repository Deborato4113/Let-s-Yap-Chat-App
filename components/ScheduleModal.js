"use client";

import { useEffect, useState } from "react";
import { X, Trash2, Clock } from "lucide-react";
import api from "@/lib/api";

// datetime-local wants "YYYY-MM-DDTHH:mm" in LOCAL time.
function toLocalInput(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function quickTimes() {
  const now = new Date();
  const inOneHour = new Date(now.getTime() + 60 * 60 * 1000);
  const tomorrow9 = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 9, 0);
  const tonight = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 20, 0);
  const list = [{ label: "In 1 hour", date: inOneHour }];
  if (tonight.getTime() > now.getTime() + 5 * 60 * 1000) list.push({ label: "Tonight 8 PM", date: tonight });
  list.push({ label: "Tomorrow 9 AM", date: tomorrow9 });
  return list;
}

function formatWhen(ts) {
  return new Date(ts).toLocaleString([], { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

// "Send later": write a message, pick a time, and the server sends it then -
// even if you've closed the app. Pending ones for this chat are listed below
// and can be cancelled.
export default function ScheduleModal({ conversationId, initialText = "", onClose, onScheduled }) {
  const [text, setText] = useState(initialText);
  const [when, setWhen] = useState(() => toLocalInput(new Date(Date.now() + 60 * 60 * 1000)));
  const [pending, setPending] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function loadPending() {
    try {
      const { data } = await api.get("/scheduled", { params: { conversationId } });
      setPending(data.scheduled || []);
    } catch {
      /* list is a convenience */
    }
  }

  useEffect(() => {
    loadPending();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  async function submit(e) {
    e.preventDefault();
    setError("");
    const sendAt = new Date(when).getTime();
    if (!text.trim()) return setError("Type the message to schedule.");
    if (!Number.isFinite(sendAt) || sendAt < Date.now() + 60 * 1000) return setError("Pick a time at least a minute from now.");
    setBusy(true);
    try {
      await api.post("/scheduled", { conversationId, text: text.trim(), sendAt });
      onScheduled?.();
      setText("");
      await loadPending();
    } catch (err) {
      setError(err.response?.data?.message || "Couldn't schedule that message.");
    } finally {
      setBusy(false);
    }
  }

  async function cancel(id) {
    try {
      await api.delete(`/scheduled/${id}`);
    } catch {
      /* already sent - the list refresh below shows it */
    }
    loadPending();
  }

  return (
    <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center px-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-[var(--wa-panel)] rounded-lg shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto animate-fade-in"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--wa-border)]">
          <h3 className="text-base font-medium text-[var(--wa-text-primary)] flex items-center gap-2">
            <Clock size={18} className="text-[var(--wa-green)]" /> Schedule message
          </h3>
          <button onClick={onClose} className="p-1 text-[var(--wa-icon)]" title="Close">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={submit} className="px-5 py-4 space-y-3">
          <textarea
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            maxLength={10000}
            placeholder="Message to send later"
            className="w-full border border-[var(--wa-border-light)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--wa-green)] bg-transparent text-[var(--wa-text-primary)] resize-none"
          />
          <div>
            <label className="block text-xs font-medium text-[var(--wa-text-secondary)] mb-1.5">Send at</label>
            <input
              type="datetime-local"
              value={when}
              min={toLocalInput(new Date(Date.now() + 60 * 1000))}
              onChange={(e) => setWhen(e.target.value)}
              className="w-full border border-[var(--wa-border-light)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--wa-green)] bg-transparent text-[var(--wa-text-primary)]"
            />
            <div className="flex flex-wrap gap-2 mt-2">
              {quickTimes().map((q) => (
                <button
                  type="button"
                  key={q.label}
                  onClick={() => setWhen(toLocalInput(q.date))}
                  className="text-xs px-2.5 py-1 rounded-full border border-[var(--wa-border-light)] text-[var(--wa-text-secondary)] hover:bg-[var(--wa-sidebar-hover)]"
                >
                  {q.label}
                </button>
              ))}
            </div>
          </div>
          {error && <p className="text-sm text-[var(--wa-danger)]">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="w-full py-2 text-sm font-medium text-white bg-[var(--wa-green)] rounded-lg hover:bg-[var(--wa-green-dark)] disabled:opacity-60"
          >
            {busy ? "Scheduling…" : "Schedule"}
          </button>
        </form>

        {pending.length > 0 && (
          <div className="border-t border-[var(--wa-border)]">
            <p className="px-5 pt-3 pb-1 text-xs font-medium text-[var(--wa-text-secondary)]">Scheduled in this chat</p>
            {pending.map((p) => (
              <div key={p.id} className="flex items-center gap-3 px-5 py-2.5 border-t border-[var(--wa-border)] first:border-t-0">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-[var(--wa-text-primary)] truncate">{p.text}</p>
                  <p className="text-xs text-[var(--wa-green)]">{formatWhen(p.sendAt)}</p>
                </div>
                <button onClick={() => cancel(p.id)} className="p-1.5 text-[var(--wa-icon)] hover:text-[var(--wa-danger)]" title="Cancel">
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
