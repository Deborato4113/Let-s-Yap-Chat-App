"use client";

import { useState, useMemo } from "react";
import { MessageSquarePlus, MoreVertical, Search, LogOut, User as UserIcon, Palette, BellOff } from "lucide-react";
import Avatar from "./Avatar";
import ThemeModal from "./ThemeModal";
import { formatListTime } from "@/lib/utils";
import { useAuth } from "@/lib/AuthContext";

export default function Sidebar({
  conversations,
  activeId,
  onSelect,
  onOpenNewChat,
  onOpenProfile,
  presence
}) {
  const { user, logout } = useAuth();
  const [query, setQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [showTheme, setShowTheme] = useState(false);

  const filtered = useMemo(() => {
    if (!query.trim()) return conversations;
    const q = query.toLowerCase();
    return conversations.filter((c) => {
      const label = c.isGroup ? c.groupName : c.peer?.name || "";
      return label.toLowerCase().includes(q);
    });
  }, [conversations, query]);

  return (
    <div className="w-full h-full flex flex-col bg-[var(--wa-panel)] border-r border-[var(--wa-border)]">
      <div className="flex items-center justify-between px-4 py-2.5 bg-[var(--wa-panel-header)] h-16">
        <button onClick={onOpenProfile} className="rounded-full">
          <Avatar name={user?.name} color={user?.avatarColor} avatarUrl={user?.avatarUrl} size={40} />
        </button>
        <div className="flex items-center gap-1 text-[var(--wa-icon)]">
          <button
            onClick={onOpenNewChat}
            title="New chat"
            className="p-2 rounded-full hover:bg-[var(--wa-border)]"
          >
            <MessageSquarePlus size={20} />
          </button>
          <div className="relative">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              title="Menu"
              className="p-2 rounded-full hover:bg-[var(--wa-border)]"
            >
              <MoreVertical size={20} />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-10 bg-[var(--wa-panel)] shadow-lg rounded-md py-1 w-44 z-20 text-sm">
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    onOpenProfile();
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-[var(--wa-sidebar-hover)] flex items-center gap-2 text-[var(--wa-text-primary)]"
                >
                  <UserIcon size={16} /> Profile
                </button>
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    setShowTheme(true);
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-[var(--wa-sidebar-hover)] flex items-center gap-2 text-[var(--wa-text-primary)]"
                >
                  <Palette size={16} /> Theme
                </button>
                <button
                  onClick={logout}
                  className="w-full text-left px-3 py-2 hover:bg-[var(--wa-sidebar-hover)] flex items-center gap-2 text-[var(--wa-danger)]"
                >
                  <LogOut size={16} /> Log out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="px-3 py-2 border-b border-[var(--wa-border)]">
        <div className="flex items-center bg-[var(--wa-panel-header)] rounded-lg px-3 py-1.5">
          <Search size={16} className="text-[var(--wa-icon)] mr-3" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search or start a new chat"
            className="bg-transparent outline-none text-sm w-full text-[var(--wa-text-primary)] py-1"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 && (
          <div className="text-center text-sm text-[var(--wa-text-secondary)] mt-10 px-6">
            No chats yet. Click the <MessageSquarePlus size={14} className="inline" /> icon to start one.
          </div>
        )}
        {filtered.map((c) => {
          const label = c.isGroup ? c.groupName : c.peer?.name || "Unknown";
          const color = c.isGroup ? c.groupAvatarColor : c.peer?.avatarColor;
          const avatarUrl = c.isGroup ? "" : c.peer?.avatarUrl;
          const isOnline = !c.isGroup && presence[c.peer?.id] === "online";
          return (
            <button
              key={c.id}
              onClick={() => onSelect(c)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 border-b border-[var(--wa-panel-header)] hover:bg-[var(--wa-sidebar-hover)] text-left ${
                activeId === c.id ? "bg-[var(--wa-panel-header)]" : ""
              }`}
            >
              <Avatar name={label} color={color} avatarUrl={avatarUrl} size={48} isGroup={c.isGroup} online={isOnline} showStatus />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-[var(--wa-text-primary)] truncate">{label}</p>
                  <span className="text-xs text-[var(--wa-text-secondary)] shrink-0 ml-2">
                    {formatListTime(c.lastMessage?.timestamp)}
                  </span>
                </div>
                <div className="flex items-center justify-between mt-0.5">
                  <p className="text-xs text-[var(--wa-text-secondary)] truncate max-w-[180px]">
                    {c.lastMessagePreview || "Say hi 👋"}
                  </p>
                  <div className="flex items-center gap-1.5 ml-2 shrink-0">
                    {c.muted && <BellOff size={13} className="text-[var(--wa-text-muted)]" />}
                    {c.unreadCount > 0 && (
                      <span className="bg-[var(--wa-green)] text-white text-[10px] font-semibold rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center">
                        {c.unreadCount}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {showTheme && <ThemeModal onClose={() => setShowTheme(false)} />}
    </div>
  );
}
