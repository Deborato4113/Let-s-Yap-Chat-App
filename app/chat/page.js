"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/AuthContext";
import { getSocket } from "@/lib/socket";
import { useCall } from "@/lib/useCall";
import { useGroupCall } from "@/lib/useGroupCall";
import GroupCallModal from "@/components/GroupCallModal";
import api from "@/lib/api";
import Sidebar from "@/components/Sidebar";
import ChatWindow from "@/components/ChatWindow";
import NewChatModal from "@/components/NewChatModal";
import ProfileModal from "@/components/ProfileModal";
import CallModal from "@/components/CallModal";
import StarredPanel from "@/components/StarredPanel";
import AskChatsModal from "@/components/AskChatsModal";
import NavRail from "@/components/NavRail";
import SettingsDetail from "@/components/SettingsDetail";
import { applyPrefs, getPrefs, playMessageSound } from "@/lib/prefs";
import AppLockModal, { useAppLock, LockScreen, clearAppLock } from "@/components/AppLock";
import { useStatusFeed } from "@/lib/useStatusFeed";

function previewFor(message) {
  if (message.type === "image") return "📷 Photo";
  if (message.type === "video") return "🎥 Video";
  if (message.type === "audio") return "🎤 Voice message";
  if (message.type === "file") return "📄 Document";
  if (message.type === "poll") return `📊 ${message.text}`;
  if (message.type === "call") {
    const video = message.call?.kind === "video";
    const missed = message.call?.status === "missed";
    const declined = message.call?.status === "declined";
    return `${video ? "🎥" : "📞"} ${missed ? "Missed " : declined ? "Declined " : ""}${video ? "video call" : "voice call"}`;
  }
  return message.text;
}

// Does this group message @mention the signed-in user? (usernames are matched
// whole-word, case-insensitive; DMs never count)
let myUsername = "";
function isMentioned(message, convo) {
  if (!convo?.isGroup || !myUsername || message.type !== "text" || !message.text) return false;
  const esc = myUsername.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^A-Za-z0-9_])@${esc}(?![A-Za-z0-9_])`, "i").test(message.text);
}

export default function ChatPage() {
  const { user, token, loading, logout } = useAuth();
  const router = useRouter();

  const [conversations, setConversations] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [messagesByConvo, setMessagesByConvo] = useState({});
  const [hasMoreByConvo, setHasMoreByConvo] = useState({});
  const [typingByConvo, setTypingByConvo] = useState({});
  const [presence, setPresence] = useState({});
  const [showNewChat, setShowNewChat] = useState(false);
  const [newChatMode, setNewChatMode] = useState("list"); // "group" opens straight into New group
  const [showAppLock, setShowAppLock] = useState(false);
  const [settingsSection, setSettingsSection] = useState(null);
  const reopenDone = useRef(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showMobileChat, setShowMobileChat] = useState(false);
  const [socket, setSocket] = useState(null);
  const [pendingAiQuote, setPendingAiQuote] = useState(null);
  const [pendingPrivateQuote, setPendingPrivateQuote] = useState(null);
  const [showStarred, setShowStarred] = useState(false);
  const [view, setView] = useState("chats"); // chats | calls | video | status | archived
  const [callsVersion, setCallsVersion] = useState(0);
  const [jumpRequest, setJumpRequest] = useState(null);
  const [drafts, setDrafts] = useState({}); // unsent text per chat, synced across my devices
  const [showAsk, setShowAsk] = useState(false);
  const conversationsRef = useRef([]);

  const socketRef = useRef(null);
  const activeRef = useRef(null);
  const messagesByConvoRef = useRef({});
  const loadMessagesRef = useRef(null);
  const call = useCall(socket);
  const groupCall = useGroupCall(socket, user?.id);
  const anyCallActive = call.callState !== "idle" || groupCall.callState !== "idle";
  const statusFeed = useStatusFeed(socket, !!user);
  const appLock = useAppLock(user?.id);
  const appLockRef = useRef(appLock);
  appLockRef.current = appLock;
  myUsername = user?.username || "";

  // Derived (not a separate copy) so header actions like mute/block/clear
  // stay in sync the moment `conversations` updates.
  const activeConversation = conversations.find((c) => c.id === activeConversationId) || null;

  useEffect(() => {
    activeRef.current = activeConversation;
  }, [activeConversation]);

  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  // text size etc. from Settings, applied on load and whenever they change
  useEffect(() => {
    applyPrefs();
    const onPrefs = () => applyPrefs();
    window.addEventListener("yap-prefs", onPrefs);
    return () => window.removeEventListener("yap-prefs", onPrefs);
  }, []);

  // load conversations
  useEffect(() => {
    if (!user) return;
    api.get("/conversations").then(({ data }) => {
      setConversations(data);
      const initialPresence = {};
      data.forEach((c) => {
        if (c.peer) initialPresence[c.peer.id] = c.peer.status;
      });
      setPresence((prev) => ({ ...initialPresence, ...prev }));
    });
  }, [user]);

  // unsent drafts follow me across devices
  useEffect(() => {
    if (!user) return;
    api.get("/drafts").then(({ data }) => setDrafts(data.drafts || {})).catch(() => {});
  }, [user]);

  function applyDraft(conversationId, text) {
    setDrafts((prev) => {
      const next = { ...prev };
      if (text) next[String(conversationId)] = text;
      else delete next[String(conversationId)];
      return next;
    });
  }
  function saveDraft(conversationId, text) {
    applyDraft(conversationId, text);
    api.put(`/conversations/${conversationId}/draft`, { text }).catch(() => {});
  }

  // socket setup
  useEffect(() => {
    if (!token) return;
    const s = getSocket(token);
    socketRef.current = s;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSocket(s);

    s.on("new-message", (message) => {
      const convoId = String(message.conversation);
      if (message.type === "call") setCallsVersion((v) => v + 1);
      // Skip if we already have it: the same message can arrive twice (history
      // fetch racing the live event, or the event delivered via two rooms).
      setMessagesByConvo((prev) => {
        const existing = prev[convoId] || [];
        if (existing.some((m) => String(m.id) === String(message.id))) return prev;
        return { ...prev, [convoId]: [...existing, message] };
      });

      setConversations((prev) => {
        const idx = prev.findIndex((c) => String(c.id) === convoId);
        const isActive = activeRef.current && String(activeRef.current.id) === convoId;
        if (idx === -1) {
          // conversation not loaded yet (new incoming DM/group) - refetch list
          api.get("/conversations").then(({ data }) => setConversations(data));
          return prev;
        }
        const updated = [...prev];
        const isOwn = String(message.sender?.id) === String(user.id);
        // Completed / declined calls are just log entries: only missed calls count as unread
        const countsAsUnread = message.type === "system" ? false : message.type !== "call" || message.call?.status === "missed";
        const mentioned = isMentioned(message, updated[idx]);
        updated[idx] = {
          ...updated[idx],
          lastMessage: { text: message.text, type: message.type, timestamp: message.timestamp, sender: message.sender?.id },
          lastMessagePreview: previewFor(message),
          unreadCount: isActive || isOwn || !countsAsUnread ? 0 : (updated[idx].unreadCount || 0) + 1,
          hasUnreadMention: isActive ? false : updated[idx].hasUnreadMention || (!isOwn && mentioned)
        };
        const [item] = updated.splice(idx, 1);
        updated.unshift(item);
        return updated;
      });

      if (activeRef.current && String(activeRef.current.id) === convoId) {
        s.emit("mark-read", { conversationId: convoId });
      }

      // Sound + desktop notification for incoming messages (Settings > Notifications).
      // @mentions of you notify even if general message notifications are off.
      const convo = conversationsRef.current.find((c) => String(c.id) === convoId);
      if (
        convo &&
        String(message.sender?.id) !== String(user.id) &&
        message.type !== "call" &&
        message.type !== "system" &&
        typeof document !== "undefined"
      ) {
        const away = document.hidden || !activeRef.current || String(activeRef.current.id) !== convoId;
        if (away && !convo.muted) {
          playMessageSound();
          const prefs = getPrefs();
          const mentioned = isMentioned(message, convo);
          const wants = mentioned || (prefs.notifMessages && (!convo.isGroup || prefs.notifGroups));
          if (wants && typeof Notification !== "undefined" && Notification.permission === "granted") {
            try {
              const who = message.sender?.name || "Someone";
              const where = convo.isGroup ? convo.groupName || "a group" : "";
              new Notification(mentioned ? `${who} mentioned you${where ? ` in ${where}` : ""}` : convo.isGroup ? where : who, {
                body: `${convo.isGroup && !mentioned ? `${who}: ` : ""}${previewFor(message) || ""}`.slice(0, 140)
              });
            } catch {}
          }
        }
      }
    });

    s.on("draft-updated", ({ conversationId, text }) => applyDraft(conversationId, text));

    s.on("view-once-opened", ({ messageId, conversationId, userId: viewerId, views }) => {
      const cid = String(conversationId);
      setMessagesByConvo((prev) => {
        if (!prev[cid]) return prev;
        return {
          ...prev,
          [cid]: prev[cid].map((m) =>
            String(m.id) === String(messageId)
              ? { ...m, viewOnceViews: Math.max(m.viewOnceViews || 0, views || 0), viewOnceOpened: m.viewOnceOpened || String(viewerId) === String(user?.id) }
              : m
          )
        };
      });
    });

    s.on("message-edited", ({ id, conversation, text, editedAt }) => {
      const cid = String(conversation);
      setMessagesByConvo((prev) => {
        if (!prev[cid]) return prev;
        return { ...prev, [cid]: prev[cid].map((m) => (String(m.id) === String(id) ? { ...m, text, editedAt, flagged: false } : m)) };
      });
      setConversations((prev) =>
        prev.map((c) => {
          if (String(c.id) !== cid || !c.lastMessage) return c;
          const list = messagesByConvoRef.current?.[cid] || [];
          const last = list[list.length - 1];
          if (last && String(last.id) !== String(id)) return c;
          return { ...c, lastMessage: { ...c.lastMessage, text }, lastMessagePreview: text };
        })
      );
    });

    // Disappearing messages: the server deleted these; drop them and refresh previews
    s.on("messages-expired", ({ conversation, ids }) => {
      const cid = String(conversation);
      const gone = new Set(ids.map(String));
      setMessagesByConvo((prev) => (prev[cid] ? { ...prev, [cid]: prev[cid].filter((m) => !gone.has(String(m.id))) } : prev));
      api.get("/conversations").then(({ data }) => setConversations(data)).catch(() => {});
    });

    // Group changed (members, admins, name, photo, who can send): reload the list
    s.on("conversation-refresh", () => {
      api.get("/conversations").then(({ data }) => setConversations(data)).catch(() => {});
    });
    // I was removed from (or left) a group
    s.on("conversation-removed", ({ conversationId }) => {
      const cid = String(conversationId);
      setConversations((prev) => prev.filter((c) => String(c.id) !== cid));
      if (activeRef.current && String(activeRef.current.id) === cid) {
        setActiveConversationId(null);
        setShowMobileChat(false);
      }
    });

    // Someone changed this chat's timer
    s.on("conversation-updated", ({ conversationId, disappearingSeconds }) => {
      setConversations((prev) =>
        prev.map((c) => (String(c.id) === String(conversationId) && disappearingSeconds !== undefined ? { ...c, disappearingSeconds } : c))
      );
    });

    s.on("poll-updated", ({ messageId, conversation, poll }) => {
      const cid = String(conversation);
      setMessagesByConvo((prev) => {
        if (!prev[cid]) return prev;
        return { ...prev, [cid]: prev[cid].map((m) => (String(m.id) === String(messageId) ? { ...m, poll } : m)) };
      });
    });

    s.on("conversation-preview", ({ conversationId, lastMessage }) => {
      setConversations((prev) => {
        const idx = prev.findIndex((c) => String(c.id) === String(conversationId));
        if (idx === -1) return prev;
        const updated = [...prev];
        updated[idx] = { ...updated[idx], lastMessage };
        return updated;
      });
    });

    s.on("typing", ({ conversationId, userId, name, isTyping }) => {
      setTypingByConvo((prev) => {
        const list = prev[conversationId] || [];
        const filtered = list.filter((u) => u.userId !== userId);
        return {
          ...prev,
          [conversationId]: isTyping ? [...filtered, { userId, name }] : filtered
        };
      });
    });

    s.on("messages-read", ({ conversationId, userId }) => {
      setMessagesByConvo((prev) => {
        const list = prev[conversationId];
        if (!list) return prev;
        return {
          ...prev,
          [conversationId]: list.map((m) => ({
            ...m,
            readBy: m.readBy?.includes(userId) ? m.readBy : [...(m.readBy || []), userId]
          }))
        };
      });
    });

    s.on("presence", ({ userId, status, lastSeen }) => {
      setPresence((prev) => ({ ...prev, [userId]: status }));
      setConversations((prev) =>
        prev.map((c) => (c.peer && !c.peerHidden && String(c.peer.id) === String(userId) ? { ...c, peer: { ...c.peer, status, lastSeen } } : c))
      );
    });

    s.on("message-reaction", ({ messageId, reactions }) => {
      setMessagesByConvo((prev) => {
        const next = { ...prev };
        for (const key of Object.keys(next)) {
          next[key] = next[key].map((m) => (m.id === messageId ? { ...m, reactions } : m));
        }
        return next;
      });
    });

    s.on("message-pinned", ({ messageId, pinned }) => {
      setMessagesByConvo((prev) => {
        const next = { ...prev };
        for (const key of Object.keys(next)) {
          next[key] = next[key].map((m) => (m.id === messageId ? { ...m, pinned } : m));
        }
        return next;
      });
    });

    // Neutral nudge from the server (sent on block/unblock, to both people):
    // re-read the chat list and any already-open conversations so held-back
    // messages appear / disappear and profile pictures update live.
    s.on("message-flagged", ({ id, conversation }) => {
      setMessagesByConvo((prev) => ({
        ...prev,
        [conversation]: (prev[conversation] || []).map((m) => (m.id === id ? { ...m, flagged: true } : m))
      }));
    });

    s.on("chats-refresh", () => {
      api.get("/conversations").then(({ data }) => setConversations(data));
      Object.keys(messagesByConvoRef.current || {}).forEach((id) => loadMessagesRef.current?.(id));
    });

    s.on("message-deleted", ({ id, forEveryone }) => {
      setMessagesByConvo((prev) => {
        const next = { ...prev };
        for (const key of Object.keys(next)) {
          next[key] = next[key]
            .map((m) => (m.id === id ? (forEveryone ? { ...m, deletedForEveryone: true, text: "", fileData: "" } : m) : m))
            .filter((m) => forEveryone || m.id !== id);
        }
        return next;
      });
    });

    return () => {
      s.off("new-message");
      s.off("conversation-preview");
      s.off("typing");
      s.off("messages-read");
      s.off("presence");
      s.off("chats-refresh");
      s.off("message-flagged");
      s.off("message-edited");
      s.off("draft-updated");
      s.off("view-once-opened");
      s.off("poll-updated");
      s.off("messages-expired");
      s.off("conversation-refresh");
      s.off("conversation-removed");
      s.off("conversation-updated");
      s.off("message-deleted");
      s.off("message-reaction");
      s.off("message-pinned");
    };
  }, [token, user]);

  // Hide expired disappearing messages right away even before the server's purge arrives
  useEffect(() => {
    const t = setInterval(() => {
      const now = Date.now();
      setMessagesByConvo((prev) => {
        let changed = false;
        const next = {};
        for (const k of Object.keys(prev)) {
          const kept = prev[k].filter((m) => !m.expiresAt || m.expiresAt > now);
          if (kept.length !== prev[k].length) changed = true;
          next[k] = kept;
        }
        return changed ? next : prev;
      });
    }, 15000);
    return () => clearInterval(t);
  }, []);

  const loadMessages = useCallback(async (conversationId, before) => {
    try {
      const { data } = await api.get(`/conversations/${conversationId}/messages`, {
        params: before ? { before } : {}
      });
      setMessagesByConvo((prev) => {
        const existing = prev[conversationId] || [];
        let merged;
        if (before) {
          const have = new Set(existing.map((m) => String(m.id)));
          merged = [...data.messages.filter((m) => !have.has(String(m.id))), ...existing];
        } else {
          // Keep live messages that arrived while this fetch was in flight.
          const have = new Set(data.messages.map((m) => String(m.id)));
          merged = [...data.messages, ...existing.filter((m) => !have.has(String(m.id)) && m.timestamp > (data.messages.at(-1)?.timestamp ?? 0))];
        }
        return { ...prev, [conversationId]: merged };
      });
      setHasMoreByConvo((prev) => ({ ...prev, [conversationId]: data.hasMore }));
    } catch (err) {
      // Log the server's actual reason (e.g. "Conversation not found.") instead
      // of just letting axios throw an unhandled rejection that only shows a
      // bare status code - and don't leave messagesByConvo[conversationId]
      // unset, since that's what made every re-click on the same broken
      // conversation re-fire this same failing request.
      console.error(
        `Failed to load messages for conversation ${conversationId}:`,
        err.response?.status,
        err.response?.data?.message || err.message
      );
      setMessagesByConvo((prev) => ({ ...prev, [conversationId]: prev[conversationId] || [] }));
    }
  }, []);

  messagesByConvoRef.current = messagesByConvo;
  loadMessagesRef.current = loadMessages;

  // Settings > General > Reopen my last chat (desktop widths only; on a phone the list comes first)
  useEffect(() => {
    if (reopenDone.current || conversations.length === 0) return;
    reopenDone.current = true;
    if (!getPrefs().reopenLast || window.innerWidth < 768) return;
    let last = null;
    try {
      last = localStorage.getItem("yap_last_chat");
    } catch {}
    const convo = conversations.find((c) => String(c.id) === last && !c.archived);
    if (convo) selectConversation(convo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversations]);

  // Tapping a push notification: open that chat (?c=<id> on a fresh start, or a message from the service worker)
  const openFromNotificationRef = useRef(null);
  openFromNotificationRef.current = (id) => {
    const convo = conversations.find((c) => String(c.id) === String(id));
    if (convo) {
      setView("chats");
      selectConversation(convo);
      return true;
    }
    return false;
  };
  const pendingOpenRef = useRef(null);
  useEffect(() => {
    try {
      const c = new URLSearchParams(window.location.search).get("c");
      if (c) {
        pendingOpenRef.current = c;
        window.history.replaceState(null, "", window.location.pathname);
      }
    } catch {}
    function onMsg(e) {
      if (e.data?.type === "yap-open-chat") {
        if (!openFromNotificationRef.current(e.data.conversationId)) pendingOpenRef.current = e.data.conversationId;
      }
    }
    navigator.serviceWorker?.addEventListener("message", onMsg);
    return () => navigator.serviceWorker?.removeEventListener("message", onMsg);
  }, []);
  useEffect(() => {
    if (pendingOpenRef.current && conversations.length > 0 && openFromNotificationRef.current(pendingOpenRef.current)) {
      pendingOpenRef.current = null;
      reopenDone.current = true; // don't also reopen the last chat
    }
  }, [conversations]);

  // Keyboard shortcuts (listed in Settings > Keyboard shortcuts)
  useEffect(() => {
    function onKey(e) {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setView((v) => (v === "calls" || v === "video" || v === "status" || v === "settings" ? "chats" : v));
        setTimeout(() => document.querySelector("[data-chat-search]")?.focus(), 50);
      } else if (e.altKey && !e.ctrlKey && !e.metaKey && e.key.toLowerCase() === "n") {
        e.preventDefault();
        setNewChatMode("list");
        setShowNewChat(true);
      } else if (e.altKey && !e.ctrlKey && !e.metaKey && e.key.toLowerCase() === "l") {
        e.preventDefault();
        appLockRef.current?.lockNow();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function selectConversation(convo) {
    try {
      localStorage.setItem("yap_last_chat", String(convo.id));
    } catch {}
    setActiveConversationId(convo.id);
    setShowMobileChat(true);
    setConversations((prev) => prev.map((c) => (c.id === convo.id ? { ...c, unreadCount: 0, hasUnreadMention: false } : c)));
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
    socketRef.current?.emit("join-conversation", convo.id);
    if (!messagesByConvo[convo.id]) {
      loadMessages(convo.id);
    }
    socketRef.current?.emit("mark-read", { conversationId: convo.id });
  }

  function handleSend(payload) {
    if (!activeConversation) return;
    socketRef.current?.emit("send-message", { conversationId: activeConversation.id, ...payload }, (ack) => {
      if (ack?.error) alert(ack.error);
    });
  }

  function handleEditMessage(messageId, text) {
    return new Promise((resolve) => {
      if (!socketRef.current) return resolve({ error: "Not connected" });
      socketRef.current.emit("edit-message", { id: messageId, text }, (ack) => resolve(ack || {}));
    });
  }

  function handleVotePoll(pollId, optionId) {
    socketRef.current?.emit("vote-poll", { pollId, optionId }, (ack) => {
      if (ack?.error) alert(ack.error);
    });
  }

  // Tapping a starred message: open its chat and scroll to the message
  function handleOpenStarred(item) {
    const convo = conversationsRef.current.find((c) => String(c.id) === String(item.conversationId));
    if (!convo) return;
    setShowStarred(false);
    selectConversation(convo);
    setJumpRequest({ conversationId: convo.id, messageId: item.id, timestamp: item.timestamp });
  }

  function handleLoadMore() {
    if (!activeConversation) return;
    const list = messagesByConvo[activeConversation.id] || [];
    const earliest = list[0]?.timestamp;
    if (earliest) loadMessages(activeConversation.id, earliest);
  }

  // Used by in-chat search: make sure an old message (possibly many pages
  // above what's loaded) is in memory so the chat window can scroll to it.
  async function handleEnsureMessageLoaded(messageId, timestamp) {
    if (!activeConversation) return;
    const cid = activeConversation.id;
    const list = messagesByConvo[cid] || [];
    if (list.some((m) => String(m.id) === String(messageId))) return;
    const earliest = list[0]?.timestamp;
    try {
      const { data } = await api.get(`/conversations/${cid}/messages`, {
        params: { since: timestamp - 1, ...(earliest ? { before: earliest } : {}) }
      });
      setMessagesByConvo((prev) => {
        const existing = prev[cid] || [];
        const have = new Set(existing.map((m) => String(m.id)));
        return { ...prev, [cid]: [...data.messages.filter((m) => !have.has(String(m.id))), ...existing] };
      });
    } catch (err) {
      console.error("Failed to load messages for search jump:", err.response?.data?.message || err.message);
    }
  }

  function handleTyping(isTyping) {
    if (!activeConversation) return;
    socketRef.current?.emit("typing", { conversationId: activeConversation.id, isTyping });
  }

  function handleDeleteMessage(id, forEveryone) {
    socketRef.current?.emit("delete-message", { id, forEveryone });
    if (!forEveryone && activeConversation) {
      setMessagesByConvo((prev) => ({
        ...prev,
        [activeConversation.id]: (prev[activeConversation.id] || []).filter((m) => m.id !== id)
      }));
    }
  }

  function handleReact(messageId, emoji) {
    socketRef.current?.emit("react-message", { messageId, emoji });
  }

  function handleTogglePin(messageId) {
    socketRef.current?.emit("toggle-pin", { messageId });
  }

  function handleToggleStar(messageId) {
    socketRef.current?.emit("toggle-star", { messageId }, (res) => {
      if (!res || res.error) return;
      setMessagesByConvo((prev) => {
        const next = { ...prev };
        for (const key of Object.keys(next)) {
          next[key] = next[key].map((m) => (m.id === messageId ? { ...m, isStarredByMe: res.starred } : m));
        }
        return next;
      });
    });
  }

  // Re-sends each picked message (text/attachment, not its reactions/replies)
  // into every target conversation - a plain new message in each, same as
  // WhatsApp's "forward" behavior.
  function handleForwardMessages(messagesToForward, targetConversationIds) {
    targetConversationIds.forEach((conversationId) => {
      messagesToForward.filter((m) => !["poll", "call", "system"].includes(m.type) && !m.viewOnce).forEach((m) => {
        // the server copies the content from the original and counts the forward
        socketRef.current?.emit("send-message", { conversationId, forwardedFrom: m.id });
      });
    });
  }

  // "Reply privately" on a group message: open (or start) a 1:1 chat with that person
  // with the group message quoted in the box, ready to answer.
  async function handleReplyPrivately(message) {
    if (!message?.sender?.id) return;
    try {
      const { data } = await api.post("/conversations/dm", { userId: message.sender.id });
      setConversations((prev) => {
        const exists = prev.find((c) => c.id === data.id);
        return exists ? prev.map((c) => (c.id === data.id ? data : c)) : [data, ...prev];
      });
      const groupName = activeConversation?.groupName || "the group";
      const snippet = message.text
        ? message.text.length > 160 ? `${message.text.slice(0, 160)}…` : message.text
        : `(${message.type})`;
      selectConversation(data);
      setPendingPrivateQuote({ convId: data.id, groupName, snippet });
    } catch (err) {
      alert(err.response?.data?.message || "Couldn't start that chat.");
    }
  }

  // "Yap AI" on a message's 3-dot menu: jump to the standing Yap AI chat and
  // pre-fill the composer with a quote of that message, so sending it asks
  // the real assistant about it - same flow as "Ask Meta AI" in WhatsApp.
  function handleAskYapAi(message) {
    const botConvo = conversations.find((c) => c.peer?.isBot);
    if (!botConvo) return;
    const quote = message.text
      ? `Re: "${message.text.length > 200 ? `${message.text.slice(0, 200)}…` : message.text}"\n\n`
      : `Re: (a ${message.type} message)\n\n`;
    selectConversation(botConvo);
    setPendingAiQuote(quote);
  }

  async function handleStartDm(targetUser) {
    try {
      const { data } = await api.post("/conversations/dm", { userId: targetUser.id });
      setConversations((prev) => {
        const exists = prev.find((c) => c.id === data.id);
        return exists ? prev.map((c) => (c.id === data.id ? data : c)) : [data, ...prev];
      });
      setShowNewChat(false);
      selectConversation(data);
    } catch (err) {
      console.error("Failed to start DM:", err.response?.status, err.response?.data?.message || err.message);
      alert(err.response?.data?.message || "Couldn't start that chat - see console for details.");
    }
  }

  async function handleCreateGroup(name, participantIds) {
    const { data } = await api.post("/conversations/group", { name, participantIds });
    setConversations((prev) => [data, ...prev]);
    setShowNewChat(false);
    selectConversation(data);
  }

  // Archive / unarchive a chat (moves it between the Chats and Archived tabs)
  async function handleToggleArchive(convo) {
    const archived = !convo.archived;
    try {
      const { data } = await api.patch(`/conversations/${convo.id}/settings`, { archived });
      setConversations((prev) =>
        prev.map((c) =>
          c.id === convo.id
            ? { ...c, archived: data.archived, ...(data.archived ? { pinned: false, pinnedAt: 0 } : {}) }
            : c
        )
      );
    } catch (err) {
      alert(err.response?.data?.message || "Couldn't update the archive.");
    }
  }

  // Calls tab: open the chat a call belongs to
  function handleOpenChatById(conversationId) {
    const convo = conversationsRef.current.find((c) => String(c.id) === String(conversationId));
    if (!convo) return;
    setView(convo.archived ? "archived" : "chats");
    selectConversation(convo);
  }

  // Calls tab: call someone back straight from the log
  function handleCallFromLog(peer, callType) {
    call.startCall(peer, callType);
  }

  // Rail's Yap AI button: jump to the standing assistant chat
  function handleOpenYapAi() {
    const botConvo = conversationsRef.current.find((c) => c.peer?.isBot);
    if (!botConvo) return;
    setView(botConvo.archived ? "archived" : "chats");
    selectConversation(botConvo);
  }

  // Menu > Mark all as read
  function handleMarkAllRead() {
    conversationsRef.current
      .filter((c) => c.unreadCount > 0 || c.hasUnreadMention)
      .forEach((c) => socketRef.current?.emit("mark-read", { conversationId: c.id }));
    setConversations((prev) => prev.map((c) => (c.unreadCount > 0 || c.hasUnreadMention ? { ...c, unreadCount: 0, hasUnreadMention: false } : c)));
  }

  // Menu > Select chats: one action applied to every ticked chat
  async function handleBulkChatAction(action, picked, opts) {
    const ids = new Set(picked.map((c) => c.id));
    const patchState = (fn) => setConversations((prev) => prev.map((c) => (ids.has(c.id) ? fn(c) : c)));

    if (action === "read") {
      picked.forEach((c) => socketRef.current?.emit("mark-read", { conversationId: c.id }));
      patchState((c) => ({ ...c, unreadCount: 0, hasUnreadMention: false }));
      return;
    }

    if (action === "delete") {
      const label = picked.length === 1 ? "this chat" : `these ${picked.length} chats`;
      if (!confirm(`Delete ${label}? They'll be removed from your chat list.`)) return;
      const done = [];
      for (const c of picked) {
        try {
          await api.delete(`/conversations/${c.id}`);
          done.push(c.id);
        } catch {}
      }
      const gone = new Set(done);
      setConversations((prev) => prev.filter((c) => !gone.has(c.id)));
      setMessagesByConvo((prev) => {
        const next = { ...prev };
        done.forEach((id) => delete next[id]);
        return next;
      });
      if (activeConversationId && gone.has(activeConversationId)) {
        setActiveConversationId(null);
        setShowMobileChat(false);
      }
      if (done.length < picked.length) alert("Some chats couldn't be deleted. Try those again.");
      return;
    }

    if (action === "favourite") {
      for (const c of picked) {
        try {
          await api.patch(`/conversations/${c.id}/settings`, { favourite: opts.favourite });
          setConversations((prev) => prev.map((x) => (x.id === c.id ? { ...x, favourite: opts.favourite } : x)));
        } catch {}
      }
      return;
    }

    const body = action === "mute" ? { muted: opts.muted } : action === "archive" ? { archived: opts.archived } : { pinned: opts.pinned };
    let failure = "";
    for (const c of picked) {
      try {
        const { data } = await api.patch(`/conversations/${c.id}/settings`, body);
        setConversations((prev) =>
          prev.map((x) => {
            if (x.id !== c.id) return x;
            if (action === "mute") return { ...x, muted: opts.muted };
            if (action === "archive") return { ...x, archived: data.archived, ...(data.archived ? { pinned: false, pinnedAt: 0 } : {}) };
            return { ...x, pinned: data.pinned, pinnedAt: data.pinnedAt };
          })
        );
      } catch (err) {
        failure = err.response?.data?.message || "Couldn't update some chats.";
      }
    }
    if (failure) alert(failure);
  }

  // Pin / unpin a chat to the top of my list (max 5, enforced by the server)
  async function handleTogglePinChat(convo) {
    const pinned = !convo.pinned;
    try {
      const { data } = await api.patch(`/conversations/${convo.id}/settings`, { pinned });
      setConversations((prev) =>
        prev.map((c) => (c.id === convo.id ? { ...c, pinned: data.pinned, pinnedAt: data.pinnedAt } : c))
      );
    } catch (err) {
      alert(err.response?.data?.message || "Couldn't update the pin.");
    }
  }

  async function handleToggleFavourite(convo) {
    const favourite = !convo.favourite;
    setConversations((prev) => prev.map((c) => (c.id === convo.id ? { ...c, favourite } : c)));
    try {
      await api.patch(`/conversations/${convo.id}/settings`, { favourite });
    } catch {
      setConversations((prev) => prev.map((c) => (c.id === convo.id ? { ...c, favourite: !favourite } : c)));
    }
  }

  async function handleSetDisappearing(convo, seconds) {
    try {
      await api.patch(`/conversations/${convo.id}`, { disappearingSeconds: seconds });
      setConversations((prev) => prev.map((c) => (c.id === convo.id ? { ...c, disappearingSeconds: seconds } : c)));
    } catch (err) {
      alert(err.response?.data?.message || "Couldn't change the timer.");
    }
  }

  async function handleMute(muted) {
    if (!activeConversation) return;
    setConversations((prev) => prev.map((c) => (c.id === activeConversation.id ? { ...c, muted } : c)));
    await api.patch(`/conversations/${activeConversation.id}/settings`, { muted });
  }

  async function handleClearChat() {
    if (!activeConversation) return;
    const id = activeConversation.id;
    await api.patch(`/conversations/${id}/settings`, { clearChat: true });
    setMessagesByConvo((prev) => ({ ...prev, [id]: [] }));
    setHasMoreByConvo((prev) => ({ ...prev, [id]: false }));
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, lastMessage: { text: "", type: "text", sender: null, timestamp: 0 }, lastMessagePreview: "" } : c))
    );
  }

  async function handleDeleteChat() {
    if (!activeConversation) return;
    const id = activeConversation.id;
    await api.delete(`/conversations/${id}`);
    setConversations((prev) => prev.filter((c) => c.id !== id));
    setMessagesByConvo((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    if (activeConversationId === id) {
      setActiveConversationId(null);
      setShowMobileChat(false);
    }
  }

  async function handleToggleBlock() {
    if (!activeConversation?.peer) return;
    const block = !activeConversation.isBlockedByMe;
    const id = activeConversation.id;
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, isBlockedByMe: block } : c)));
    await api.post("/users/block", { userId: activeConversation.peer.id, block });
  }

  function handleStartCall(callType) {
    if (!activeConversation?.peer) return;
    call.startCall(activeConversation.peer, callType);
  }

  if (loading || !user) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[var(--wa-panel-header)]">
        <div className="w-10 h-10 border-4 border-[var(--wa-green)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const activeMessages = (activeConversation ? messagesByConvo[activeConversation.id] : []) || [];
  const augmentedMessages = activeMessages.map((m) => ({
    ...m,
    readByCount: (m.readBy || []).filter((id) => String(id) !== String(user.id)).length,
    deliveredCount: (m.deliveredTo || []).filter((id) => String(id) !== String(user.id)).length
  }));
  const typingList = activeConversation ? typingByConvo[activeConversation.id] || [] : [];

  // phones show either the list or the open page (chat / settings page), never both
  const detailOpenOnMobile = view === "settings" ? !!settingsSection : showMobileChat;

  return (
    <div className="flex-1 flex h-screen overflow-hidden">
      <div
        className={`${detailOpenOnMobile ? "hidden md:flex" : "flex"} flex-col-reverse md:flex-row w-full md:w-auto shrink-0 h-full`}
      >
        <NavRail
          view={view}
          onViewChange={setView}
          chatsBadge={conversations.filter((c) => !c.archived && (c.unreadCount > 0 || c.hasUnreadMention)).length}
          archivedBadge={conversations.filter((c) => c.archived && c.unreadCount > 0).length}
          statusDot={statusFeed.hasUnseen}
          yapActive={!!activeConversation?.peer?.isBot}
          onOpenYapAi={handleOpenYapAi}
          onOpenStarred={() => setShowStarred(true)}
          onOpenProfile={() => {
            setView("settings");
            // desktop opens straight onto Profile; on a phone you pick from the list first
            setSettingsSection(typeof window !== "undefined" && window.innerWidth >= 768 ? "profile" : null);
          }}
          profileActive={view === "settings"}
          user={user}
        />
        <div className="flex-1 min-h-0 md:w-[380px] md:flex-none">
          <Sidebar
            conversations={conversations}
            activeId={activeConversation?.id}
            onSelect={selectConversation}
            onOpenNewChat={() => {
              setNewChatMode("list");
              setShowNewChat(true);
            }}
            onNewGroup={() => {
              setNewChatMode("group");
              setShowNewChat(true);
            }}
            onMarkAllRead={handleMarkAllRead}
            onOpenAppLock={() => setShowAppLock(true)}
            onBulkAction={handleBulkChatAction}
            onOpenStarred={() => setShowStarred(true)}
            onOpenAsk={() => setShowAsk(true)}
            drafts={drafts}
            onTogglePinChat={handleTogglePinChat}
            onToggleArchive={handleToggleArchive}
            view={view}
            statusFeed={statusFeed}
            callsVersion={callsVersion}
            callActive={anyCallActive}
            onCall={handleCallFromLog}
            onOpenChat={handleOpenChatById}
            settingsSection={settingsSection}
            onSelectSettings={setSettingsSection}
            presence={presence}
          />
        </div>
      </div>

      <div className={`flex-1 ${detailOpenOnMobile ? "block" : "hidden md:block"}`}>
        {view === "settings" ? (
          <SettingsDetail
            section={settingsSection}
            onBack={() => setSettingsSection(null)}
            onOpenAppLock={() => setShowAppLock(true)}
          />
        ) : (
        <ChatWindow
          conversation={activeConversation}
          drafts={drafts}
          onDraftChange={saveDraft}
          onReplyPrivately={handleReplyPrivately}
          allConversations={conversations}
          messages={augmentedMessages}
          onSend={handleSend}
          onLoadMore={handleLoadMore}
          onEnsureMessageLoaded={handleEnsureMessageLoaded}
          hasMore={activeConversation ? !!hasMoreByConvo[activeConversation.id] : false}
          typingUsers={typingList}
          presence={presence}
          currentUserId={user.id}
          onDeleteMessage={handleDeleteMessage}
          onToggleFavourite={handleToggleFavourite}
          onSetDisappearing={handleSetDisappearing}
          onBack={() => setShowMobileChat(false)}
          onCloseChat={() => {
            setActiveConversationId(null);
            setShowMobileChat(false);
          }}
          onTyping={handleTyping}
          onStartCall={handleStartCall}
          onStartGroupCall={(type) => activeConversation && groupCall.startCall(activeConversation, type)}
          onJoinGroupCall={() => activeConversation && groupCall.joinCall(activeConversation.id, activeConversation.groupName)}
          groupCallStatus={groupCall.statuses[String(activeConversation?.id)] || null}
          callActive={anyCallActive}
          onMute={handleMute}
          onTogglePinChat={handleTogglePinChat}
          onToggleArchive={handleToggleArchive}
          onClearChat={handleClearChat}
          onDeleteChat={handleDeleteChat}
          onToggleBlock={handleToggleBlock}
          onReact={handleReact}
          onTogglePin={handleTogglePin}
          onToggleStar={handleToggleStar}
          onForwardMessages={handleForwardMessages}
          onAskYapAI={handleAskYapAi}
          pendingAiQuote={pendingAiQuote}
          onConsumeAiQuote={() => setPendingAiQuote(null)}
          pendingPrivateQuote={pendingPrivateQuote}
          onConsumePrivateQuote={() => setPendingPrivateQuote(null)}
          onEditMessage={handleEditMessage}
          onVotePoll={handleVotePoll}
          jumpRequest={jumpRequest}
          onJumpConsumed={() => setJumpRequest(null)}
          messagesLoaded={activeConversation ? !!messagesByConvo[activeConversation.id] : false}
        />
        )}
      </div>

      {showNewChat && (
        <NewChatModal
          initialMode={newChatMode}
          onClose={() => setShowNewChat(false)}
          onStartDm={handleStartDm}
          onCreateGroup={handleCreateGroup}
        />
      )}
      {showProfile && <ProfileModal onClose={() => setShowProfile(false)} />}
      {showAppLock && (
        <AppLockModal
          userId={user.id}
          onClose={() => setShowAppLock(false)}
          onLockNow={appLock.lockNow}
          onChanged={appLock.configChanged}
        />
      )}
      {appLock.locked && (
        <LockScreen
          userId={user.id}
          name={user.name}
          onUnlock={appLock.unlock}
          onForgot={() => {
            clearAppLock(user.id);
            logout();
          }}
        />
      )}
      {showAsk && (
        <AskChatsModal
          onClose={() => setShowAsk(false)}
          onOpenSource={(s) => { setShowAsk(false); handleOpenStarred(s); }}
        />
      )}
      {showStarred && (
        <StarredPanel currentUserId={user.id} onClose={() => setShowStarred(false)} onOpen={handleOpenStarred} />
      )}

      <CallModal call={call} />
      <GroupCallModal groupCall={groupCall} myUser={user} />
    </div>
  );
}
