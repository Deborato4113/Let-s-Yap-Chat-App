"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/AuthContext";
import { getSocket } from "@/lib/socket";
import { useCall } from "@/lib/useCall";
import api from "@/lib/api";
import Sidebar from "@/components/Sidebar";
import ChatWindow from "@/components/ChatWindow";
import NewChatModal from "@/components/NewChatModal";
import ProfileModal from "@/components/ProfileModal";
import CallModal from "@/components/CallModal";

function previewFor(message) {
  if (message.type === "image") return "📷 Photo";
  if (message.type === "video") return "🎥 Video";
  if (message.type === "audio") return "🎤 Voice message";
  if (message.type === "file") return "📄 Document";
  return message.text;
}

export default function ChatPage() {
  const { user, token, loading } = useAuth();
  const router = useRouter();

  const [conversations, setConversations] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [messagesByConvo, setMessagesByConvo] = useState({});
  const [hasMoreByConvo, setHasMoreByConvo] = useState({});
  const [typingByConvo, setTypingByConvo] = useState({});
  const [presence, setPresence] = useState({});
  const [showNewChat, setShowNewChat] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showMobileChat, setShowMobileChat] = useState(false);
  const [socket, setSocket] = useState(null);
  const [pendingAiQuote, setPendingAiQuote] = useState(null);

  const socketRef = useRef(null);
  const activeRef = useRef(null);
  const call = useCall(socket);

  // Derived (not a separate copy) so header actions like mute/block/clear
  // stay in sync the moment `conversations` updates.
  const activeConversation = conversations.find((c) => c.id === activeConversationId) || null;

  useEffect(() => {
    activeRef.current = activeConversation;
  }, [activeConversation]);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

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

  // socket setup
  useEffect(() => {
    if (!token) return;
    const s = getSocket(token);
    socketRef.current = s;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSocket(s);

    s.on("new-message", (message) => {
      const convoId = String(message.conversation);
      setMessagesByConvo((prev) => ({
        ...prev,
        [convoId]: [...(prev[convoId] || []), message]
      }));

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
        updated[idx] = {
          ...updated[idx],
          lastMessage: { text: message.text, type: message.type, timestamp: message.timestamp, sender: message.sender?.id },
          lastMessagePreview: previewFor(message),
          unreadCount: isActive || isOwn ? 0 : (updated[idx].unreadCount || 0) + 1
        };
        const [item] = updated.splice(idx, 1);
        updated.unshift(item);
        return updated;
      });

      if (activeRef.current && String(activeRef.current.id) === convoId) {
        s.emit("mark-read", { conversationId: convoId });
      }
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
        prev.map((c) => (c.peer && String(c.peer.id) === String(userId) ? { ...c, peer: { ...c.peer, status, lastSeen } } : c))
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

    s.on("peer-block-changed", ({ byUserId, blocked }) => {
      setConversations((prev) =>
        prev.map((c) => (c.peer && String(c.peer.id) === String(byUserId) ? { ...c, hasBlockedMe: blocked } : c))
      );
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
      s.off("peer-block-changed");
      s.off("message-deleted");
      s.off("message-reaction");
      s.off("message-pinned");
    };
  }, [token, user]);

  const loadMessages = useCallback(async (conversationId, before) => {
    const { data } = await api.get(`/conversations/${conversationId}/messages`, {
      params: before ? { before } : {}
    });
    setMessagesByConvo((prev) => ({
      ...prev,
      [conversationId]: before ? [...data.messages, ...(prev[conversationId] || [])] : data.messages
    }));
    setHasMoreByConvo((prev) => ({ ...prev, [conversationId]: data.hasMore }));
  }, []);

  function selectConversation(convo) {
    setActiveConversationId(convo.id);
    setShowMobileChat(true);
    setConversations((prev) => prev.map((c) => (c.id === convo.id ? { ...c, unreadCount: 0 } : c)));
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

  function handleLoadMore() {
    if (!activeConversation) return;
    const list = messagesByConvo[activeConversation.id] || [];
    const earliest = list[0]?.timestamp;
    if (earliest) loadMessages(activeConversation.id, earliest);
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
      messagesToForward.forEach((m) => {
        socketRef.current?.emit("send-message", {
          conversationId,
          type: m.type,
          text: m.text || "",
          fileName: m.fileName || "",
          fileData: m.fileData || ""
        });
      });
    });
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
    const { data } = await api.post("/conversations/dm", { userId: targetUser.id });
    setConversations((prev) => {
      const exists = prev.find((c) => c.id === data.id);
      return exists ? prev.map((c) => (c.id === data.id ? data : c)) : [data, ...prev];
    });
    setShowNewChat(false);
    selectConversation(data);
  }

  async function handleCreateGroup(name, participantIds) {
    const { data } = await api.post("/conversations/group", { name, participantIds });
    setConversations((prev) => [data, ...prev]);
    setShowNewChat(false);
    selectConversation(data);
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

  return (
    <div className="flex-1 flex h-screen overflow-hidden">
      <div className={`w-full md:w-[380px] shrink-0 ${showMobileChat ? "hidden md:block" : "block"}`}>
        <Sidebar
          conversations={conversations}
          activeId={activeConversation?.id}
          onSelect={selectConversation}
          onOpenNewChat={() => setShowNewChat(true)}
          onOpenProfile={() => setShowProfile(true)}
          presence={presence}
        />
      </div>

      <div className={`flex-1 ${showMobileChat ? "block" : "hidden md:block"}`}>
        <ChatWindow
          conversation={activeConversation}
          allConversations={conversations}
          messages={augmentedMessages}
          onSend={handleSend}
          onLoadMore={handleLoadMore}
          hasMore={activeConversation ? !!hasMoreByConvo[activeConversation.id] : false}
          typingUsers={typingList}
          presence={presence}
          currentUserId={user.id}
          onDeleteMessage={handleDeleteMessage}
          onBack={() => setShowMobileChat(false)}
          onTyping={handleTyping}
          onStartCall={handleStartCall}
          callActive={call.callState !== "idle"}
          onMute={handleMute}
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
        />
      </div>

      {showNewChat && (
        <NewChatModal
          onClose={() => setShowNewChat(false)}
          onStartDm={handleStartDm}
          onCreateGroup={handleCreateGroup}
        />
      )}
      {showProfile && <ProfileModal onClose={() => setShowProfile(false)} />}

      <CallModal call={call} />
    </div>
  );
}
