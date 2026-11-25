"use client";

import { useState, useMemo, useEffect } from "react";
import {
  MessageSquarePlus, Sparkles, MoreVertical, Search, LogOut, Palette, BellOff, Bell, Star, AtSign, Pin, Archive, ArchiveRestore,
  Users, CheckSquare, CheckCheck, Lock, Trash2, X, Check
} from "lucide-react";
import Avatar from "./Avatar";
import ThemeModal from "./ThemeModal";
import CallsPanel from "./CallsPanel";
import SettingsPanel from "./SettingsPanel";
import StatusBar from "./StatusBar";
import { formatListTime } from "@/lib/utils";
import { useAuth } from "@/lib/AuthContext";
import { clearAppLock } from "./AppLock";

const TITLES = { settings: "Settings", chats: "Chats", calls: "Calls", video: "Video calls", status: "Status", archived: "Archived" };

export default function Sidebar({
  conversations,
  activeId,
  onSelect,
  onOpenNewChat,
  onNewGroup,
  onMarkAllRead,
  onOpenAppLock,
  onBulkAction,
  onOpenStarred,
  onOpenAsk,
  drafts = {},
  onTogglePinChat,
  onToggleArchive,
  view = "chats",
  statusFeed,
  callsVersion = 0,
  callActive = false,
  onCall,
  onOpenChat,
  settingsSection,
  onSelectSettings,
  presence
}) {
  const { user, logout, updateUser } = useAuth();
  const [query, setQuery] = useState("");
  const [chipFilter, setChipFilter] = useState("all"); // all | unread | groups | favourites
  const [menuOpen, setMenuOpen] = useState(false);
  const [showTheme, setShowTheme] = useState(false);
  const [selecting, setSelecting] = useState(false); // "Select chats" mode
  const [selectedChats, setSelectedChats] = useState(() => new Set());

  // leaving the Chats / Archived tab ends selection
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelecting(false);
    setSelectedChats(new Set());
  }, [view]);

  function toggleChat(id) {
    setSelectedChats((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function exitSelecting() {
    setSelecting(false);
    setSelectedChats(new Set());
  }

  const filtered = useMemo(() => {
    const inView = conversations.filter((c) => (view === "archived" ? c.archived : !c.archived));
    const byChip = inView.filter((c) => {
      if (chipFilter === "unread") return c.unreadCount > 0 || c.hasUnreadMention;
      if (chipFilter === "groups") return c.isGroup;
      if (chipFilter === "favourites") return c.favourite;
      return true;
    });
    const base = !query.trim()
      ? byChip
      : byChip.filter((c) => {
          const label = c.isGroup ? c.groupName : c.peer?.name || "";
          return label.toLowerCase().includes(query.toLowerCase());
        });
    // Pinned chats stay on top (most recently pinned first); the rest keep their order
    const pinned = base.filter((c) => c.pinned).sort((a, b) => (b.pinnedAt || 0) - (a.pinnedAt || 0));
    return [...pinned, ...base.filter((c) => !c.pinned)];
  }, [conversations, query, view, chipFilter]);

  const picked = conversations.filter((c) => selectedChats.has(c.id));
  const allPinned = picked.length > 0 && picked.every((c) => c.pinned);
  const allMuted = picked.length > 0 && picked.every((c) => c.muted);
  const allFavourite = picked.length > 0 && picked.every((c) => c.favourite);
  const anyUnread = picked.some((c) => c.unreadCount > 0 || c.hasUnreadMention);

  function runBulk(action) {
    if (picked.length === 0) return;
    onBulkAction?.(action, picked, { pinned: !allPinned, muted: !allMuted, archived: view !== "archived", favourite: !allFavourite });
    exitSelecting();
  }

  // Profile picture clicked: the whole panel becomes the settings list
  if (view === "settings") {
    return (
      <SettingsPanel
        user={user}
        section={settingsSection}
        onSelect={onSelectSettings}
        onUpdateUser={updateUser}
        onLogout={() => {
          clearAppLock(user?.id);
          logout();
        }}
      />
    );
  }

  return (
    <div className="w-full h-full flex flex-col bg-[var(--wa-panel)] border-r border-[var(--wa-border)]">
      {selecting ? (
        <div className="flex items-center justify-between px-3 bg-[var(--wa-panel-header)] h-16">
          <div className="flex items-center gap-2 min-w-0">
            <button onClick={exitSelecting} title="Cancel" className="p-2 rounded-full hover:bg-[var(--wa-border)] text-[var(--wa-icon)]">
              <X size={20} />
            </button>
            <span className="text-sm font-medium text-[var(--wa-text-primary)] truncate">{selectedChats.size} selected</span>
          </div>
          <div className="flex items-center text-[var(--wa-icon)]">
            <button
              onClick={() => setSelectedChats(new Set(filtered.map((c) => c.id)))}
              title="Select all"
              className="p-2 rounded-full hover:bg-[var(--wa-border)]"
            >
              <CheckSquare size={19} />
            </button>
            {view !== "archived" && (
              <button
                onClick={() => runBulk("pin")}
                disabled={picked.length === 0}
                title={allPinned ? "Unpin" : "Pin"}
                className="p-2 rounded-full hover:bg-[var(--wa-border)] disabled:opacity-30"
              >
                <Pin size={19} />
              </button>
            )}
            <button
              onClick={() => runBulk("mute")}
              disabled={picked.length === 0}
              title={allMuted ? "Unmute" : "Mute"}
              className="p-2 rounded-full hover:bg-[var(--wa-border)] disabled:opacity-30"
            >
              {allMuted ? <Bell size={19} /> : <BellOff size={19} />}
            </button>
            <button
              onClick={() => runBulk("archive")}
              disabled={picked.length === 0}
              title={view === "archived" ? "Unarchive" : "Archive"}
              className="p-2 rounded-full hover:bg-[var(--wa-border)] disabled:opacity-30"
            >
              {view === "archived" ? <ArchiveRestore size={19} /> : <Archive size={19} />}
            </button>
            <button
              onClick={() => runBulk("favourite")}
              disabled={picked.length === 0}
              title={allFavourite ? "Remove from favourites" : "Add to favourites"}
              className="p-2 rounded-full hover:bg-[var(--wa-border)] disabled:opacity-30"
            >
              <Star size={19} className={allFavourite ? "fill-current" : ""} />
            </button>
            {anyUnread && (
              <button
                onClick={() => runBulk("read")}
                title="Mark as read"
                className="p-2 rounded-full hover:bg-[var(--wa-border)]"
              >
                <CheckCheck size={19} />
              </button>
            )}
            <button
              onClick={() => runBulk("delete")}
              disabled={picked.length === 0}
              title="Delete"
              className="p-2 rounded-full hover:bg-[var(--wa-border)] text-[var(--wa-danger)] disabled:opacity-30"
            >
              <Trash2 size={19} />
            </button>
          </div>
        </div>
      ) : (
      <div className="flex items-center justify-between px-4 py-2.5 bg-[var(--wa-panel-header)] h-16">
        <h1 className="text-xl font-semibold text-[var(--wa-text-primary)]">{TITLES[view]}</h1>
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
              <div className="absolute right-0 top-10 bg-[var(--wa-panel)] shadow-lg rounded-md py-1 w-52 z-20 text-sm">
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    onNewGroup?.();
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-[var(--wa-sidebar-hover)] flex items-center gap-2.5 text-[var(--wa-text-primary)]"
                >
                  <Users size={16} /> New group
                </button>
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    onOpenStarred?.();
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-[var(--wa-sidebar-hover)] flex items-center gap-2.5 text-[var(--wa-text-primary)]"
                >
                  <Star size={16} /> Starred messages
                </button>
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    onOpenAsk?.();
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-[var(--wa-sidebar-hover)] flex items-center gap-2.5 text-[var(--wa-text-primary)]"
                >
                  <Sparkles size={16} /> Ask your chats
                </button>
                {(view === "chats" || view === "archived") && (
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    setSelecting(true);
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-[var(--wa-sidebar-hover)] flex items-center gap-2.5 text-[var(--wa-text-primary)]"
                >
                  <CheckSquare size={16} /> Select chats
                </button>
                )}
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    onMarkAllRead?.();
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-[var(--wa-sidebar-hover)] flex items-center gap-2.5 text-[var(--wa-text-primary)]"
                >
                  <CheckCheck size={16} /> Mark all as read
                </button>
                <div className="my-1 border-t border-[var(--wa-border)]" />
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    onOpenAppLock?.();
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-[var(--wa-sidebar-hover)] flex items-center gap-2.5 text-[var(--wa-text-primary)]"
                >
                  <Lock size={16} /> App lock
                </button>
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    setShowTheme(true);
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-[var(--wa-sidebar-hover)] flex items-center gap-2.5 text-[var(--wa-text-primary)]"
                >
                  <Palette size={16} /> Theme
                </button>
                <button
                  onClick={() => {
                    clearAppLock(user?.id); // the PIN is per-device and can't outlive the login
                    logout();
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-[var(--wa-sidebar-hover)] flex items-center gap-2 text-[var(--wa-danger)]"
                >
                  <LogOut size={16} /> Log out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      )}

      {view !== "status" && (
      <div className="px-3 py-2 border-b border-[var(--wa-border)]">
        <div className="flex items-center bg-[var(--wa-panel-header)] rounded-lg px-3 py-1.5">
          <Search size={16} className="text-[var(--wa-icon)] mr-3" />
          <input
            data-chat-search
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={view === "calls" || view === "video" ? "Search calls" : view === "archived" ? "Search archived chats" : "Search or start a new chat"}
            className="bg-transparent outline-none text-sm w-full text-[var(--wa-text-primary)] py-1"
          />
        </div>
      </div>
      )}

      {(view === "chats" || view === "archived") && (
        <div className="flex gap-2 px-3 py-2 border-b border-[var(--wa-border)] overflow-x-auto" role="tablist" aria-label="Filter chats">
          {[["all", "All"], ["unread", "Unread"], ["groups", "Groups"], ["favourites", "Favourites"]].map(([key, label]) => (
            <button
              key={key}
              role="tab"
              aria-selected={chipFilter === key}
              onClick={() => setChipFilter(key)}
              className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                chipFilter === key
                  ? "bg-[var(--wa-green)] text-white border-[var(--wa-green)]"
                  : "border-[var(--wa-border)] text-[var(--wa-text-secondary)] hover:bg-[var(--wa-sidebar-hover)]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {view === "status" && <StatusBar statusFeed={statusFeed} />}

      {(view === "calls" || view === "video") && (
        <CallsPanel
          kind={view === "video" ? "video" : "audio"}
          query={query}
          version={callsVersion}
          callActive={callActive}
          onCall={onCall}
          onOpenChat={onOpenChat}
          presence={presence}
        />
      )}

      {(view === "chats" || view === "archived") && (
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 && (
          <div className="text-center text-sm text-[var(--wa-text-secondary)] mt-10 px-6">
            {query.trim() || chipFilter !== "all" ? (
              chipFilter === "favourites" && !query.trim()
                ? "No favourites yet. Open a chat's menu and choose Add to favourites."
                : "No chats match."
            ) : view === "archived" ? (
              "No archived chats. Archive a chat from its hover button or menu to tuck it away here."
            ) : (
              <>
                No chats yet. Click the <MessageSquarePlus size={14} className="inline" /> icon to start one.
              </>
            )}
          </div>
        )}
        {filtered.map((c) => {
          const label = c.isGroup ? c.groupName : c.peer?.name || "Unknown";
          const color = c.isGroup ? c.groupAvatarColor : c.peer?.avatarColor;
          const avatarUrl = c.isGroup ? c.groupAvatarUrl : c.peer?.avatarUrl;
          const isBot = !c.isGroup && !!c.peer?.isBot;
          const isOnline = !c.isGroup && !c.peerHidden && presence[c.peer?.id] === "online";
          return (
            <button
              key={c.id}
              onClick={() => (selecting ? toggleChat(c.id) : onSelect(c))}
              className={`group w-full flex items-center gap-3 px-3 py-2.5 border-b border-[var(--wa-panel-header)] hover:bg-[var(--wa-sidebar-hover)] text-left ${
                activeId === c.id && !selecting ? "bg-[var(--wa-panel-header)]" : ""
              } ${selecting && selectedChats.has(c.id) ? "bg-[var(--wa-sidebar-hover)]" : ""}`}
            >
              {selecting && (
                <span
                  className={`w-5 h-5 shrink-0 rounded-full border-2 flex items-center justify-center ${
                    selectedChats.has(c.id) ? "bg-[var(--wa-green)] border-[var(--wa-green)] text-white" : "border-[var(--wa-text-muted)]"
                  }`}
                >
                  {selectedChats.has(c.id) && <Check size={12} strokeWidth={3} />}
                </span>
              )}
              <Avatar
                name={label}
                color={color}
                avatarUrl={avatarUrl}
                size={48}
                isGroup={c.isGroup}
                isBot={isBot}
                online={isOnline}
                showStatus={!isBot}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-[var(--wa-text-primary)] truncate">{label}</p>
                  <span className="text-xs text-[var(--wa-text-secondary)] shrink-0 ml-2">
                    {formatListTime(c.lastMessage?.timestamp)}
                  </span>
                </div>
                <div className="flex items-center justify-between mt-0.5">
                  <p className="text-xs text-[var(--wa-text-secondary)] truncate max-w-[180px]">
                    {drafts[c.id] && String(c.id) !== String(activeId) ? (
                      <>
                        <span className="text-[var(--wa-green)] font-medium">Draft: </span>
                        {drafts[c.id]}
                      </>
                    ) : (
                      c.lastMessagePreview || "Say hi 👋"
                    )}
                  </p>
                  <div className="flex items-center gap-1.5 ml-2 shrink-0">
                    {c.muted && <BellOff size={13} className="text-[var(--wa-text-muted)]" />}
                    <span
                      role="button"
                      tabIndex={0}
                      title={c.archived ? "Unarchive chat" : "Archive chat"}
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleArchive?.(c);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.stopPropagation();
                          onToggleArchive?.(c);
                        }
                      }}
                      className={`${selecting ? "!hidden" : "hidden group-hover:inline-flex"} text-[var(--wa-text-muted)] hover:text-[var(--wa-text-primary)]`}
                    >
                      {c.archived ? <ArchiveRestore size={13} /> : <Archive size={13} />}
                    </span>
                    {!c.archived && (
                    <span
                      role="button"
                      tabIndex={0}
                      title={c.pinned ? "Unpin chat" : "Pin chat"}
                      onClick={(e) => {
                        e.stopPropagation();
                        onTogglePinChat?.(c);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.stopPropagation();
                          onTogglePinChat?.(c);
                        }
                      }}
                      className={`${selecting ? "pointer-events-none" : ""} ${c.pinned ? "" : "hidden group-hover:inline-flex"} text-[var(--wa-text-muted)] hover:text-[var(--wa-text-primary)]`}
                    >
                      <Pin size={13} className={c.pinned ? "fill-current rotate-45" : ""} />
                    </span>
                    )}
                    {c.hasUnreadMention && (
                      <span
                        title="You were mentioned"
                        className="bg-[var(--wa-green)] text-white rounded-full w-[18px] h-[18px] flex items-center justify-center"
                      >
                        <AtSign size={11} strokeWidth={3} />
                      </span>
                    )}
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
      )}

      {showTheme && <ThemeModal onClose={() => setShowTheme(false)} />}
    </div>
  );
}
