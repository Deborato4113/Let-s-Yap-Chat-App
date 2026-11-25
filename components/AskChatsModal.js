"use client";

import { useState } from "react";
import { X, Sparkles, Search } from "lucide-react";
import api from "@/lib/api";

// "Ask your chats": a question answered from your own messages.
export default function AskChatsModal({ onClose, onOpenSource }) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState(null);
  const [error, setError] = useState("");

  async function ask() {
    if (q.trim().length < 3 || busy) return;
    setBusy(true); setError(""); setRes(null);
    try {
      const { data } = await api.post("/ai/ask", { question: q.trim() });
      setRes(data);
    } catch (err) {
      setError(err.response?.data?.message || "Couldn't answer that.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4" onClick={onClose}>
      <div className="bg-[var(--wa-panel)] rounded-xl shadow-xl w-full max-w-md max-h-[85vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()} data-testid="ask-modal">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--wa-border-light)]">
          <h3 className="text-sm font-semibold text-[var(--wa-text-primary)] flex items-center gap-2"><Sparkles size={16} className="text-[var(--wa-green)]" /> Ask your chats</h3>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-[var(--wa-panel-header)] text-[var(--wa-icon)]"><X size={18} /></button>
        </div>
        <div className="p-4 space-y-3 overflow-y-auto">
          <div className="flex items-center gap-2">
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && ask()}
              placeholder="What was the address Ravi sent last week?"
              aria-label="Your question"
              className="flex-1 border border-[var(--wa-border-light)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--wa-green)] bg-transparent text-[var(--wa-text-primary)]"
            />
            <button onClick={ask} disabled={busy || q.trim().length < 3} className="bg-[var(--wa-green)] text-white rounded-lg px-3 py-2 disabled:opacity-50" title="Ask">
              <Search size={16} />
            </button>
          </div>
          <p className="text-xs text-[var(--wa-text-secondary)] leading-snug">
            Yap AI looks through your own chats and reads the messages that match your words to answer. Only you see the answer.
          </p>
          {busy && <p className="text-sm text-[var(--wa-text-secondary)]">Searching your chats…</p>}
          {error && <p className="text-sm text-[var(--wa-danger)]">{error}</p>}
          {res && (
            <div className="space-y-3" data-testid="ask-answer">
              <p className="text-sm text-[var(--wa-text-primary)] whitespace-pre-wrap">{res.answer}</p>
              {res.sources?.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-[var(--wa-green)] mb-1">Messages it used</p>
                  <ul className="space-y-1">
                    {res.sources.map((s) => (
                      <li key={s.id}>
                        <button onClick={() => onOpenSource(s)} className="w-full text-left rounded-md hover:bg-[var(--wa-sidebar-hover)] px-2 py-1.5 border border-[var(--wa-border-light)]">
                          <span className="block text-xs text-[var(--wa-text-secondary)]">{s.chat} · {s.sender} · {new Date(s.timestamp).toLocaleDateString()}</span>
                          <span className="block text-sm text-[var(--wa-text-primary)] truncate">{s.text}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
