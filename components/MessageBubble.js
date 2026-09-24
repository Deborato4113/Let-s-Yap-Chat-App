"use client";

import { useState } from "react";
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
  ExternalLink
} from "lucide-react";
import ConfirmDeleteModal from "./ConfirmDeleteModal";
import AudioMessage from "./AudioMessage";
import ReactionBar from "./ReactionBar";

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
  onYapAI,
  selectMode,
  selected,
  onToggleSelect
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [reactionBarOpen, setReactionBarOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);

  if (message.type === "system") {
    return (
      <div className="flex justify-center my-2">
        <span className="bg-[var(--wa-system-bg)] text-[var(--wa-icon)] text-xs px-3 py-1 rounded-md shadow-sm">
          {message.text}
        </span>
      </div>
    );
  }

  const tickStatus = message.readByCount > 0 ? "read" : message.deliveredCount > 0 ? "delivered" : "sent";
  const isMedia = message.type === "image" || message.type === "video" || message.type === "audio";
  const hasAttachment = isMedia || (message.type === "file" && message.fileData);
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
      className={`flex ${emojiOnly ? "mb-4" : "mb-1.5"} ${isOwn ? "justify-end" : "justify-start"} group animate-fade-in`}
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
        className={`relative max-w-[65%] min-w-[80px] rounded-lg ${
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

        {message.replyTo && (
          <div className="mb-1.5 rounded-md bg-black/10 border-l-4 border-[var(--wa-green)] px-2 py-1">
            <p className="text-xs font-semibold text-[var(--wa-green)]">{message.replyTo.senderName}</p>
            <p className="text-xs text-[var(--wa-text-secondary)] truncate">
              {message.replyTo.deletedForEveryone
                ? "This message was deleted"
                : message.replyTo.text || `(${message.replyTo.type})`}
            </p>
          </div>
        )}

        {message.deletedForEveryone ? (
          <p className="text-sm italic text-[var(--wa-text-muted)] pr-12">This message was deleted</p>
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
          message.text && (
            <p className={`text-sm text-[var(--wa-text-primary)] whitespace-pre-wrap break-words pr-14 ${isMedia ? "mt-1" : ""}`}>
              {message.text}
            </p>
          )
        )}

        <span
          className={`${
            emojiOnly ? "flex justify-end" : "float-right ml-2"
          } mt-1 items-center gap-1 text-[10px] text-[var(--wa-text-secondary)] select-none flex`}
        >
          {message.pinned && <Pin size={10} className="fill-current" />}
          {message.isStarredByMe && <Star size={10} className="fill-current text-[#ffc107]" />}
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

        {!message.deletedForEveryone && !selectMode && (
          <div
            className={`absolute flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity ${
              emojiOnly ? "-top-8 right-0 px-0.5 bg-[var(--wa-panel)] rounded-md shadow-sm" : "top-1 right-1"
            }`}
          >
            <div className="relative">
              <button
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
                <div className="absolute right-0 top-6 z-20">
                  <ReactionBar
                    onSelect={(emoji) => onReact(message.id, emoji)}
                    onClose={() => setReactionBarOpen(false)}
                  />
                </div>
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
                <div
                  className="absolute right-0 top-6 bg-[var(--wa-panel)] shadow-lg rounded-md py-1 w-48 z-20 text-sm text-[var(--wa-text-primary)]"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MenuItem icon={<Info size={14} />} label="Message info" onClick={() => { setMenuOpen(false); onShowInfo(message); }} />
                  <MenuItem icon={<ReplyIcon size={14} />} label="Reply" onClick={() => { setMenuOpen(false); onReply(message); }} />
                  {message.text && (
                    <MenuItem
                      icon={<Copy size={14} />}
                      label="Copy"
                      onClick={() => { setMenuOpen(false); navigator.clipboard?.writeText(message.text); }}
                    />
                  )}
                  <MenuItem icon={<Forward size={14} />} label="Forward" onClick={() => { setMenuOpen(false); onForward(message); }} />
                  <MenuItem
                    icon={message.pinned ? <PinOff size={14} /> : <Pin size={14} />}
                    label={message.pinned ? "Unpin" : "Pin"}
                    onClick={() => { setMenuOpen(false); onTogglePin(message.id); }}
                  />
                  <MenuItem icon={<Sparkles size={14} />} label="Yap AI" onClick={() => { setMenuOpen(false); onYapAI(message); }} />
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
              )}
            </div>
          </div>
        )}
      </div>

      {confirming && (
        <ConfirmDeleteModal isOwn={isOwn} onCancel={() => setConfirming(false)} onConfirm={handleConfirmDelete} />
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
