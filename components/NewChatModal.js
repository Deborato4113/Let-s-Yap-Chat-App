"use client";

import { useEffect, useState } from "react";
import { X, Search, Users, MessageSquarePlus } from "lucide-react";
import api from "@/lib/api";
import Avatar from "./Avatar";

export default function NewChatModal({ onClose, onStartDm, onCreateGroup }) {
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState("list"); // 'list' | 'group'
  const [groupName, setGroupName] = useState("");
  const [selected, setSelected] = useState([]);

  useEffect(() => {
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const { data } = await api.get("/users", { params: { q: query } });
        if (active) setUsers(data);
      } finally {
        if (active) setLoading(false);
      }
    }, 200);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [query]);

  function toggleSelected(u) {
    setSelected((prev) =>
      prev.find((x) => x.id === u.id) ? prev.filter((x) => x.id !== u.id) : [...prev, u]
    );
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 pt-16" onClick={onClose}>
      <div
        className="bg-[var(--wa-panel)] rounded-lg shadow-xl w-full max-w-md overflow-hidden animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-[var(--wa-green-dark)] text-white px-4 py-4 flex items-center justify-between">
          <h2 className="font-medium text-lg">{mode === "group" ? "New group" : "New chat"}</h2>
          <button onClick={onClose} className="p-1 hover:bg-white/10 rounded-full">
            <X size={20} />
          </button>
        </div>

        <div className="p-3 border-b border-[var(--wa-border)]">
          <div className="flex items-center bg-[var(--wa-panel-header)] rounded-lg px-3 py-2">
            <Search size={16} className="text-[var(--wa-icon)] mr-2" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name or username"
              className="bg-transparent outline-none text-sm w-full text-[var(--wa-text-primary)]"
            />
          </div>
        </div>

        {mode === "list" && (
          <button
            onClick={() => setMode("group")}
            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[var(--wa-sidebar-hover)] text-left"
          >
            <div className="w-10 h-10 rounded-full bg-[var(--wa-green)] flex items-center justify-center text-white">
              <Users size={18} />
            </div>
            <span className="text-sm font-medium text-[var(--wa-text-primary)]">New group</span>
          </button>
        )}

        {mode === "group" && (
          <div className="px-4 py-3 border-b border-[var(--wa-border)]">
            <input
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="Group name"
              className="w-full border border-[var(--wa-border-light)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--wa-green)]"
            />
            {selected.length > 0 && (
              <p className="text-xs text-[var(--wa-text-secondary)] mt-2">{selected.length} member(s) selected</p>
            )}
          </div>
        )}

        <div className="max-h-80 overflow-y-auto">
          {loading && <p className="text-center text-sm text-[var(--wa-text-secondary)] py-6">Searching…</p>}
          {!loading && users.length === 0 && (
            <p className="text-center text-sm text-[var(--wa-text-secondary)] py-6">No users found.</p>
          )}
          {users.map((u) => {
            const isSelected = !!selected.find((x) => x.id === u.id);
            return (
              <button
                key={u.id}
                onClick={() => (mode === "group" ? toggleSelected(u) : onStartDm(u))}
                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--wa-sidebar-hover)] text-left"
              >
                <Avatar name={u.name} color={u.avatarColor} avatarUrl={u.avatarUrl} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-[var(--wa-text-primary)] truncate">{u.name}</p>
                  <p className="text-xs text-[var(--wa-text-secondary)] truncate">@{u.username}</p>
                </div>
                {mode === "group" && (
                  <div
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                      isSelected ? "bg-[var(--wa-green)] border-[var(--wa-green)]" : "border-[var(--wa-text-muted)]"
                    }`}
                  >
                    {isSelected && <span className="w-2 h-2 bg-[var(--wa-panel)] rounded-full" />}
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {mode === "group" && (
          <div className="p-3 border-t border-[var(--wa-border)] flex justify-end">
            <button
              disabled={!groupName.trim() || selected.length === 0}
              onClick={() => onCreateGroup(groupName.trim(), selected.map((s) => s.id))}
              className="flex items-center gap-2 bg-[var(--wa-green)] disabled:opacity-40 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-[var(--wa-green-dark)]"
            >
              <MessageSquarePlus size={16} /> Create group
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
