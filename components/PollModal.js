"use client";

import { useState } from "react";
import { X, Plus, Trash2 } from "lucide-react";

// "Create poll": a question and 2-8 options.
export default function PollModal({ onClose, onCreate }) {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [multiple, setMultiple] = useState(false);
  const [error, setError] = useState("");

  function setOption(i, value) {
    setOptions((prev) => prev.map((o, idx) => (idx === i ? value : o)));
  }

  function submit(e) {
    e.preventDefault();
    const q = question.trim();
    const opts = [...new Set(options.map((o) => o.trim()).filter(Boolean))];
    if (!q) return setError("Ask a question first.");
    if (opts.length < 2) return setError("Add at least two different options.");
    onCreate({ question: q, options: opts, multiple });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center px-4" onClick={onClose}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="bg-[var(--wa-panel)] rounded-lg shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto animate-fade-in"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--wa-border)]">
          <h3 className="text-base font-medium text-[var(--wa-text-primary)]">Create poll</h3>
          <button type="button" onClick={onClose} className="p-1 text-[var(--wa-icon)]" title="Close">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-[var(--wa-text-secondary)] mb-1.5">Question</label>
            <input
              autoFocus
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              maxLength={300}
              placeholder="Where should we eat?"
              className="w-full border border-[var(--wa-border-light)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--wa-green)] bg-transparent text-[var(--wa-text-primary)]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--wa-text-secondary)] mb-1.5">Options</label>
            <div className="space-y-2">
              {options.map((o, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    value={o}
                    onChange={(e) => setOption(i, e.target.value)}
                    maxLength={120}
                    placeholder={`Option ${i + 1}`}
                    className="flex-1 border border-[var(--wa-border-light)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--wa-green)] bg-transparent text-[var(--wa-text-primary)]"
                  />
                  {options.length > 2 && (
                    <button
                      type="button"
                      onClick={() => setOptions((prev) => prev.filter((_, idx) => idx !== i))}
                      className="p-1.5 text-[var(--wa-icon)] hover:text-[var(--wa-danger)]"
                      title="Remove option"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {options.length < 8 && (
              <button
                type="button"
                onClick={() => setOptions((prev) => [...prev, ""])}
                className="mt-2 flex items-center gap-1.5 text-sm text-[var(--wa-green)] font-medium"
              >
                <Plus size={16} /> Add option
              </button>
            )}
          </div>

          <label className="flex items-center gap-2 text-sm text-[var(--wa-text-primary)] cursor-pointer">
            <input type="checkbox" checked={multiple} onChange={(e) => setMultiple(e.target.checked)} className="accent-[var(--wa-green)]" />
            Allow multiple answers
          </label>

          {error && <p className="text-sm text-[var(--wa-danger)]">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t border-[var(--wa-border)]">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-[var(--wa-text-secondary)] rounded-lg hover:bg-[var(--wa-sidebar-hover)]">
            Cancel
          </button>
          <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-[var(--wa-green)] rounded-lg hover:bg-[var(--wa-green-dark)]">
            Send poll
          </button>
        </div>
      </form>
    </div>
  );
}
