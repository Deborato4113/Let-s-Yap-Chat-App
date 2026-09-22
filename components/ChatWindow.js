"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import {
  Send,
  Paperclip,
  Smile,
  ArrowLeft,
  MoreVertical,
  Image as ImageIcon,
  FileText,
  Music,
  Mic,
  Trash2,
  Phone,
  Video,
  User as UserIcon,
  BellOff,
  Bell,
  Eraser,
  XCircle,
  Ban,
  ShieldCheck
} from "lucide-react";
import Avatar from "./Avatar";
import MessageBubble from "./MessageBubble";
import ImageViewer from "./ImageViewer";
import ContactInfoPanel from "./ContactInfoPanel";
import { formatDayLabel, lastSeenLabel } from "@/lib/utils";
import { useAudioRecorder } from "@/lib/useAudioRecorder";

const EMOJIS = ["😀","😂","😍","👍","🙏","🎉","🔥","❤️","😢","😮","🙌","👏"];
const MAX_FILE_BYTES = 5 * 1024 * 1024;

function groupByDay(messages) {
  const groups = [];
  let currentDay = null;
  let bucket = null;
  for (const m of messages) {
    const day = new Date(m.timestamp).toDateString();
    if (day !== currentDay) {
      currentDay = day;
      bucket = { day, label: formatDayLabel(m.timestamp), items: [] };
      groups.push(bucket);
    }
    bucket.items.push(m);
  }
  return groups;
}

function formatRecordTime(sec) {
  const m = Math.floor(sec / 60);
  const s = (sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export default function ChatWindow({
  conversation,
  messages,
  onSend,
  onLoadMore,
  hasMore,
  typingUsers,
  presence,
  currentUserId,
  onDeleteMessage,
  onBack,
  onTyping,
  onStartCall,
  callActive,
  onMute,
  onClearChat,
  onDeleteChat,
  onToggleBlock
}) {
  const [text, setText] = useState("");
  const [showEmoji, setShowEmoji] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showHeaderMenu, setShowHeaderMenu] = useState(false);
  const [showContactInfo, setShowContactInfo] = useState(false);
  const [viewerMessageId, setViewerMessageId] = useState(null);
  const scrollRef = useRef(null);
  const mediaInputRef = useRef(null);
  const docInputRef = useRef(null);
  const audioInputRef = useRef(null);
  const bottomRef = useRef(null);
  const typingTimeout = useRef(null);
  const recorder = useAudioRecorder();

  const groups = useMemo(() => groupByDay(messages), [messages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, conversation?.id]);

  // Leaving a conversation with an in-progress recording cancels it, rather
  // than leaving a phantom recording running in the background.
  useEffect(() => {
    return () => {
      if (recorder.recording) recorder.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation?.id]);

  function handleScroll(e) {
    if (e.target.scrollTop < 60 && hasMore) {
      onLoadMore();
    }
  }

  function handleTyping(value) {
    setText(value);
    onTyping(true);
    clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => onTyping(false), 1500);
  }

  function handleSend(e) {
    e?.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend({ type: "text", text: trimmed });
    setText("");
    setShowEmoji(false);
    onTyping(false);
  }

  function sendFile(file) {
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      alert("Please choose a file smaller than 5MB.");
      return;
    }
    const type = file.type.startsWith("image/")
      ? "image"
      : file.type.startsWith("video/")
      ? "video"
      : file.type.startsWith("audio/")
      ? "audio"
      : "file";
    const reader = new FileReader();
    reader.onload = () => {
      onSend({ type, fileData: reader.result, fileName: file.name, text: "" });
    };
    reader.readAsDataURL(file);
  }

  function handleMediaChange(e) {
    sendFile(e.target.files?.[0]);
    e.target.value = "";
  }

  function handleDocChange(e) {
    sendFile(e.target.files?.[0]);
    e.target.value = "";
  }

  function handleAudioFileChange(e) {
    sendFile(e.target.files?.[0]);
    e.target.value = "";
  }

  async function handleStopRecording() {
    const result = await recorder.stop();
    if (result?.fileData) {
      onSend({ type: "audio", fileData: result.fileData, fileName: "voice-message.webm", text: "" });
    }
  }

  if (!conversation) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-[var(--wa-panel-header)] text-center px-6">
        <div className="w-64 h-64 rounded-full bg-[var(--wa-border)] flex items-center justify-center mb-6">
          <Send size={64} className="text-[var(--wa-text-muted)]" />
        </div>
        <h2 className="text-2xl font-light text-[var(--wa-text-secondary)] mb-2">Let&apos;s Yap</h2>
        <p className="text-sm text-[var(--wa-text-secondary)] max-w-sm">
          Select a chat to start messaging, or click the new-chat icon to find someone.
        </p>
      </div>
    );
  }

  const label = conversation.isGroup ? conversation.groupName : conversation.peer?.name || "Unknown";
  const color = conversation.isGroup ? conversation.groupAvatarColor : conversation.peer?.avatarColor;
  const avatarUrl = conversation.isGroup ? "" : conversation.peer?.avatarUrl;
  const peerId = conversation.peer?.id;
  const status = peerId ? presence[peerId] : null;
  const isTyping = typingUsers.length > 0;
  const isBlockedEitherWay = conversation.isBlockedByMe || conversation.hasBlockedMe;
  // Look the viewer's message up live from `messages` (rather than storing a
  // snapshot) so it auto-closes if the message gets deleted while it's open.
  const viewerMessage = viewerMessageId
    ? messages.find((m) => m.id === viewerMessageId && !m.deletedForEveryone) || null
    : null;
  const viewerIsOwn = viewerMessage ? String(viewerMessage.sender?.id || viewerMessage.sender) === String(currentUserId) : false;

  const subtitle = conversation.isGroup
    ? `${conversation.participants?.length || 0} members`
    : conversation.isBlockedByMe
    ? "Blocked"
    : isTyping
    ? "typing…"
    : lastSeenLabel(status, conversation.peer?.lastSeen);

  return (
    <div className="flex-1 flex flex-col h-full">
      <div className="h-16 bg-[var(--wa-panel-header)] flex items-center justify-between px-4 border-l border-[var(--wa-border)]">
        <button
          onClick={() => setShowContactInfo(true)}
          className="flex items-center gap-3 min-w-0 flex-1 text-left"
        >
          <ArrowLeft size={20} className="md:hidden p-0 text-[var(--wa-icon)]" onClick={(e) => { e.stopPropagation(); onBack(); }} />
          <Avatar name={label} color={color} avatarUrl={avatarUrl} size={40} isGroup={conversation.isGroup} online={status === "online"} showStatus />
          <div className="min-w-0">
            <p className="text-sm font-medium text-[var(--wa-text-primary)] truncate">{label}</p>
            <p className={`text-xs truncate ${isTyping ? "text-[var(--wa-green)]" : "text-[var(--wa-text-secondary)]"}`}>{subtitle}</p>
          </div>
        </button>

        <div className="flex items-center gap-1 text-[var(--wa-icon)]">
          {!conversation.isGroup && (
            <>
              <button
                onClick={() => onStartCall("audio")}
                disabled={callActive || isBlockedEitherWay}
                title="Voice call"
                className="p-2 rounded-full hover:bg-[var(--wa-border)] disabled:opacity-30"
              >
                <Phone size={19} />
              </button>
              <button
                onClick={() => onStartCall("video")}
                disabled={callActive || isBlockedEitherWay}
                title="Video call"
                className="p-2 rounded-full hover:bg-[var(--wa-border)] disabled:opacity-30"
              >
                <Video size={20} />
              </button>
            </>
          )}
          <div className="relative">
            <button
              onClick={() => setShowHeaderMenu((v) => !v)}
              className="p-2 rounded-full hover:bg-[var(--wa-border)]"
            >
              <MoreVertical size={20} />
            </button>
            {showHeaderMenu && (
              <div className="absolute right-0 top-10 bg-[var(--wa-panel)] shadow-lg rounded-md py-1 w-52 z-20 text-sm text-[var(--wa-text-primary)]">
                <button
                  onClick={() => {
                    setShowHeaderMenu(false);
                    setShowContactInfo(true);
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-[var(--wa-sidebar-hover)] flex items-center gap-2.5"
                >
                  <UserIcon size={16} /> {conversation.isGroup ? "Group info" : "Contact info"}
                </button>
                {!conversation.isGroup && (
                  <button
                    onClick={() => {
                      setShowHeaderMenu(false);
                      onMute(!conversation.muted);
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-[var(--wa-sidebar-hover)] flex items-center gap-2.5"
                  >
                    {conversation.muted ? <Bell size={16} /> : <BellOff size={16} />}
                    {conversation.muted ? "Unmute notifications" : "Mute notifications"}
                  </button>
                )}
                <button
                  onClick={() => {
                    setShowHeaderMenu(false);
                    if (confirm("Clear all messages in this chat? This only affects your view.")) onClearChat();
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-[var(--wa-sidebar-hover)] flex items-center gap-2.5"
                >
                  <Eraser size={16} /> Clear chat
                </button>
                <button
                  onClick={() => {
                    setShowHeaderMenu(false);
                    if (confirm("Delete this chat? It will be removed from your chat list.")) onDeleteChat();
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-[var(--wa-sidebar-hover)] flex items-center gap-2.5 text-[var(--wa-danger)]"
                >
                  <XCircle size={16} /> Delete chat
                </button>
                {!conversation.isGroup && (
                  <button
                    onClick={() => {
                      setShowHeaderMenu(false);
                      onToggleBlock();
                    }}
                    className={`w-full text-left px-3 py-2 hover:bg-[var(--wa-sidebar-hover)] flex items-center gap-2.5 ${
                      conversation.isBlockedByMe ? "text-[var(--wa-green)]" : "text-[var(--wa-danger)]"
                    }`}
                  >
                    {conversation.isBlockedByMe ? <ShieldCheck size={16} /> : <Ban size={16} />}
                    {conversation.isBlockedByMe ? `Unblock ${conversation.peer?.name}` : `Block ${conversation.peer?.name}`}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto chat-bg-pattern px-4 md:px-16 py-4"
      >
        {hasMore && (
          <p className="text-center text-xs text-[var(--wa-text-secondary)] mb-2">Scroll up to load older messages</p>
        )}
        {groups.map((g) => (
          <div key={g.day}>
            <div className="flex justify-center my-3 sticky top-0 z-[1]">
              <span className="bg-white/90 text-[var(--wa-icon)] text-xs px-3 py-1 rounded-md shadow-sm">{g.label}</span>
            </div>
            {g.items.map((m, idx) => {
              const isOwn = String(m.sender?.id || m.sender) === String(currentUserId);
              const prev = g.items[idx - 1];
              const showSender =
                conversation.isGroup && !isOwn && (!prev || String(prev.sender?.id || prev.sender) !== String(m.sender?.id || m.sender));
              return (
                <MessageBubble
                  key={m.id}
                  message={m}
                  isOwn={isOwn}
                  showSender={showSender}
                  senderName={m.sender?.name}
                  onDelete={onDeleteMessage}
                  onOpenMedia={(msg) => setViewerMessageId(msg.id)}
                />
              );
            })}
          </div>
        ))}
        {isTyping && (
          <div className="flex justify-start mb-2">
            <div className="bg-[var(--wa-panel)] rounded-lg rounded-tl-none px-4 py-3 shadow-sm flex gap-1">
              <span className="w-1.5 h-1.5 bg-[var(--wa-text-muted)] rounded-full typing-dot" />
              <span className="w-1.5 h-1.5 bg-[var(--wa-text-muted)] rounded-full typing-dot" />
              <span className="w-1.5 h-1.5 bg-[var(--wa-text-muted)] rounded-full typing-dot" />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {isBlockedEitherWay ? (
        <div className="bg-[var(--wa-panel-header)] px-4 py-3 text-center text-sm text-[var(--wa-text-secondary)] border-t border-[var(--wa-border)]">
          {conversation.isBlockedByMe
            ? `You blocked ${conversation.peer?.name}. `
            : `You can't message ${conversation.peer?.name}. `}
          {conversation.isBlockedByMe && (
            <button onClick={onToggleBlock} className="text-[var(--wa-green)] font-medium">
              Unblock
            </button>
          )}
        </div>
      ) : recorder.recording ? (
        <div className="bg-[var(--wa-panel-header)] px-4 py-2.5 flex items-center gap-3">
          <button
            onClick={recorder.cancel}
            className="p-2.5 rounded-full text-[var(--wa-danger)] hover:bg-[var(--wa-border)]"
            title="Cancel"
          >
            <Trash2 size={20} />
          </button>
          <div className="flex-1 flex items-center gap-2 text-sm text-[var(--wa-text-primary)]">
            <span className="w-2.5 h-2.5 rounded-full bg-[var(--wa-danger)] animate-pulse" />
            Recording… {formatRecordTime(recorder.seconds)}
          </div>
          <button
            onClick={handleStopRecording}
            className="p-2.5 rounded-full bg-[var(--wa-green)] text-white hover:bg-[var(--wa-green-dark)]"
            title="Send"
          >
            <Send size={18} />
          </button>
        </div>
      ) : (
        <form onSubmit={handleSend} className="bg-[var(--wa-panel-header)] px-4 py-2.5 flex items-center gap-2 relative">
          {showEmoji && (
            <div className="absolute bottom-16 left-4 bg-[var(--wa-panel)] shadow-lg rounded-lg p-2 grid grid-cols-6 gap-1 z-10">
              {EMOJIS.map((em) => (
                <button
                  key={em}
                  type="button"
                  onClick={() => setText((t) => t + em)}
                  className="text-xl hover:bg-[var(--wa-panel-header)] rounded p-1"
                >
                  {em}
                </button>
              ))}
            </div>
          )}
          {showAttachMenu && (
            <div className="absolute bottom-16 left-4 bg-[var(--wa-panel)] shadow-lg rounded-lg py-1.5 w-52 z-10 text-sm overflow-hidden">
              <button
                type="button"
                onClick={() => {
                  setShowAttachMenu(false);
                  mediaInputRef.current?.click();
                }}
                className="w-full text-left px-4 py-2.5 hover:bg-[var(--wa-sidebar-hover)] flex items-center gap-3 text-[var(--wa-text-primary)]"
              >
                <span className="w-8 h-8 rounded-full bg-[#bf59cf] flex items-center justify-center text-white shrink-0">
                  <ImageIcon size={16} />
                </span>
                Photos &amp; videos
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowAttachMenu(false);
                  audioInputRef.current?.click();
                }}
                className="w-full text-left px-4 py-2.5 hover:bg-[var(--wa-sidebar-hover)] flex items-center gap-3 text-[var(--wa-text-primary)]"
              >
                <span className="w-8 h-8 rounded-full bg-[#e17055] flex items-center justify-center text-white shrink-0">
                  <Music size={16} />
                </span>
                Audio
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowAttachMenu(false);
                  docInputRef.current?.click();
                }}
                className="w-full text-left px-4 py-2.5 hover:bg-[var(--wa-sidebar-hover)] flex items-center gap-3 text-[var(--wa-text-primary)]"
              >
                <span className="w-8 h-8 rounded-full bg-[#5157ae] flex items-center justify-center text-white shrink-0">
                  <FileText size={16} />
                </span>
                Document
              </button>
            </div>
          )}
          <button type="button" onClick={() => setShowEmoji((v) => !v)} className="p-2 text-[var(--wa-icon)] hover:text-[var(--wa-text-primary)]">
            <Smile size={22} />
          </button>
          <button
            type="button"
            onClick={() => {
              setShowAttachMenu((v) => !v);
              setShowEmoji(false);
            }}
            className="p-2 text-[var(--wa-icon)] hover:text-[var(--wa-text-primary)] rotate-45"
          >
            <Paperclip size={22} />
          </button>
          <input ref={mediaInputRef} type="file" accept="image/*,video/*" className="hidden" onChange={handleMediaChange} />
          <input ref={docInputRef} type="file" className="hidden" onChange={handleDocChange} />
          <input ref={audioInputRef} type="file" accept="audio/*" className="hidden" onChange={handleAudioFileChange} />
          <input
            value={text}
            onChange={(e) => handleTyping(e.target.value)}
            placeholder="Type a message"
            className="flex-1 bg-[var(--wa-panel)] rounded-lg px-4 py-2.5 text-sm outline-none text-[var(--wa-text-primary)]"
          />
          {text.trim() ? (
            <button
              type="submit"
              className="p-2.5 rounded-full bg-[var(--wa-green)] text-white hover:bg-[var(--wa-green-dark)]"
            >
              <Send size={18} />
            </button>
          ) : (
            <button
              type="button"
              onClick={recorder.start}
              title="Record a voice message"
              className="p-2.5 rounded-full bg-[var(--wa-green)] text-white hover:bg-[var(--wa-green-dark)]"
            >
              <Mic size={18} />
            </button>
          )}
        </form>
      )}

      {viewerMessage && (
        <ImageViewer
          message={viewerMessage}
          isOwn={viewerIsOwn}
          onClose={() => setViewerMessageId(null)}
          onDelete={onDeleteMessage}
        />
      )}

      {showContactInfo && (
        <ContactInfoPanel
          conversation={conversation}
          isBlocked={conversation.isBlockedByMe}
          onClose={() => setShowContactInfo(false)}
          onToggleBlock={() => {
            setShowContactInfo(false);
            onToggleBlock();
          }}
        />
      )}
    </div>
  );
}
