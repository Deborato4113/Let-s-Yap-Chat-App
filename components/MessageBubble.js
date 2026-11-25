"use client";

import { useRef, useState } from "react";
import api from "@/lib/api";
import ViewOnceViewer from "./ViewOnceViewer";
import { translateTarget, TRANSLATE_LANGUAGES } from "@/lib/languages";
import { formatTime, formatFileSize } from "@/lib/utils";
import Ticks from "./Ticks";
import {
  MoreVertical,
  Trash2,
  FileText,
  Download,
  Smile,
  Reply as ReplyIcon,
  Info,
  Copy,
  Forward,
  Pin,
  PinOff,
  Sparkles,
  Star,
  CheckSquare,
  Share2,
  ExternalLink,
  Pencil,
  MessageSquare,
  Flag,
  Languages,
  FileAudio,
  ScanText,
  CornerUpRight,
  EyeOff
} from "lucide-react";
import ConfirmDeleteModal from "./ConfirmDeleteModal";
import AudioMessage from "./AudioMessage";
import ReactionBar from "./ReactionBar";
import FlaggedText from "./FlaggedText";
import RichText, { extractFirstUrl } from "./RichText";
import LinkPreview from "./LinkPreview";
import CallEntry from "./CallEntry";
import { getPrefs, setPref } from "@/lib/prefs";
import PollMessage from "./PollMessage";

const EDIT_WINDOW_MS = 15 * 60 * 1000;
const DELETE_FOR_EVERYONE_WINDOW_MS = 48 * 60 * 60 * 1000; // keep in step with lib/socketServer.js
import AnchoredPopover from "./AnchoredPopover";

const HEART_EMOJIS = new Set([
  "❤️", "♥️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎",
  "💕", "💖", "💗", "💓", "💞", "💘", "❣️"
]);

// WhatsApp shows a short, text-free, emoji-only message ("just a 👍" or "❤️")
// much larger with no bubble background - detect that case here. Handles
// multi-codepoint emoji (skin tones, ZWJ sequences, variation selectors) by
// segmenting on grapheme clusters rather than raw JS string length.
function getEmojiOnlyInfo(text) {
  if (!text) return null;
  const trimmed = text.trim();
  if (!trimmed) return null;

  const units =
    typeof Intl !== "undefined" && Intl.Segmenter
      ? [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(trimmed)].map((s) => s.segment)
      : [...trimmed];

  if (units.length === 0 || units.length > 3) return null;

  const emojiPattern = /\p{Extended_Pictographic}/u;
  const allEmoji = units.every((u) => emojiPattern.test(u));
  if (!allEmoji) return null;

  return { count: units.length, isHeart: units.length === 1 && HEART_EMOJIS.has(units[0]) };
}

function groupReactions(reactions, currentUserId) {
  const byEmoji = new Map();
  for (const r of reactions) {
    if (!byEmoji.has(r.emoji)) byEmoji.set(r.emoji, { emoji: r.emoji, count: 0, mine: false });
    const g = byEmoji.get(r.emoji);
    g.count += 1;
    if (String(r.userId) === String(currentUserId)) g.mine = true;
  }
  return [...byEmoji.values()];
}

export default function MessageBubble({
  message,
  isOwn,
  showSender,
  senderName,
  onDelete,
  onOpenMedia,
  currentUserId,
  onReact,
  onTogglePin,
  onToggleStar,
  onReply,
  onForward,
  onShowInfo,
  onReport,
  onYapAI,
  selectMode,
  selected,
  onToggleSelect,
  highlighted = false,
  onEdit,
  onVotePoll,
  mentionables = [],
  nameById = {},
  onJumpToMessage,
  onOpenThread,
  replyCount = 0,
  onCallBack,
  canCallBack = false,
  onReplyPrivately,
  autoTranslation = ""
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [reactionBarOpen, setReactionBarOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  // Translate / voice-note-to-text results (shown under the message, only for me)
  const [ai, setAi] = useState({ translation: "", transcript: "", imageResult: null, busy: "", error: "" });
  const [picking, setPicking] = useState(false);
  // View-once: the file is fetched only when the person taps, and handed over a single time
  const [vo, setVo] = useState(null); // { loading } | { error } | { type, fileData }
  async function openViewOnce() {
    if (vo?.loading) return;
    setVo({ loading: true });
    try {
      const { data } = await api.post(`/messages/${message.id}/view-once`);
      setVo({ type: data.type, fileData: data.fileData });
    } catch (err) {
      setVo({ error: err.response?.data?.message || "Couldn't open this." });
    }
  }
  async function doImageAi(mode) {
    setAi((a) => ({ ...a, busy: mode === "text" ? "ocr" : "describe", error: "" }));
    try {
      const { data } = await api.post("/ai/image", { messageId: message.id, mode });
      setAi((a) => ({
        ...a,
        busy: "",
        imageResult: data.result ? { mode, text: data.result } : null,
        error: data.result ? "" : "No readable text found in this photo."
      }));
    } catch (err) {
      setAi((a) => ({ ...a, busy: "", error: err.response?.data?.message || "Couldn't read this photo." }));
    }
  }
  async function doTranslate(target) {
    setPicking(false);
    if (target) setPref("translateTo", target); // remembered as the next suggestion
    setAi((a) => ({ ...a, busy: "translate", error: "" }));
    try {
      const { data } = await api.post("/ai/translate", { text: message.text, target: target || translateTarget() });
      setAi((a) => ({ ...a, translation: data.translation, busy: "" }));
    } catch (err) {
      setAi((a) => ({ ...a, busy: "", error: err.response?.data?.message || "Couldn't translate." }));
    }
  }
  async function doTranscribe() {
    setAi((a) => ({ ...a, busy: "transcribe", error: "" }));
    try {
      const { data } = await api.post("/ai/transcribe", { messageId: message.id });
      setAi((a) => ({ ...a, transcript: data.transcript || "", busy: "", error: data.transcript ? "" : "Couldn't hear any speech in this voice message." }));
    } catch (err) {
      setAi((a) => ({ ...a, busy: "", error: err.response?.data?.message || "Couldn't convert this voice message." }));
    }
  }
  const reactionButtonRef = useRef(null);
  const menuButtonRef = useRef(null);

  if (message.type === "system") {
    return (
      <div className="flex justify-center my-2">
        <span className="bg-[var(--wa-system-bg)] text-[var(--wa-icon)] text-xs px-3 py-1 rounded-md shadow-sm">
          {message.text}
        </span>
      </div>
    );
  }

  if (message.type === "call") {
    return <CallEntry message={message} isOwn={isOwn} onCallBack={onCallBack} canCallBack={canCallBack} />;
  }

  const canEdit =
    isOwn && message.type === "text" && !message.deletedForEveryone && Date.now() - message.timestamp < EDIT_WINDOW_MS;
  const linkUrl =
    message.type === "text" && !message.deletedForEveryone && !(message.flagged && !isOwn) && getPrefs().linkPreviews
      ? extractFirstUrl(message.text)
      : null;
  const tickStatus = message.readByCount > 0 ? "read" : message.deliveredCount > 0 ? "delivered" : "sent";
  const isMedia = message.type === "image" || message.type === "video" || message.type === "audio";
  const hasAttachment = (isMedia && !message.viewOnce) || (message.type === "file" && message.fileData);
  const reactionGroups = groupReactions(message.reactions || [], currentUserId);
  const emojiOnly =
    message.type === "text" && !message.deletedForEveryone && !message.replyTo
      ? getEmojiOnlyInfo(message.text)
      : null;
  const jumboSize = emojiOnly ? (emojiOnly.count === 1 ? "text-6xl" : emojiOnly.count === 2 ? "text-5xl" : "text-4xl") : "";

  function handleConfirmDelete(forEveryone) {
    onDelete(message.id, forEveryone);
    setConfirming(false);
  }

  function handleBubbleClick() {
    if (selectMode) onToggleSelect(message.id);
  }

  function downloadAttachment() {
    const a = document.createElement("a");
    a.href = message.fileData;
    a.download = message.fileName || "file";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function handleShare() {
    if (navigator.share) {
      try {
        await navigator.share({ text: message.text || message.fileName || "Shared from Let's Yap" });
        return;
      } catch {
        /* user cancelled - fall through to clipboard */
      }
    }
    try {
      await navigator.clipboard.writeText(message.text || message.fileName || "");
    } catch {
      /* clipboard unavailable - nothing more we can do */
    }
  }

  return (
    <div
      id={`msg-${message.id}`}
      className={`flex ${emojiOnly ? "mb-4" : "mb-1.5"} ${isOwn ? "justify-end" : "justify-start"} group animate-fade-in rounded-md transition-colors duration-500 ${
        highlighted ? "bg-yellow-300/40" : ""
      }`}
      onClick={handleBubbleClick}
    >
      {selectMode && (
        <span
          className={`w-5 h-5 mt-1.5 mr-2 rounded-full border-2 flex items-center justify-center shrink-0 cursor-pointer ${
            selected ? "bg-[var(--wa-green)] border-[var(--wa-green)]" : "border-[var(--wa-border-light)]"
          } ${isOwn ? "order-2 ml-2 mr-0" : ""}`}
        >
          {selected && <span className="w-2 h-2 rounded-full bg-white" />}
        </span>
      )}

      <div
        className={`relative max-w-[85%] md:max-w-[65%] ${message.type === "poll" ? "min-w-[260px]" : "min-w-[80px]"} rounded-lg ${
          emojiOnly
            ? "bg-transparent px-2 pt-2 pb-1"
            : `px-2.5 pt-1.5 pb-1.5 shadow-sm ${
                isOwn ? "bg-[var(--wa-bubble-out)] rounded-tr-none bubble-tail-out" : "bg-[var(--wa-panel)] rounded-tl-none bubble-tail-in"
              }`
        } ${selectMode ? "cursor-pointer" : ""}`}
      >
        {showSender && !isOwn && (
          <p className="text-xs font-semibold mb-0.5" style={{ color: "var(--wa-green)" }}>
            {senderName}
          </p>
        )}

        {message.forwardCount > 0 && !message.deletedForEveryone && (
          <p className="flex items-center gap-1 text-[11px] italic text-[var(--wa-text-secondary)] mb-0.5" data-testid="forwarded-label">
            <CornerUpRight size={11} />
            {message.forwardCount >= 5 ? "Forwarded many times" : "Forwarded"}
          </p>
        )}

        {message.replyTo && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (!selectMode && !message.replyTo.deletedForEveryone) onJumpToMessage?.(message.replyTo.id, message.replyTo.timestamp);
            }}
            title="Go to original message"
            className="block w-full text-left mb-1.5 rounded-md bg-black/10 hover:bg-black/15 border-l-4 border-[var(--wa-green)] px-2 py-1"
          >
            <p className="text-xs font-semibold text-[var(--wa-green)]">{message.replyTo.senderName}</p>
            <p className="text-xs text-[var(--wa-text-secondary)] truncate">
              {message.replyTo.deletedForEveryone
                ? "This message was deleted"
                : message.replyTo.text || `(${message.replyTo.type})`}
            </p>
          </button>
        )}

        {message.deletedForEveryone ? (
          <p className="text-sm italic text-[var(--wa-text-muted)] pr-12">This message was deleted</p>
        ) : message.type === "poll" ? (
          <PollMessage message={message} currentUserId={currentUserId} onVote={onVotePoll} nameById={nameById} />
        ) : message.viewOnce ? (
          (() => {
            const opened = message.viewOnceOpened || (vo && (vo.fileData || vo.closed));
            const kind = message.type === "video" ? "video" : "photo";
            if (isOwn) {
              return (
                <div className="mb-1 flex items-center gap-2.5 bg-black/5 rounded-md px-3 py-2 min-w-[190px]" data-testid="view-once-own">
                  <EyeOff size={18} className="text-[var(--wa-icon)]" />
                  <span className="text-sm text-[var(--wa-text-primary)]">
                    View-once {kind}
                    <span className="block text-xs text-[var(--wa-text-secondary)]">
                      {message.viewOnceViews > 0 ? (message.viewOnceViews > 1 ? `Opened by ${message.viewOnceViews}` : "Opened") : "Not opened yet"}
                    </span>
                  </span>
                </div>
              );
            }
            return (
              <button
                type="button"
                disabled={!!opened || selectMode}
                onClick={(e) => { e.stopPropagation(); openViewOnce(); }}
                className={`mb-1 flex items-center gap-2.5 rounded-md px-3 py-2 min-w-[190px] text-left ${opened ? "bg-black/5 opacity-70" : "bg-[var(--wa-green)]/15 hover:bg-[var(--wa-green)]/25"}`}
                data-testid="view-once-open"
              >
                <EyeOff size={18} className="text-[var(--wa-green)]" />
                <span className="text-sm text-[var(--wa-text-primary)]">
                  {opened ? "Opened" : `View-once ${kind}`}
                  <span className="block text-xs text-[var(--wa-text-secondary)]">
                    {vo?.loading ? "Opening…" : vo?.error ? vo.error : opened ? "This can't be opened again" : "Tap to view. You can only open it once."}
                  </span>
                </span>
              </button>
            );
          })()
        ) : message.type === "image" && message.fileData ? (
          <button type="button" onClick={() => onOpenMedia(message)} className="mb-1 block cursor-zoom-in">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={message.fileData}
              alt={message.fileName || "image"}
              className="rounded-md max-w-[260px] max-h-[320px] object-cover"
            />
          </button>
        ) : message.type === "video" && message.fileData ? (
          <button type="button" onClick={() => onOpenMedia(message)} className="mb-1 block relative cursor-zoom-in">
            <video src={message.fileData} className="rounded-md max-w-[260px] max-h-[320px] object-cover" />
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="w-10 h-10 rounded-full bg-black/50 flex items-center justify-center">
                <span className="w-0 h-0 border-y-[7px] border-y-transparent border-l-[11px] border-l-white ml-1" />
              </span>
            </span>
          </button>
        ) : message.type === "audio" && message.fileData ? (
          <AudioMessage message={message} accent={isOwn ? "var(--wa-green-dark)" : "var(--wa-green)"} />
        ) : !message.deletedForEveryone && message.type === "file" && message.fileData ? (
          <a
            href={message.fileData}
            download={message.fileName || "file"}
            className="mb-1 flex items-center gap-2.5 bg-black/5 hover:bg-black/10 rounded-md px-2.5 py-2 min-w-[200px]"
          >
            <span className="w-9 h-9 rounded-full bg-[var(--wa-green)]/15 flex items-center justify-center shrink-0">
              <FileText size={18} className="text-[var(--wa-green)]" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm text-[var(--wa-text-primary)] truncate">{message.fileName || "File"}</span>
              <span className="block text-xs text-[var(--wa-text-secondary)]">{formatFileSize(message.fileData)}</span>
            </span>
            <Download size={16} className="text-[var(--wa-icon)] shrink-0" />
          </a>
        ) : null}

        {!message.deletedForEveryone && message.text && emojiOnly ? (
          <p className={`leading-[1.3] py-1 ${jumboSize} ${emojiOnly.isHeart ? "animate-heartbeat" : ""}`}>
            {message.text}
          </p>
        ) : (
          !message.deletedForEveryone &&
          message.type !== "poll" &&
          message.text && (
            <p className={`text-sm text-[var(--wa-text-primary)] whitespace-pre-wrap break-words [overflow-wrap:anywhere] pr-14 ${isMedia ? "mt-1" : ""}`}>
              <FlaggedText
                message={message}
                isOwn={isOwn}
                render={(t) => <RichText text={t} members={mentionables} meId={currentUserId} />}
              />
            </p>
          )
        )}

        {linkUrl && <LinkPreview url={linkUrl} />}

        {picking && !message.deletedForEveryone && (
          <div className="mt-1 mb-1 border-t border-black/10 pt-1 pr-2" data-testid="translate-picker">
            <p className="text-[11px] font-medium text-[var(--wa-green)] mb-1">Translate into</p>
            <div className="flex flex-wrap gap-1 max-h-36 overflow-y-auto">
              {TRANSLATE_LANGUAGES.map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => doTranslate(l)}
                  className={`text-xs rounded-full px-2.5 py-1 border ${l === translateTarget() ? "border-[var(--wa-green)] text-[var(--wa-green)]" : "border-[var(--wa-border-light)] text-[var(--wa-text-primary)]"} hover:bg-[var(--wa-active)]`}
                >
                  {l}
                </button>
              ))}
            </div>
            <button type="button" className="text-[11px] text-[var(--wa-text-secondary)] hover:underline mt-1" onClick={() => setPicking(false)}>Cancel</button>
          </div>
        )}

        {autoTranslation && !ai.translation && !message.deletedForEveryone && (
          <div className="mt-1 mb-1 border-t border-black/10 pt-1 pr-14 text-sm text-[var(--wa-text-primary)] whitespace-pre-wrap break-words [overflow-wrap:anywhere]" data-testid="auto-translation">
            <p className="text-[10px] font-medium text-[var(--wa-green)]">Auto-translated</p>
            <p>{autoTranslation}</p>
          </div>
        )}

        {(ai.translation || ai.transcript || ai.imageResult || ai.busy || ai.error) && !message.deletedForEveryone && (
          <div className="mt-1 mb-1 border-t border-black/10 pt-1 pr-14 text-sm text-[var(--wa-text-primary)] whitespace-pre-wrap break-words [overflow-wrap:anywhere]" data-testid="ai-extra">
            {ai.busy && <p className="text-xs italic text-[var(--wa-text-secondary)]">{ai.busy === "translate" ? "Translating…" : ai.busy === "ocr" ? "Reading the text…" : ai.busy === "describe" ? "Looking at the photo…" : "Converting to text…"}</p>}
            {ai.error && <p className="text-xs text-[var(--wa-danger)]">{ai.error}</p>}
            {ai.translation && (
              <>
                <p className="text-[10px] font-medium text-[var(--wa-green)]">Translation</p>
                <p>{ai.translation}</p>
              </>
            )}
            {ai.transcript && (
              <>
                <p className="text-[10px] font-medium text-[var(--wa-green)]">Voice message as text</p>
                <p>{ai.transcript}</p>
              </>
            )}
            {ai.imageResult && (
              <>
                <p className="text-[10px] font-medium text-[var(--wa-green)]">{ai.imageResult.mode === "text" ? "Text in photo" : "Description"}</p>
                <p className="select-text">{ai.imageResult.text}</p>
              </>
            )}
            {(ai.translation || ai.transcript || ai.imageResult) && (
              <button type="button" className="text-[11px] text-[var(--wa-text-secondary)] hover:underline" onClick={() => setAi((a) => ({ ...a, translation: "", transcript: "", imageResult: null, error: "" }))}>
                Hide
              </button>
            )}
          </div>
        )}

        <span
          className={`${
            emojiOnly ? "flex justify-end" : "float-right ml-2"
          } mt-1 items-center gap-1 text-[10px] text-[var(--wa-text-secondary)] select-none flex`}
        >
          {message.pinned && <Pin size={10} className="fill-current" />}
          {message.isStarredByMe && <Star size={10} className="fill-current text-[#ffc107]" />}
          {message.editedAt && !message.deletedForEveryone && <span className="italic">Edited</span>}
          {formatTime(message.timestamp)}
          {isOwn && !message.deletedForEveryone && <Ticks status={tickStatus} />}
        </span>
        {!emojiOnly && <div className="clear-both" />}

        {reactionGroups.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {reactionGroups.map((g) => (
              <button
                key={g.emoji}
                onClick={(e) => {
                  e.stopPropagation();
                  onReact(message.id, g.emoji);
                }}
                className={`flex items-center gap-0.5 text-xs rounded-full px-1.5 py-0.5 border ${
                  g.mine
                    ? "bg-[var(--wa-green)]/15 border-[var(--wa-green)]"
                    : "bg-black/5 border-transparent hover:bg-black/10"
                }`}
              >
                <span>{g.emoji}</span>
                {g.count > 1 && <span className="text-[var(--wa-text-secondary)]">{g.count}</span>}
              </button>
            ))}
          </div>
        )}

        {replyCount > 0 && !message.deletedForEveryone && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenThread?.(message);
            }}
            className="mt-1 flex items-center gap-1 text-xs font-medium text-[var(--wa-green)] hover:underline"
          >
            <MessageSquare size={12} /> {replyCount} {replyCount === 1 ? "reply" : "replies"}
          </button>
        )}

        {message.deletedForEveryone && !selectMode && (
          <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(message.id, false);
              }}
              className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md bg-[var(--wa-panel)] shadow-sm text-[var(--wa-danger)] hover:bg-[var(--wa-sidebar-hover)]"
              title="Delete for me"
            >
              <Trash2 size={12} /> Delete for me
            </button>
          </div>
        )}

        {!message.deletedForEveryone && !selectMode && (
          <div
            className={`absolute flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity ${
              emojiOnly ? "-top-8 right-0 px-0.5 bg-[var(--wa-panel)] rounded-md shadow-sm" : "top-1 right-1"
            }`}
          >
            <div className="relative">
              <button
                ref={reactionButtonRef}
                onClick={(e) => {
                  e.stopPropagation();
                  setReactionBarOpen((v) => !v);
                  setMenuOpen(false);
                }}
                className="p-0.5 rounded hover:bg-black/5 text-[var(--wa-icon)]"
                title="React"
              >
                <Smile size={14} />
              </button>
              {reactionBarOpen && (
                <AnchoredPopover
                  anchorRef={reactionButtonRef}
                  align={isOwn ? "end" : "start"}
                  onClose={() => setReactionBarOpen(false)}
                >
                  <ReactionBar
                    onSelect={(emoji) => onReact(message.id, emoji)}
                    onClose={() => setReactionBarOpen(false)}
                  />
                </AnchoredPopover>
              )}
            </div>

            <button
              onClick={(e) => {
                e.stopPropagation();
                onReply(message);
              }}
              className="p-0.5 rounded hover:bg-black/5 text-[var(--wa-icon)]"
              title="Reply"
            >
              <ReplyIcon size={14} />
            </button>

            <div className="relative">
              <button
                ref={menuButtonRef}
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen((v) => !v);
                  setReactionBarOpen(false);
                }}
                className="p-0.5 rounded hover:bg-black/5 text-[var(--wa-icon)]"
              >
                <MoreVertical size={14} />
              </button>
              {menuOpen && (
                <AnchoredPopover anchorRef={menuButtonRef} align={isOwn ? "end" : "start"} onClose={() => setMenuOpen(false)}>
                <div
                  className="bg-[var(--wa-panel)] shadow-lg rounded-md py-1 w-48 max-h-[80vh] overflow-y-auto z-20 text-sm text-[var(--wa-text-primary)]"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MenuItem icon={<Info size={14} />} label="Message info" onClick={() => { setMenuOpen(false); onShowInfo(message); }} />
                  {!isOwn && onReport && message.type !== "call" && message.type !== "system" && !message.sender?.isBot && (
                    <MenuItem icon={<Flag size={14} />} label="Report" onClick={() => { setMenuOpen(false); onReport(message); }} />
                  )}
                  <MenuItem icon={<ReplyIcon size={14} />} label="Reply" onClick={() => { setMenuOpen(false); onReply(message); }} />
                  {canEdit && (
                    <MenuItem icon={<Pencil size={14} />} label="Edit" onClick={() => { setMenuOpen(false); onEdit?.(message); }} />
                  )}
                  {replyCount > 0 && (
                    <MenuItem icon={<MessageSquare size={14} />} label="View thread" onClick={() => { setMenuOpen(false); onOpenThread?.(message); }} />
                  )}
                  {message.text && (
                    <MenuItem
                      icon={<Copy size={14} />}
                      label="Copy"
                      onClick={() => { setMenuOpen(false); navigator.clipboard?.writeText(message.text); }}
                    />
                  )}
                  {!isOwn && onReplyPrivately && message.type !== "call" && message.type !== "system" && !message.sender?.isBot && (
                    <MenuItem icon={<ReplyIcon size={14} />} label="Reply privately" onClick={() => { setMenuOpen(false); onReplyPrivately(message); }} />
                  )}
                  {message.type !== "poll" && !message.viewOnce && (
                    <MenuItem icon={<Forward size={14} />} label="Forward" onClick={() => { setMenuOpen(false); onForward(message); }} />
                  )}
                  <MenuItem
                    icon={message.pinned ? <PinOff size={14} /> : <Pin size={14} />}
                    label={message.pinned ? "Unpin" : "Pin"}
                    onClick={() => { setMenuOpen(false); onTogglePin(message.id); }}
                  />
                  <MenuItem icon={<Sparkles size={14} />} label="Yap AI" onClick={() => { setMenuOpen(false); onYapAI(message); }} />
                  {message.type === "text" && message.text && !message.deletedForEveryone && (
                    <MenuItem icon={<Languages size={14} />} label="Translate" onClick={() => { setMenuOpen(false); setPicking(true); }} />
                  )}
                  {message.type === "image" && message.fileData && !message.viewOnce && !message.deletedForEveryone && (
                    <>
                      <MenuItem icon={<ScanText size={14} />} label="Read text in photo" onClick={() => { setMenuOpen(false); doImageAi("text"); }} />
                      <MenuItem icon={<Sparkles size={14} />} label="Describe photo" onClick={() => { setMenuOpen(false); doImageAi("describe"); }} />
                    </>
                  )}
                  {message.type === "audio" && message.fileData && !message.deletedForEveryone && (
                    <MenuItem icon={<FileAudio size={14} />} label="Voice to text" onClick={() => { setMenuOpen(false); doTranscribe(); }} />
                  )}
                  <MenuItem
                    icon={<Star size={14} className={message.isStarredByMe ? "fill-current" : ""} />}
                    label={message.isStarredByMe ? "Unstar" : "Star"}
                    onClick={() => { setMenuOpen(false); onToggleStar(message.id); }}
                  />
                  <div className="my-1 border-t border-[var(--wa-border-light)]" />
                  <MenuItem icon={<CheckSquare size={14} />} label="Select" onClick={() => { setMenuOpen(false); onToggleSelect(message.id, true); }} />
                  {hasAttachment && (
                    <MenuItem icon={<Download size={14} />} label="Save as" onClick={() => { setMenuOpen(false); downloadAttachment(); }} />
                  )}
                  <MenuItem icon={<Share2 size={14} />} label="Share" onClick={() => { setMenuOpen(false); handleShare(); }} />
                  {hasAttachment && (
                    <MenuItem
                      icon={<ExternalLink size={14} />}
                      label="Open with"
                      onClick={() => { setMenuOpen(false); window.open(message.fileData, "_blank"); }}
                    />
                  )}
                  <div className="my-1 border-t border-[var(--wa-border-light)]" />
                  <MenuItem
                    icon={<Trash2 size={14} />}
                    label="Delete"
                    danger
                    onClick={() => { setMenuOpen(false); setConfirming(true); }}
                  />
                </div>
                </AnchoredPopover>
              )}
            </div>
          </div>
        )}
      </div>

      {vo?.fileData && <ViewOnceViewer type={vo.type} fileData={vo.fileData} onClose={() => setVo({ ...vo, fileData: "", closed: true })} />}

      {confirming && (
        <ConfirmDeleteModal
          isOwn={isOwn && Date.now() - message.timestamp < DELETE_FOR_EVERYONE_WINDOW_MS}
          onCancel={() => setConfirming(false)} onConfirm={handleConfirmDelete} />
      )}
    </div>
  );
}

function MenuItem({ icon, label, onClick, danger }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-1.5 hover:bg-[var(--wa-sidebar-hover)] flex items-center gap-2 ${
        danger ? "text-[var(--wa-danger)]" : ""
      }`}
    >
      {icon} {label}
    </button>
  );
}
