"use client";

import { Check } from "lucide-react";

// A poll inside a message bubble. Votes are public in the group: hover an
// option to see who picked it.
export default function PollMessage({ message, currentUserId, onVote, nameById = {} }) {
  const poll = message.poll;
  if (!poll) return <p className="text-sm text-[var(--wa-text-secondary)] pr-12">{message.text}</p>;

  const me = String(currentUserId);
  const voters = new Set(poll.options.flatMap((o) => o.voters));
  const totalVoters = voters.size;
  const mostVotes = Math.max(0, ...poll.options.map((o) => o.voters.length));

  return (
    <div className="pr-1 pb-0.5">
      <p className="text-sm font-medium text-[var(--wa-text-primary)] break-words">{poll.question}</p>
      <p className="text-[11px] text-[var(--wa-text-secondary)] mb-1.5">
        {poll.multiple ? "Select one or more" : "Select one"}
      </p>

      <div className="space-y-1.5">
        {poll.options.map((o) => {
          const mine = o.voters.includes(me);
          const pct = totalVoters ? Math.round((o.voters.length / totalVoters) * 100) : 0;
          const names = o.voters.map((v) => (String(v) === me ? "You" : nameById[v] || "Someone")).join(", ");
          return (
            <button
              key={o.id}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onVote(poll.id, o.id);
              }}
              title={names || "No votes yet"}
              className="w-full text-left"
            >
              <div className="flex items-start gap-2">
                <span
                  className={`mt-0.5 w-4 h-4 shrink-0 flex items-center justify-center border-2 ${
                    poll.multiple ? "rounded" : "rounded-full"
                  } ${mine ? "bg-[var(--wa-green)] border-[var(--wa-green)] text-white" : "border-[var(--wa-border-light)]"}`}
                >
                  {mine && <Check size={11} strokeWidth={3} />}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between gap-2 text-sm text-[var(--wa-text-primary)]">
                    <span className="break-words min-w-0">{o.text}</span>
                    <span className="shrink-0 text-xs text-[var(--wa-text-secondary)]">{o.voters.length}</span>
                  </div>
                  <div className="h-1.5 mt-1 rounded-full bg-black/10 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        o.voters.length > 0 && o.voters.length === mostVotes ? "bg-[var(--wa-green)]" : "bg-[var(--wa-green)]/50"
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <p className="text-[11px] text-[var(--wa-text-secondary)] mt-1.5">
        {totalVoters === 0 ? "No votes yet" : `${totalVoters} ${totalVoters === 1 ? "person has" : "people have"} voted`}
      </p>
    </div>
  );
}
