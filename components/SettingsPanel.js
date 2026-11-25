"use client";

import { useMemo, useRef, useState } from "react";
import { Search, Monitor, CircleUser, KeyRound, Lock, MessageSquareText, Video, Bell, Keyboard, HelpCircle, LogOut } from "lucide-react";
import Avatar from "./Avatar";
import api from "@/lib/api";

export const SETTINGS_SECTIONS = [
  { id: "general", icon: Monitor, title: "General", subtitle: "Startup and display" },
  { id: "profile", icon: CircleUser, title: "Profile", subtitle: "Name, profile picture, username" },
  { id: "account", icon: KeyRound, title: "Account", subtitle: "App lock, account info" },
  { id: "privacy", icon: Lock, title: "Privacy", subtitle: "Blocked contacts" },
  { id: "chats", icon: MessageSquareText, title: "Chats", subtitle: "Theme, chat settings" },
  { id: "video", icon: Video, title: "Video & voice", subtitle: "Camera, microphone & speakers" },
  { id: "notifications", icon: Bell, title: "Notifications", subtitle: "Messages, groups, sounds" },
  { id: "shortcuts", icon: Keyboard, title: "Keyboard shortcuts", subtitle: "Quick actions" },
  { id: "help", icon: HelpCircle, title: "Help and feedback", subtitle: "Help centre and tips" }
];

// The settings list that replaces the chat list when you click your profile
// picture. Picking a row opens that page in the main area.
export default function SettingsPanel({ user, section, onSelect, onLogout, onUpdateUser }) {
  const [query, setQuery] = useState("");
  const [editingMood, setEditingMood] = useState(false);
  const [mood, setMood] = useState("");
  const moodRef = useRef(null);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? SETTINGS_SECTIONS.filter((s) => `${s.title} ${s.subtitle}`.toLowerCase().includes(q)) : SETTINGS_SECTIONS;
  }, [query]);

  function startMood() {
    setMood(user?.bio || "");
    setEditingMood(true);
    setTimeout(() => moodRef.current?.focus(), 0);
  }

  async function saveMood() {
    setEditingMood(false);
    const next = mood.trim().slice(0, 140);
    if (next === (user?.bio || "")) return;
    try {
      const { data } = await api.patch("/users/me", { bio: next });
      onUpdateUser(data.user);
    } catch {
      /* keep the old one */
    }
  }

  return (
    <div className="w-full h-full flex flex-col bg-[var(--wa-panel)] border-r border-[var(--wa-border)]">
      <div className="px-5 pt-5 pb-3">
        <h1 className="text-xl font-semibold text-[var(--wa-text-primary)] truncate">{user?.name}</h1>
      </div>

      <div className="px-4 pb-3">
        <div className="flex items-center bg-[var(--wa-panel-header)] rounded-full px-4 py-2 border border-transparent focus-within:border-[var(--wa-green)]">
          <Search size={16} className="text-[var(--wa-icon)] mr-3" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search settings"
            className="bg-transparent outline-none text-sm w-full text-[var(--wa-text-primary)]"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {!query.trim() && (
          <div className="flex flex-col items-center pt-3 pb-5 px-6">
            {editingMood ? (
              <input
                ref={moodRef}
                value={mood}
                onChange={(e) => setMood(e.target.value)}
                onBlur={saveMood}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                  if (e.key === "Escape") {
                    setMood(user?.bio || "");
                    setEditingMood(false);
                  }
                }}
                maxLength={140}
                placeholder="Current mood"
                className="mb-3 w-full max-w-[240px] text-center text-sm rounded-full px-4 py-2 bg-[var(--wa-panel-header)] border border-[var(--wa-green)] outline-none text-[var(--wa-text-primary)]"
              />
            ) : (
              <button
                onClick={startMood}
                title="Edit your status"
                className="relative mb-3 max-w-[240px] rounded-full px-4 py-2 text-sm bg-[var(--wa-panel-header)] text-[var(--wa-text-secondary)] hover:bg-[var(--wa-border)] truncate"
              >
                {user?.bio || "Current mood"}
                <span className="absolute left-1/2 -bottom-1 w-2.5 h-2.5 -translate-x-1/2 rotate-45 bg-[var(--wa-panel-header)]" />
              </button>
            )}
            <Avatar name={user?.name} color={user?.avatarColor} avatarUrl={user?.avatarUrl} size={104} />
          </div>
        )}

        {shown.map((s) => {
          const Icon = s.icon;
          const active = section === s.id;
          return (
            <button
              key={s.id}
              onClick={() => onSelect(s.id)}
              className={`w-full flex items-center gap-5 px-6 py-3 text-left hover:bg-[var(--wa-sidebar-hover)] ${
                active ? "bg-[var(--wa-panel-header)]" : ""
              }`}
            >
              <Icon size={22} className="text-[var(--wa-icon)] shrink-0" />
              <div className="min-w-0">
                <p className="text-[15px] text-[var(--wa-text-primary)]">{s.title}</p>
                <p className="text-xs text-[var(--wa-text-secondary)] leading-snug">{s.subtitle}</p>
              </div>
            </button>
          );
        })}
        {shown.length === 0 && <p className="text-center text-sm text-[var(--wa-text-secondary)] mt-8">No settings match.</p>}

        {!query.trim() && (
          <>
            <div className="mx-6 my-2 border-t border-[var(--wa-border)]" />
            <button
              onClick={onLogout}
              className="w-full flex items-center gap-5 px-6 py-3 text-left hover:bg-[var(--wa-sidebar-hover)] text-[var(--wa-danger)]"
            >
              <LogOut size={22} className="shrink-0" />
              <span className="text-[15px]">Log out</span>
            </button>
          </>
        )}
      </div>
    </div>
  );
}
