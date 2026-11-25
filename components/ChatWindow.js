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
  ShieldCheck,
  X,
  Pin,
  Forward,
  CheckSquare,
  Palette,
  Download,
  XSquare,
  Clock,
  AtSign,
  BarChart3,
  Pencil,
  Archive,
  Timer,
  Star as StarIcon,
  Flag,
  EyeOff,
  Languages
} from "lucide-react";
import api from "@/lib/api";
import { Search } from "lucide-react";
import Avatar from "./Avatar";
import MessageBubble from "./MessageBubble";
import CatchMeUp from "./CatchMeUp";
import SuggestedReplies from "./SuggestedReplies";
import RewriteBar from "./RewriteBar";
import AutoTranslateModal from "./AutoTranslateModal";
import ImageViewer from "./ImageViewer";
import ContactInfoPanel from "./ContactInfoPanel";
import EmojiPicker from "./EmojiPicker";
import AnchoredPopover from "./AnchoredPopover";
import ForwardModal from "./ForwardModal";
import MessageInfoModal from "./MessageInfoModal";
import DisappearingModal, { timerLabel } from "./DisappearingModal";
import ReportModal from "./ReportModal";
import PinnedMessagesModal from "./PinnedMessagesModal";
import { usePrefs } from "@/lib/prefs";
import LinkPreview from "./LinkPreview";
import { extractFirstUrl } from "./RichText";
import { WALLPAPERS, chatBackgroundStyle, compressImageFile } from "@/lib/wallpapers";
import ConfirmDeleteModal from "./ConfirmDeleteModal";
import PollModal from "./PollModal";
import ScheduleModal from "./ScheduleModal";
import ThreadPanel from "./ThreadPanel";
import MentionsPanel from "./MentionsPanel";
import { formatDayLabel, lastSeenLabel } from "@/lib/utils";
import { useAudioRecorder } from "@/lib/useAudioRecorder";

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
  allConversations = [],
  messages,
  onSend,
  onLoadMore,
  onEnsureMessageLoaded,
  onCloseChat,
  hasMore,
  typingUsers,
  presence,
  currentUserId,
  onDeleteMessage,
  onBack,
  onTyping,
  onStartCall,
  onStartGroupCall,
  onJoinGroupCall,
  groupCallStatus,
  callActive,
  onMute,
  onTogglePinChat,
  onToggleArchive,
  onToggleFavourite,
  onSetDisappearing,
  onClearChat,
  onDeleteChat,
  onToggleBlock,
  onReact,
  onTogglePin,
  onToggleStar,
  onForwardMessages,
  onAskYapAI,
  pendingAiQuote,
  onConsumeAiQuote,
  pendingPrivateQuote,
  onConsumePrivateQuote,
  onEditMessage,
  onVotePoll,
  jumpRequest,
  onJumpConsumed,
  messagesLoaded = true,
  drafts = {},
  onDraftChange,
  onReplyPrivately
}) {
  const [text, setText] = useState("");
  const viewOnceNextRef = useRef(false);
  const [showAutoTr, setShowAutoTr] = useState(false);
  const [autoLang, setAutoLang] = useState("");
  const [autoTr, setAutoTr] = useState({}); // `${lang}:${messageId}` -> translation ("" = nothing to show)
  const autoInFlight = useRef(new Set());
  const textRef = useRef("");
  textRef.current = text;
  const lastSavedRef = useRef({}); // conversationId -> draft text last saved/received
  const [showEmoji, setShowEmoji] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showHeaderMenu, setShowHeaderMenu] = useState(false);
  const [showContactInfo, setShowContactInfo] = useState(false);
  const [viewerMessageId, setViewerMessageId] = useState(null);
  const [replyingTo, setReplyingTo] = useState(null);
  const [selectMode, setSelectMode] = useState(false);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [forwardTarget, setForwardTarget] = useState(null); // array of message objects
  const [infoTarget, setInfoTarget] = useState(null);
  const [showTimer, setShowTimer] = useState(false);
  const [showPinned, setShowPinned] = useState(false);
  const [reportTarget, setReportTarget] = useState(null);
  const prefs = usePrefs();
  const [showThemePicker, setShowThemePicker] = useState(false);
  const [chatTheme, setChatTheme] = useState(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [highlightId, setHighlightId] = useState(null);
  const [pendingJumpId, setPendingJumpId] = useState(null);
  const [editing, setEditing] = useState(null); // message being edited
  const [showPollModal, setShowPollModal] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [showMentions, setShowMentions] = useState(false);
  const [threadRootId, setThreadRootId] = useState(null);
  const [mention, setMention] = useState(null); // { start, query, index } while typing "@..."
  const inputRef = useRef(null);
  const skipAutoScrollRef = useRef(false);
  const scrollRef = useRef(null);
  const emojiButtonRef = useRef(null);
  const mediaInputRef = useRef(null);
  const docInputRef = useRef(null);
  const audioInputRef = useRef(null);
  const bottomRef = useRef(null);
  const typingTimeout = useRef(null);
  const recorder = useAudioRecorder();

  const groups = useMemo(() => {
    // Safety net: never render two bubbles with the same id (duplicate React keys).
    const seen = new Set();
    return groupByDay(messages.filter((m) => !seen.has(String(m.id)) && seen.add(String(m.id))));
  }, [messages]);
  // replies per message, counted from what's loaded (the server's count covers older ones)
  const liveReplyCounts = useMemo(() => {
    const map = new Map();
    messages.forEach((m) => {
      if (m.replyTo?.id && !m.deletedForEveryone) map.set(String(m.replyTo.id), (map.get(String(m.replyTo.id)) || 0) + 1);
    });
    return map;
  }, [messages]);
  const nameById = useMemo(() => {
    const map = {};
    (conversation?.participants || []).forEach((p) => (map[String(p.id)] = p.name));
    return map;
  }, [conversation?.participants]);
  const mentionables = conversation?.isGroup ? conversation.participants || [] : [];
  const pinnedMessage = useMemo(() => [...messages].reverse().find((m) => m.pinned && !m.deletedForEveryone), [messages]);

  useEffect(() => {
    // After jumping to a search result, loading older messages changes
    // messages.length - don't yank the view back down to the bottom.
    if (skipAutoScrollRef.current) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, conversation?.id]);

  // Switching chats closes/clears search.
  useEffect(() => {
    setSearchOpen(false);
    setSearchQuery("");
    setSearchResults([]);
    setHighlightId(null);
    setPendingJumpId(null);
    setEditing(null);
    setShowMentions(false);
    setThreadRootId(null);
    setMention(null);
    setShowPollModal(false);
    setShowSchedule(false);
    skipAutoScrollRef.current = false;
  }, [conversation?.id]);

  // Per-chat background colour, remembered in this browser only.
  useEffect(() => {
    if (!conversation?.id) return;
    try {
      setChatTheme(localStorage.getItem(`yap_chat_theme_${conversation.id}`) || null);
    } catch {
      setChatTheme(null);
    }
    setShowThemePicker(false);
  }, [conversation?.id]);

  const wallpaperFileRef = useRef(null);
  async function pickOwnWallpaper(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) return alert("Choose an image file.");
    try {
      const dataUrl = await compressImageFile(file);
      localStorage.setItem(`yap_chat_theme_${conversation.id}`, `img:${dataUrl}`);
      setChatTheme(`img:${dataUrl}`);
      setShowThemePicker(false);
    } catch {
      alert("Couldn't use that photo. Try a smaller one.");
    }
  }

  function applyTheme(color) {
    setChatTheme(color);
    setShowThemePicker(false);
    try {
      if (color) localStorage.setItem(`yap_chat_theme_${conversation.id}`, color);
      else localStorage.removeItem(`yap_chat_theme_${conversation.id}`);
    } catch {
      /* storage unavailable - theme just won't persist */
    }
  }

  async function exportChat() {
    try {
      const { data } = await api.get(`/conversations/${conversation.id}/messages`, { params: { since: 0 } });
      const lines = data.messages
        .filter((m) => m.type !== "system")
        .map((m) => {
          const d = new Date(m.timestamp);
          const who = String(m.sender?.id) === String(currentUserId) ? "You" : m.sender?.name || "Unknown";
          const body = m.deletedForEveryone
            ? "This message was deleted"
            : m.type === "call"
            ? `${m.call?.kind === "video" ? "Video" : "Voice"} call (${m.call?.status || "missed"}${m.call?.duration ? `, ${m.call.duration}s` : ""})`
            : m.type === "poll"
            ? `Poll: ${m.text} [${(m.poll?.options || []).map((o) => `${o.text}: ${o.voters.length}`).join(", ")}]`
            : m.text || (m.fileName ? `<${m.type}: ${m.fileName}>` : `<${m.type}>`);
          return `[${d.toLocaleDateString()}, ${d.toLocaleTimeString()}] ${who}: ${body}`;
        });
      const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `Chat with ${label}.txt`.replace(/[\\/:*?"<>|]/g, "_");
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } catch (err) {
      console.error("Export failed:", err.response?.data?.message || err.message);
      alert("Couldn't export this chat.");
    }
  }

  // Debounced server-side search within this conversation.
  useEffect(() => {
    const q = searchQuery.trim();
    if (!searchOpen || !q || !conversation?.id) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const { data } = await api.get(`/conversations/${conversation.id}/search`, { params: { q } });
        if (!cancelled) setSearchResults(data.results || []);
      } catch (err) {
        console.error("Search failed:", err.response?.data?.message || err.message);
        if (!cancelled) setSearchResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [searchQuery, searchOpen, conversation?.id]);

  // Once the target message is in the DOM, scroll to it and flash it.
  useEffect(() => {
    if (!pendingJumpId) return;
    const el = document.getElementById(`msg-${pendingJumpId}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightId(pendingJumpId);
    setPendingJumpId(null);
  }, [pendingJumpId, messages]);

  // Separate effect for the fade-out: if the timer lived in the effect above,
  // setPendingJumpId(null) would re-run that effect and its cleanup would
  // cancel the timer before it fired, leaving the highlight stuck on.
  useEffect(() => {
    if (!highlightId) return;
    const t = setTimeout(() => setHighlightId(null), 2000);
    return () => clearTimeout(t);
  }, [highlightId]);

  async function jumpToResult(r) {
    skipAutoScrollRef.current = true;
    if (!messages.some((m) => String(m.id) === String(r.id))) {
      await onEnsureMessageLoaded?.(r.id, r.timestamp);
    }
    // Re-trigger the effect even if the same result is clicked twice.
    setPendingJumpId(null);
    setTimeout(() => setPendingJumpId(r.id), 0);
  }

  function closeSearch() {
    setSearchOpen(false);
    setSearchQuery("");
    setSearchResults([]);
    skipAutoScrollRef.current = false;
  }

  // jump to any message by id (used by reply quotes, mentions, threads, starred)
  function jumpToMessage(id, timestamp) {
    jumpToResult({ id, timestamp });
  }

  // A jump requested from outside (e.g. tapping a starred message): wait until
  // this chat's messages are loaded, then scroll to it.
  useEffect(() => {
    if (!jumpRequest || !conversation || String(jumpRequest.conversationId) !== String(conversation.id)) return;
    if (!messagesLoaded) return;
    jumpToResult({ id: jumpRequest.messageId, timestamp: jumpRequest.timestamp });
    onJumpConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jumpRequest, messagesLoaded, conversation?.id]);

  function highlightMatch(text, q) {
    const term = q.trim();
    if (!term) return text;
    const i = text.toLowerCase().indexOf(term.toLowerCase());
    if (i === -1) return text;
    const start = Math.max(0, i - 30);
    const before = (start > 0 ? "…" : "") + text.slice(start, i);
    return (
      <>
        {before}
        <mark className="bg-yellow-300/70 text-inherit rounded px-0.5">{text.slice(i, i + term.length)}</mark>
        {text.slice(i + term.length, i + term.length + 80)}
      </>
    );
  }

  // Leaving a conversation with an in-progress recording cancels it, rather
  // than leaving a phantom recording running in the background.
  useEffect(() => {
    return () => {
      if (recorder.recording) recorder.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation?.id]);

  // Each chat keeps its own draft, saved to the account so it follows me to other devices.
  useEffect(() => {
    const id = conversation?.id;
    if (!id) return;
    const d = drafts[id] || "";
    lastSavedRef.current[id] = d;
    setText(d);
    try { setAutoLang(localStorage.getItem(`yap_autotr_${id}`) || ""); } catch { setAutoLang(""); }
    return () => {
      // leaving the chat: save what's typed right away instead of waiting for the pause
      if (textRef.current !== (lastSavedRef.current[id] ?? "")) {
        lastSavedRef.current[id] = textRef.current;
        onDraftChange?.(id, textRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation?.id]);

  useEffect(() => {
    const id = conversation?.id;
    if (!id || editing) return;
    if (text === (lastSavedRef.current[id] ?? "")) return;
    const t = setTimeout(() => {
      lastSavedRef.current[id] = text;
      onDraftChange?.(id, text);
    }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, conversation?.id, editing]);

  // a draft edited on another device shows up here (unless I'm typing in this box right now)
  useEffect(() => {
    const id = conversation?.id;
    if (!id) return;
    const remote = drafts[id] || "";
    if (remote === (lastSavedRef.current[id] ?? "")) return;
    if (typeof document !== "undefined" && document.activeElement === inputRef.current && textRef.current) return;
    lastSavedRef.current[id] = remote;
    setText(remote);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drafts]);

  // Auto-translate: translate recent incoming text in batches, once each.
  useEffect(() => {
    if (!autoLang || !conversation?.id) return;
    const todo = messages
      .filter((m) => m.type === "text" && m.text && !m.deletedForEveryone && String(m.sender?.id) !== String(currentUserId))
      .slice(-30)
      .filter((m) => autoTr[`${autoLang}:${m.id}`] === undefined && !autoInFlight.current.has(`${autoLang}:${m.id}`));
    if (todo.length === 0) return;
    const lang = autoLang;
    const batch = todo.slice(-15);
    batch.forEach((m) => autoInFlight.current.add(`${lang}:${m.id}`));
    api.post("/ai/translate-batch", { target: lang, items: batch.map((m) => ({ id: m.id, text: m.text })) })
      .then(({ data }) => {
        setAutoTr((prev) => {
          const next = { ...prev };
          batch.forEach((m) => {
            const t = data.translations?.[m.id];
            const same = !t || t.trim().toLowerCase() === m.text.trim().toLowerCase();
            next[`${lang}:${m.id}`] = same ? "" : t;
          });
          return next;
        });
      })
      .catch(() => {
        // leave them untranslated; they are retried the next time the list changes
        batch.forEach((m) => autoInFlight.current.delete(`${lang}:${m.id}`));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoLang, messages, conversation?.id]);

  function chooseAutoLang(lang) {
    setShowAutoTr(false);
    setAutoLang(lang);
    try {
      if (lang) localStorage.setItem(`yap_autotr_${conversation.id}`, lang);
      else localStorage.removeItem(`yap_autotr_${conversation.id}`);
    } catch {}
  }

  // Switching conversations exits select mode / clears a stale reply draft.
  useEffect(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
    setReplyingTo(null);
  }, [conversation?.id]);

  // "Yap AI" on a message's 3-dot menu switches the parent to the standing
  // Yap AI chat and asks it to prefill the composer with a quote of that
  // message - once it arrives here, drop it into the input and tell the
  // parent it's been used so it doesn't reapply on a later render.
  useEffect(() => {
    if (!pendingAiQuote) return;
    setText(pendingAiQuote);
    onConsumeAiQuote && onConsumeAiQuote();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAiQuote]);

  // "Reply privately": shown as a preview above the composer (not as text in
  // the box); it is attached to the first message sent, then cleared.
  const [privateQuote, setPrivateQuote] = useState(null);
  useEffect(() => {
    if (!pendingPrivateQuote) return;
    setPrivateQuote(pendingPrivateQuote);
    onConsumePrivateQuote && onConsumePrivateQuote();
    requestAnimationFrame(() => inputRef.current?.focus());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingPrivateQuote]);
  const activePrivateQuote =
    privateQuote && String(privateQuote.convId) === String(conversation?.id) ? privateQuote : null;

  // Live link preview above the composer while a link is typed/pasted
  // (debounced so we don't fetch on every keystroke).
  const [composerUrl, setComposerUrl] = useState(null);
  const [dismissedUrl, setDismissedUrl] = useState(null);
  useEffect(() => {
    const u = prefs.linkPreviews && !editing ? extractFirstUrl(text) : null;
    const t = setTimeout(() => setComposerUrl(u && /^https?:\/\/[^/\s]+\.[a-z]{2,}/i.test(u) ? u : null), u ? 500 : 0);
    return () => clearTimeout(t);
  }, [text, prefs.linkPreviews, editing]);
  useEffect(() => {
    setDismissedUrl(null);
  }, [conversation?.id]);

  function handleScroll(e) {
    if (e.target.scrollTop < 60 && hasMore) {
      onLoadMore();
    }
  }

  function handleTyping(value) {
    setText(value);
    if (!editing) {
      onTyping(true);
      clearTimeout(typingTimeout.current);
      typingTimeout.current = setTimeout(() => onTyping(false), 1500);
    }
    // "@..." right before the caret opens the member picker (groups only)
    if (conversation?.isGroup) {
      const caret = inputRef.current?.selectionStart ?? value.length;
      const m = /(^|\s)@([A-Za-z0-9_.]*)$/.exec(value.slice(0, caret));
      setMention(m ? { start: caret - m[2].length - 1, query: m[2].toLowerCase(), index: 0 } : null);
    }
  }

  const mentionMatches = useMemo(() => {
    if (!mention || !conversation?.isGroup) return [];
    return (conversation.participants || [])
      .filter((p) => String(p.id) !== String(currentUserId) && !p.isBot)
      .filter((p) => !mention.query || p.username?.toLowerCase().includes(mention.query) || p.name?.toLowerCase().includes(mention.query))
      .slice(0, 6);
  }, [mention, conversation, currentUserId]);

  function pickMention(person) {
    if (!mention) return;
    const caret = inputRef.current?.selectionStart ?? text.length;
    const before = text.slice(0, mention.start);
    const after = text.slice(caret);
    const inserted = `@${person.username} `;
    setText(before + inserted + after);
    setMention(null);
    requestAnimationFrame(() => {
      const pos = (before + inserted).length;
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(pos, pos);
    });
  }

  function handleInputKeyDown(e) {
    if (mention && mentionMatches.length > 0) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const dir = e.key === "ArrowDown" ? 1 : -1;
        setMention((m) => ({ ...m, index: (m.index + dir + mentionMatches.length) % mentionMatches.length }));
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        pickMention(mentionMatches[Math.min(mention.index, mentionMatches.length - 1)]);
        return;
      }
    }
    if (e.key === "Escape") {
      if (mention) setMention(null);
      else if (editing) cancelEdit();
    }
  }

  function startEdit(message) {
    setEditing(message);
    setReplyingTo(null);
    setText(message.text || "");
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function cancelEdit() {
    setEditing(null);
    setText("");
    setMention(null);
  }

  function handleSend(e) {
    e?.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    if (editing) {
      const target = editing;
      if (trimmed === (target.text || "")) return cancelEdit();
      onEditMessage?.(target.id, trimmed).then((res) => {
        if (res?.error) alert(res.error);
      });
      cancelEdit();
      return;
    }
    const outText = activePrivateQuote
      ? `↪ In ${activePrivateQuote.groupName}, you said: "${activePrivateQuote.snippet}"\n${trimmed}`
      : trimmed;
    onSend({ type: "text", text: outText, replyToId: replyingTo?.id });
    if (activePrivateQuote) setPrivateQuote(null);
    setText("");
    setShowEmoji(false);
    setReplyingTo(null);
    setMention(null);
    onTyping(false);
  }

  function createPoll({ question, options, multiple }) {
    onSend({ type: "poll", text: question, poll: { options, multiple }, replyToId: replyingTo?.id });
    setReplyingTo(null);
  }

  function sendFile(file, viewOnce = false) {
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
      onSend({
        type,
        fileData: reader.result,
        fileName: file.name,
        text: "",
        replyToId: replyingTo?.id,
        ...(viewOnce && (type === "image" || type === "video") ? { viewOnce: true } : {})
      });
      setReplyingTo(null);
    };
    reader.readAsDataURL(file);
  }

  function handleMediaChange(e) {
    const once = viewOnceNextRef.current;
    viewOnceNextRef.current = false;
    sendFile(e.target.files?.[0], once);
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
      onSend({ type: "audio", fileData: result.fileData, fileName: "voice-message.webm", text: "", replyToId: replyingTo?.id });
      setReplyingTo(null);
    }
  }

  function handleToggleSelect(messageId, forceEnter) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (forceEnter && !selectMode) {
        next.add(messageId);
        return next;
      }
      if (next.has(messageId)) next.delete(messageId);
      else next.add(messageId);
      return next;
    });
    if (forceEnter && !selectMode) setSelectMode(true);
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelectedIds(new Set());
  }

  // "Delete for everyone" is offered only when every selected message is mine
  // (and is a real message, not a call log entry).
  const selectedMessages = messages.filter((m) => selectedIds.has(m.id));
  const canDeleteSelectedForEveryone =
    selectedMessages.length > 0 &&
    selectedMessages.every(
      (m) =>
        String(m.sender?.id) === String(currentUserId) &&
        !m.deletedForEveryone &&
        m.type !== "call" &&
        m.type !== "system" &&
        Date.now() - m.timestamp < 48 * 60 * 60 * 1000 // 48h limit, enforced on the server too
    );

  function deleteSelected(forEveryone) {
    selectedMessages.forEach((m) => onDeleteMessage(m.id, forEveryone && canDeleteSelectedForEveryone));
    setConfirmBulkDelete(false);
    exitSelectMode();
  }

  function forwardSelected() {
    const toForward = messages.filter((m) => selectedIds.has(m.id) && !m.viewOnce);
    setForwardTarget(toForward);
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
  const avatarUrl = conversation.isGroup ? conversation.groupAvatarUrl : conversation.peer?.avatarUrl;
  const cannotSend = !!conversation.isGroup && !!conversation.onlyAdminsSend && !(conversation.admins || []).includes(String(currentUserId));
  const pinnedCount = messages.filter((m) => m.pinned && !m.deletedForEveryone).length;
  const isBotChat = !conversation.isGroup && !!conversation.peer?.isBot;
  const peerId = conversation.peer?.id;
  const status = peerId && !conversation.peerHidden ? presence[peerId] : null;
  const isTyping = typingUsers.length > 0;
  // Only the person who blocked sees anything about it. The blocked person's
  // screen looks completely normal (calls just won't connect, messages stay at one tick).
  const isBlockedEitherWay = conversation.isBlockedByMe;
  // Look the viewer's message up live from `messages` (rather than storing a
  // snapshot) so it auto-closes if the message gets deleted while it's open.
  const viewerMessage = viewerMessageId
    ? messages.find((m) => m.id === viewerMessageId && !m.deletedForEveryone) || null
    : null;
  const viewerIsOwn = viewerMessage ? String(viewerMessage.sender?.id || viewerMessage.sender) === String(currentUserId) : false;

  const subtitle = conversation.isGroup
    ? `${conversation.participants?.length || 0} members`
    : isBotChat
    ? isTyping
      ? "typing…"
      : "Your AI assistant"
    : conversation.isBlockedByMe
    ? "Blocked"
    : isTyping
    ? "typing…"
    : conversation.peerHidden
    ? ""
    : lastSeenLabel(status, conversation.peer?.lastSeen);

  const forwardableConversations = allConversations.filter((c) => c.id !== conversation.id);

  return (
    <div className="flex-1 flex flex-col h-full relative">
      {selectMode ? (
        <div className="h-16 bg-[var(--wa-panel-header)] flex items-center justify-between px-4 border-l border-[var(--wa-border)]">
          <div className="flex items-center gap-3">
            <button onClick={exitSelectMode} className="p-1 text-[var(--wa-icon)]">
              <X size={20} />
            </button>
            <span className="text-sm font-medium text-[var(--wa-text-primary)]">{selectedIds.size} selected</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={forwardSelected}
              disabled={selectedIds.size === 0}
              className="px-3 py-2 rounded-full hover:bg-[var(--wa-border)] text-[var(--wa-icon)] disabled:opacity-30 flex items-center gap-1.5 text-sm"
              title="Forward"
            >
              <Forward size={20} /> <span className="hidden sm:inline">Forward</span>
            </button>
            <button
              onClick={() => setConfirmBulkDelete(true)}
              disabled={selectedIds.size === 0}
              className="px-3 py-2 rounded-full hover:bg-[var(--wa-border)] text-[var(--wa-danger)] disabled:opacity-30 flex items-center gap-1.5 text-sm font-medium"
              title="Delete"
            >
              <Trash2 size={20} /> Delete
            </button>
          </div>
        </div>
      ) : (
        <div className="h-16 bg-[var(--wa-panel-header)] flex items-center justify-between px-4 border-l border-[var(--wa-border)]">
          <button
            onClick={() => setShowContactInfo(true)}
            className="flex items-center gap-3 min-w-0 flex-1 text-left"
          >
            <ArrowLeft size={20} className="md:hidden p-0 text-[var(--wa-icon)]" onClick={(e) => { e.stopPropagation(); onBack(); }} />
            <Avatar
              name={label}
              color={color}
              avatarUrl={avatarUrl}
              size={40}
              isGroup={conversation.isGroup}
              isBot={isBotChat}
              online={status === "online"}
              showStatus={!isBotChat}
            />
            <div className="min-w-0">
              <p className="text-sm font-medium text-[var(--wa-text-primary)] truncate">{label}</p>
              <p className={`text-xs truncate ${isTyping ? "text-[var(--wa-green)]" : "text-[var(--wa-text-secondary)]"}`}>{subtitle}</p>
            </div>
          </button>

          <div className="flex items-center gap-1 text-[var(--wa-icon)]">
            {conversation.isGroup && (
              <>
                <button
                  onClick={() => onStartGroupCall?.("audio")}
                  disabled={callActive}
                  title="Group voice call"
                  className="p-2 rounded-full hover:bg-[var(--wa-border)] disabled:opacity-30"
                >
                  <Phone size={19} />
                </button>
                <button
                  onClick={() => onStartGroupCall?.("video")}
                  disabled={callActive}
                  title="Group video call"
                  className="p-2 rounded-full hover:bg-[var(--wa-border)] disabled:opacity-30"
                >
                  <Video size={20} />
                </button>
              </>
            )}
            {!conversation.isGroup && !isBotChat && (
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
            <button
              onClick={() => (searchOpen ? closeSearch() : setSearchOpen(true))}
              title="Search in chat"
              className={`p-2 rounded-full hover:bg-[var(--wa-border)] ${searchOpen ? "bg-[var(--wa-border)]" : ""}`}
            >
              <Search size={19} />
            </button>
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
                  <button
                    onClick={() => {
                      setShowHeaderMenu(false);
                      setSearchOpen(true);
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-[var(--wa-sidebar-hover)] flex items-center gap-2.5"
                  >
                    <Search size={16} /> Search
                  </button>
                  {conversation.isGroup && (
                    <button
                      onClick={() => {
                        setShowHeaderMenu(false);
                        setShowMentions(true);
                        setSearchOpen(false);
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-[var(--wa-sidebar-hover)] flex items-center gap-2.5"
                    >
                      <AtSign size={16} /> Mentions
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setShowHeaderMenu(false);
                      setShowAutoTr(true);
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-[var(--wa-sidebar-hover)] flex items-center gap-2.5"
                  >
                    <Languages size={16} /> {autoLang ? `Auto-translate: ${autoLang}` : "Auto-translate chat"}
                  </button>
                  <button
                    onClick={() => {
                      setShowHeaderMenu(false);
                      setSelectMode(true);
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-[var(--wa-sidebar-hover)] flex items-center gap-2.5"
                  >
                    <CheckSquare size={16} /> Select messages
                  </button>
                  {!conversation.archived && (
                  <button
                    onClick={() => {
                      setShowHeaderMenu(false);
                      onTogglePinChat?.(conversation);
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-[var(--wa-sidebar-hover)] flex items-center gap-2.5"
                  >
                    <Pin size={16} /> {conversation.pinned ? "Unpin chat" : "Pin chat"}
                  </button>
                  )}
                  <button
                    onClick={() => {
                      setShowHeaderMenu(false);
                      onToggleArchive?.(conversation);
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-[var(--wa-sidebar-hover)] flex items-center gap-2.5"
                  >
                    <Archive size={16} /> {conversation.archived ? "Unarchive chat" : "Archive chat"}
                  </button>
                  {!conversation.isGroup && !isBotChat && (
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
                  {!isBotChat && (
                    <button
                      onClick={() => {
                        setShowHeaderMenu(false);
                        onToggleFavourite?.(conversation);
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-[var(--wa-sidebar-hover)] flex items-center gap-2.5"
                    >
                      <StarIcon size={16} className={conversation.favourite ? "fill-current" : ""} />
                      {conversation.favourite ? "Remove from favourites" : "Add to favourites"}
                    </button>
                  )}
                  {!isBotChat && (
                    <button
                      onClick={() => {
                        setShowHeaderMenu(false);
                        setShowTimer(true);
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-[var(--wa-sidebar-hover)] flex items-center gap-2.5"
                    >
                      <Timer size={16} /> Disappearing messages
                      <span className="ml-auto text-xs text-[var(--wa-text-muted)]">{timerLabel(conversation.disappearingSeconds || 0)}</span>
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setShowHeaderMenu(false);
                      setShowThemePicker(true);
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-[var(--wa-sidebar-hover)] flex items-center gap-2.5"
                  >
                    <Palette size={16} /> Chat wallpaper
                  </button>
                  <button
                    onClick={() => {
                      setShowHeaderMenu(false);
                      exportChat();
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-[var(--wa-sidebar-hover)] flex items-center gap-2.5"
                  >
                    <Download size={16} /> Export chat
                  </button>
                  <button
                    onClick={() => {
                      setShowHeaderMenu(false);
                      onCloseChat?.();
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-[var(--wa-sidebar-hover)] flex items-center gap-2.5"
                  >
                    <XSquare size={16} /> Close chat
                  </button>
                  <div className="my-1 border-t border-[var(--wa-border-light)]" />
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
                  {!conversation.isGroup && !isBotChat && (
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
      )}

      {searchOpen && (
        <div className="bg-[var(--wa-panel)] border-b border-[var(--wa-border)]">
          <div className="flex items-center gap-2 px-4 py-2">
            <Search size={16} className="text-[var(--wa-icon)] shrink-0" />
            <input
              autoFocus
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && closeSearch()}
              placeholder="Search messages in this chat"
              className="flex-1 bg-transparent outline-none text-sm text-[var(--wa-text-primary)]"
            />
            <button onClick={closeSearch} className="p-1 text-[var(--wa-icon)]" title="Close search">
              <X size={18} />
            </button>
          </div>
          {searchQuery.trim() && (
            <div className="max-h-64 overflow-y-auto border-t border-[var(--wa-border)]">
              {searching && searchResults.length === 0 ? (
                <p className="px-4 py-3 text-xs text-[var(--wa-text-secondary)]">Searching…</p>
              ) : searchResults.length === 0 ? (
                <p className="px-4 py-3 text-xs text-[var(--wa-text-secondary)]">No messages found</p>
              ) : (
                searchResults.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => jumpToResult(r)}
                    className="w-full text-left px-4 py-2 hover:bg-[var(--wa-sidebar-hover)] border-b border-[var(--wa-border)] last:border-b-0"
                  >
                    <div className="flex justify-between gap-2 text-xs text-[var(--wa-text-secondary)]">
                      <span className="truncate">
                        {String(r.senderId) === String(currentUserId) ? "You" : r.senderName}
                      </span>
                      <span className="shrink-0">
                        {new Date(r.timestamp).toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" })}{" "}
                        {new Date(r.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    <p className="text-sm text-[var(--wa-text-primary)] truncate">{highlightMatch(r.text, searchQuery)}</p>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {showMentions && (
        <MentionsPanel
          conversationId={conversation.id}
          currentUserId={currentUserId}
          onClose={() => setShowMentions(false)}
          onJump={(id, ts) => {
            jumpToMessage(id, ts);
            setShowMentions(false);
          }}
        />
      )}

      {showThemePicker && (
        <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center" onClick={() => setShowThemePicker(false)}>
          <div className="bg-[var(--wa-panel)] rounded-lg shadow-xl p-5 w-80 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-medium text-[var(--wa-text-primary)] mb-1">Chat wallpaper</p>
            <p className="text-xs text-[var(--wa-text-secondary)] mb-3">Only for this chat, on this device.</p>
            <input ref={wallpaperFileRef} type="file" accept="image/*" className="hidden" onChange={pickOwnWallpaper} />
            <button
              onClick={() => wallpaperFileRef.current?.click()}
              className={`w-full mb-3 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm border-2 border-dashed ${
                chatTheme?.startsWith("img:") ? "border-[var(--wa-green)] text-[var(--wa-green)]" : "border-[var(--wa-border)] text-[var(--wa-text-secondary)]"
              }`}
            >
              <ImageIcon size={16} /> {chatTheme?.startsWith("img:") ? "Change my photo" : "Choose from my photos"}
            </button>
            <p className="text-xs text-[var(--wa-text-secondary)] mb-2">Wallpapers</p>
            <div className="grid grid-cols-4 gap-3 mb-4">
              {WALLPAPERS.filter((w) => w.id !== "default").map((w) => (
                <button
                  key={w.id}
                  onClick={() => applyTheme(`wp:${w.id}`)}
                  style={w.style || undefined}
                  title={w.label}
                  aria-label={`${w.label} wallpaper`}
                  className={`h-12 rounded-md border chat-bg-pattern ${chatTheme === `wp:${w.id}` ? "ring-2 ring-[var(--wa-green)]" : "border-[var(--wa-border)]"}`}
                />
              ))}
            </div>
            <p className="text-xs text-[var(--wa-text-secondary)] mb-2">Colours</p>
            <div className="grid grid-cols-4 gap-3">
              <button
                onClick={() => applyTheme(null)}
                className={`h-12 rounded-md border text-[10px] text-[var(--wa-text-secondary)] chat-bg-pattern ${!chatTheme ? "ring-2 ring-[var(--wa-green)]" : "border-[var(--wa-border)]"}`}
              >
                Default
              </button>
              {["#0b3d3a", "#1e2a4a", "#3b1f4a", "#4a1f2b", "#3d3a14", "#1f2f1f", "#2b2b2b", "#e8dcc8"].map((c) => (
                <button
                  key={c}
                  onClick={() => applyTheme(c)}
                  style={{ backgroundColor: c }}
                  className={`h-12 rounded-md ${chatTheme === c ? "ring-2 ring-[var(--wa-green)]" : ""}`}
                  title={c}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {!isBotChat && <CatchMeUp conversationId={conversation.id} />}

      {conversation.isGroup && groupCallStatus && !callActive && (
        <button
          onClick={onJoinGroupCall}
          className="flex items-center gap-2 px-4 py-2 bg-[var(--wa-green)] text-white text-sm text-left"
        >
          {groupCallStatus.callType === "video" ? <Video size={16} /> : <Phone size={16} />}
          <span className="flex-1 truncate">
            {groupCallStatus.callType === "video" ? "Video" : "Voice"} call in progress · {groupCallStatus.participants?.length || 1} in call
          </span>
          <span className="font-medium">Join</span>
        </button>
      )}

      {pinnedMessage && (
        <button
          onClick={() => setShowPinned(true)}
          className="flex items-center gap-2 px-4 py-2 bg-[var(--wa-panel-header)] border-b border-[var(--wa-border)] text-left"
          title="See pinned messages"
        >
          <Pin size={14} className="text-[var(--wa-green)] shrink-0" />
          <span className="text-xs text-[var(--wa-text-secondary)] truncate flex-1">
            {pinnedMessage.text || `(${pinnedMessage.type})`}
          </span>
          {pinnedCount > 1 && <span className="text-[11px] text-[var(--wa-green)] shrink-0">{pinnedCount} pinned</span>}
        </button>
      )}

      {conversation.disappearingSeconds > 0 && (
        <div className="flex items-center justify-center gap-1.5 px-4 py-1.5 bg-[var(--wa-panel-header)] border-b border-[var(--wa-border)] text-xs text-[var(--wa-text-secondary)]">
          <Timer size={12} /> Messages disappear after {timerLabel(conversation.disappearingSeconds)}
        </div>
      )}

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        style={chatBackgroundStyle(chatTheme, prefs.wallpaper)}
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
                  currentUserId={currentUserId}
                  onReact={onReact}
                  onTogglePin={onTogglePin}
                  onToggleStar={onToggleStar}
                  onReply={setReplyingTo}
                  onForward={(msg) => setForwardTarget([msg])}
                  onShowInfo={setInfoTarget}
                  onReport={(msg) =>
                    setReportTarget({
                      userId: msg.sender?.id,
                      userName: msg.sender?.name,
                      conversationId: conversation.id,
                      messageId: msg.id
                    })
                  }
                  onYapAI={onAskYapAI}
                  selectMode={selectMode}
                  selected={selectedIds.has(m.id)}
                  onToggleSelect={handleToggleSelect}
                  highlighted={highlightId === m.id}
                  onEdit={startEdit}
                  onVotePoll={onVotePoll}
                  mentionables={mentionables}
                  nameById={nameById}
                  onJumpToMessage={jumpToMessage}
                  onOpenThread={(msg) => setThreadRootId(msg.id)}
                  replyCount={Math.max(m.replyCount || 0, liveReplyCounts.get(String(m.id)) || 0)}
                  onReplyPrivately={conversation.isGroup ? onReplyPrivately : undefined}
                  autoTranslation={autoLang ? autoTr[`${autoLang}:${m.id}`] || "" : ""}
                  onCallBack={onStartCall}
                  canCallBack={!conversation.isGroup && !isBotChat && !callActive && !isBlockedEitherWay}
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

      {conversation.isBlockedByMe && (
        <div className="bg-[var(--wa-panel-header)] px-4 py-2 text-center text-sm text-[var(--wa-text-secondary)] border-t border-[var(--wa-border)]">
          You have blocked {conversation.peer?.name}. They won&apos;t receive anything you send until you unblock.{" "}
          <button onClick={onToggleBlock} className="text-[var(--wa-green)] font-medium">
            Unblock
          </button>
        </div>
      )}
      {cannotSend ? (
        <div className="bg-[var(--wa-panel-header)] px-4 py-4 text-center text-sm text-[var(--wa-text-secondary)]">
          Only admins can send messages in this group.
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
            <span className="w-2.5 h-2.5 rounded-full bg-[var(--wa-danger)] animate-pulse shrink-0" />
            <span className="tabular-nums shrink-0">{formatRecordTime(recorder.seconds)}</span>
            <div className="flex-1 min-w-0 h-8 flex items-center justify-end gap-[3px] overflow-hidden" aria-label="Recording level">
              {recorder.levels.map((l, i) => (
                <span
                  key={i}
                  className="w-[3px] rounded-full bg-[var(--wa-green)] shrink-0"
                  style={{ height: `${Math.max(12, Math.round(l * 100))}%`, opacity: 0.45 + 0.55 * (i / Math.max(1, recorder.levels.length)) }}
                />
              ))}
            </div>
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
        <div className="bg-[var(--wa-panel-header)]">
          {editing && (
            <div className="flex items-center gap-2 px-4 pt-2">
              <div className="flex-1 min-w-0 flex items-center gap-2 bg-[var(--wa-panel)] rounded-lg px-3 py-1.5 border-l-4 border-[var(--wa-green)]">
                <Pencil size={14} className="text-[var(--wa-green)] shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-[var(--wa-green)]">Editing message</p>
                  <p className="text-xs text-[var(--wa-text-secondary)] truncate">{editing.text}</p>
                </div>
              </div>
              <button onClick={cancelEdit} className="p-1 text-[var(--wa-icon)]" title="Cancel edit">
                <X size={16} />
              </button>
            </div>
          )}
          {!editing && !isBotChat && (
            <RewriteBar text={text} conversationId={conversation.id} onApply={(t) => { setText(t); requestAnimationFrame(() => inputRef.current?.focus()); }} />
          )}
          {!isBotChat && !editing && (
            <SuggestedReplies
              conversationId={conversation.id}
              messages={messages}
              currentUserId={currentUserId}
              onPick={(s) => { setText(s); requestAnimationFrame(() => inputRef.current?.focus()); }}
            />
          )}
          {composerUrl && composerUrl !== dismissedUrl && !editing && (
            <div className="px-4 pt-2 flex items-start gap-2">
              <div className="min-w-0 flex-1 [&>a]:max-w-full [&>a]:mb-0">
                <LinkPreview key={composerUrl} url={composerUrl} />
              </div>
              <button type="button" onClick={() => setDismissedUrl(composerUrl)} className="p-1 text-[var(--wa-icon)]" aria-label="Remove link preview">
                <X size={16} />
              </button>
            </div>
          )}
          {activePrivateQuote && !editing && (
            <div className="flex items-center gap-2 px-4 pt-2">
              <div className="flex-1 min-w-0 flex items-center gap-2 bg-[var(--wa-panel)] rounded-lg px-3 py-1.5 border-l-4 border-[var(--wa-green)]">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-[var(--wa-green)]">Replying privately · from {activePrivateQuote.groupName}</p>
                  <p className="text-xs text-[var(--wa-text-secondary)] truncate">{activePrivateQuote.snippet}</p>
                </div>
              </div>
              <button type="button" onClick={() => setPrivateQuote(null)} className="p-1 text-[var(--wa-icon)]" aria-label="Cancel private reply">
                <X size={16} />
              </button>
            </div>
          )}
          {replyingTo && !editing && (
            <div className="flex items-center gap-2 px-4 pt-2">
              <div className="flex-1 min-w-0 flex items-center gap-2 bg-[var(--wa-panel)] rounded-lg px-3 py-1.5 border-l-4 border-[var(--wa-green)]">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-[var(--wa-green)]">
                    {String(replyingTo.sender?.id) === String(currentUserId) ? "You" : replyingTo.sender?.name}
                  </p>
                  <p className="text-xs text-[var(--wa-text-secondary)] truncate">
                    {replyingTo.text || `(${replyingTo.type})`}
                  </p>
                </div>
              </div>
              <button onClick={() => setReplyingTo(null)} className="p-1 text-[var(--wa-icon)]">
                <X size={16} />
              </button>
            </div>
          )}

          <form onSubmit={handleSend} className="px-2 md:px-4 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] flex items-center gap-0.5 md:gap-2 relative">
            {mention && mentionMatches.length > 0 && (
              <div className="absolute bottom-full left-4 right-4 mb-1 bg-[var(--wa-panel)] shadow-lg rounded-lg py-1 z-20 max-h-56 overflow-y-auto">
                {mentionMatches.map((p, i) => (
                  <button
                    type="button"
                    key={p.id}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      pickMention(p);
                    }}
                    className={`w-full text-left px-3 py-1.5 flex items-center gap-2.5 hover:bg-[var(--wa-sidebar-hover)] ${
                      i === mention.index ? "bg-[var(--wa-sidebar-hover)]" : ""
                    }`}
                  >
                    <Avatar name={p.name} color={p.avatarColor} avatarUrl={p.avatarUrl} size={28} />
                    <span className="text-sm text-[var(--wa-text-primary)] truncate">{p.name}</span>
                    <span className="text-xs text-[var(--wa-text-secondary)] truncate">@{p.username}</span>
                  </button>
                ))}
              </div>
            )}
            {showEmoji && (
              <AnchoredPopover anchorRef={emojiButtonRef} align="start" onClose={() => setShowEmoji(false)}>
                <EmojiPicker onSelect={(emoji) => setText((t) => t + emoji)} />
              </AnchoredPopover>
            )}
            {showAttachMenu && (
              <div className="absolute bottom-16 left-4 bg-[var(--wa-panel)] shadow-lg rounded-lg py-1.5 w-52 z-10 text-sm overflow-hidden">
                <button
                  type="button"
                  onClick={() => {
                    setShowAttachMenu(false);
                    viewOnceNextRef.current = false;
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
                  data-testid="attach-view-once"
                  onClick={() => {
                    setShowAttachMenu(false);
                    viewOnceNextRef.current = true;
                    mediaInputRef.current?.click();
                  }}
                  className="w-full text-left px-4 py-2.5 hover:bg-[var(--wa-sidebar-hover)] flex items-center gap-3 text-[var(--wa-text-primary)]"
                >
                  <span className="w-8 h-8 rounded-full bg-[#00a884] flex items-center justify-center text-white shrink-0">
                    <EyeOff size={16} />
                  </span>
                  View-once photo or video
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
                {conversation.isGroup && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowAttachMenu(false);
                      setShowPollModal(true);
                    }}
                    className="w-full text-left px-4 py-2.5 hover:bg-[var(--wa-sidebar-hover)] flex items-center gap-3 text-[var(--wa-text-primary)]"
                  >
                    <span className="w-8 h-8 rounded-full bg-[#f4b400] flex items-center justify-center text-white shrink-0">
                      <BarChart3 size={16} />
                    </span>
                    Poll
                  </button>
                )}
              </div>
            )}
            <button
              ref={emojiButtonRef}
              type="button"
              onClick={() => setShowEmoji((v) => !v)}
              className="p-1.5 md:p-2 shrink-0 text-[var(--wa-icon)] hover:text-[var(--wa-text-primary)]"
            >
              <Smile size={22} />
            </button>
            <button
              type="button"
              onClick={() => {
                setShowAttachMenu((v) => !v);
                setShowEmoji(false);
              }}
              className="p-1.5 md:p-2 shrink-0 text-[var(--wa-icon)] hover:text-[var(--wa-text-primary)] rotate-45"
            >
              <Paperclip size={22} />
            </button>
            <input ref={mediaInputRef} type="file" accept="image/*,video/*" className="hidden" onChange={handleMediaChange} />
            <input ref={docInputRef} type="file" className="hidden" onChange={handleDocChange} />
            <input ref={audioInputRef} type="file" accept="audio/*" className="hidden" onChange={handleAudioFileChange} />
            <input
              ref={inputRef}
              value={text}
              onChange={(e) => handleTyping(e.target.value)}
              onKeyDown={handleInputKeyDown}
              onKeyUp={(e) => {
                // moving the caret with the arrow keys / clicking re-checks the "@" token
                if (conversation.isGroup && ["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) handleTyping(e.target.value);
              }}
              placeholder={editing ? "Edit message" : conversation.isGroup ? "Type a message, @ to mention" : "Type a message"}
              className="flex-1 min-w-0 bg-[var(--wa-panel)] rounded-lg px-3 md:px-4 py-2.5 text-base md:text-sm outline-none text-[var(--wa-text-primary)]"
            />
            {!editing && !isBotChat && (
              <button
                type="button"
                onClick={() => setShowSchedule(true)}
                title="Schedule message"
                className="p-1.5 md:p-2 shrink-0 text-[var(--wa-icon)] hover:text-[var(--wa-text-primary)]"
              >
                <Clock size={20} />
              </button>
            )}
            {text.trim() ? (
              <button
                type="submit"
                className="p-2.5 shrink-0 rounded-full bg-[var(--wa-green)] text-white hover:bg-[var(--wa-green-dark)]"
              >
                <Send size={18} />
              </button>
            ) : (
              <button
                type="button"
                onClick={recorder.start}
                title="Record a voice message"
                className="p-2.5 shrink-0 rounded-full bg-[var(--wa-green)] text-white hover:bg-[var(--wa-green-dark)]"
              >
                <Mic size={18} />
              </button>
            )}
          </form>
        </div>
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
          currentUserId={currentUserId}
          allConversations={allConversations}
          onJumpToMessage={jumpToMessage}
          isBlocked={conversation.isBlockedByMe}
          onClose={() => setShowContactInfo(false)}
          onToggleBlock={() => {
            setShowContactInfo(false);
            onToggleBlock();
          }}
          onReport={() => {
            setShowContactInfo(false);
            setReportTarget({ userId: conversation.peer?.id, userName: conversation.peer?.name, conversationId: conversation.id });
          }}
        />
      )}

      {showAutoTr && (
        <AutoTranslateModal
          current={autoLang}
          chatName={conversation.isGroup ? conversation.groupName : conversation.peer?.name || "this chat"}
          onPick={chooseAutoLang}
          onClose={() => setShowAutoTr(false)}
        />
      )}

      {forwardTarget && (
        <ForwardModal
          conversations={forwardableConversations}
          maxTargets={forwardTarget.some((m) => (m.forwardCount || 0) >= 5) ? 1 : 5}
          onClose={() => setForwardTarget(null)}
          onForward={(targetIds) => {
            onForwardMessages(forwardTarget, targetIds);
            if (selectMode) exitSelectMode();
          }}
        />
      )}

      {infoTarget && (
        <MessageInfoModal
          message={infoTarget}
          isOwn={String(infoTarget.sender?.id) === String(currentUserId)}
          isGroup={!!conversation.isGroup}
          onClose={() => setInfoTarget(null)}
        />
      )}
      {showPinned && (
        <PinnedMessagesModal
          conversationId={conversation.id}
          onJump={(it) => jumpToMessage(it.id, it.timestamp)}
          onUnpin={(id) => onTogglePin(id)}
          onClose={() => setShowPinned(false)}
        />
      )}
      {showTimer && (
        <DisappearingModal
          current={conversation.disappearingSeconds || 0}
          onSelect={(s) => onSetDisappearing?.(conversation, s)}
          onClose={() => setShowTimer(false)}
        />
      )}
      {reportTarget && <ReportModal target={reportTarget} canBlock={!conversation.isGroup} onClose={() => setReportTarget(null)} />}

      {confirmBulkDelete && (
        <ConfirmDeleteModal
          count={selectedIds.size}
          isOwn={canDeleteSelectedForEveryone}
          onCancel={() => setConfirmBulkDelete(false)}
          onConfirm={deleteSelected}
        />
      )}

      {showPollModal && <PollModal onClose={() => setShowPollModal(false)} onCreate={createPoll} />}

      {showSchedule && (
        <ScheduleModal
          conversationId={conversation.id}
          initialText={text}
          onClose={() => setShowSchedule(false)}
          onScheduled={() => setText("")}
        />
      )}

      {threadRootId && (
        <ThreadPanel
          conversationId={conversation.id}
          rootId={threadRootId}
          messages={messages}
          currentUserId={currentUserId}
          members={mentionables}
          onClose={() => setThreadRootId(null)}
          onSend={onSend}
          onJump={(id, ts) => {
            jumpToMessage(id, ts);
            setThreadRootId(null);
          }}
        />
      )}
    </div>
  );
}
