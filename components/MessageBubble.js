"use client";

import { useState } from "react";
import { formatTime, formatFileSize } from "@/lib/utils";
import Ticks from "./Ticks";
import { MoreVertical, Trash2, FileText, Download } from "lucide-react";
import ConfirmDeleteModal from "./ConfirmDeleteModal";
import AudioMessage from "./AudioMessage";

export default function MessageBubble({ message, isOwn, showSender, senderName, onDelete, onOpenMedia }) {
  const [menuOpen, setMenuOpen] = useState(false);
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

  function handleConfirmDelete(forEveryone) {
    onDelete(message.id, forEveryone);
    setConfirming(false);
  }

  return (
    <div className={`flex mb-1.5 ${isOwn ? "justify-end" : "justify-start"} group animate-fade-in`}>
      <div
        className={`relative max-w-[65%] min-w-[80px] rounded-lg px-2.5 pt-1.5 pb-1.5 shadow-sm ${
          isOwn ? "bg-[var(--wa-bubble-out)] rounded-tr-none bubble-tail-out" : "bg-[var(--wa-panel)] rounded-tl-none bubble-tail-in"
        }`}
      >
        {showSender && !isOwn && (
          <p className="text-xs font-semibold mb-0.5" style={{ color: "var(--wa-green)" }}>
            {senderName}
          </p>
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

        {!message.deletedForEveryone && message.text && (
          <p className={`text-sm text-[var(--wa-text-primary)] whitespace-pre-wrap break-words pr-14 ${isMedia ? "mt-1" : ""}`}>
            {message.text}
          </p>
        )}

        <span className="float-right ml-2 mt-1 flex items-center gap-1 text-[10px] text-[var(--wa-text-secondary)] select-none">
          {formatTime(message.timestamp)}
          {isOwn && !message.deletedForEveryone && <Ticks status={tickStatus} />}
        </span>
        <div className="clear-both" />

        {!message.deletedForEveryone && (
          <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="p-0.5 rounded hover:bg-black/5 text-[var(--wa-icon)]"
            >
              <MoreVertical size={14} />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-6 bg-[var(--wa-panel)] shadow-lg rounded-md py-1 w-40 z-10 text-sm">
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    setConfirming(true);
                  }}
                  className="w-full text-left px-3 py-1.5 hover:bg-[var(--wa-sidebar-hover)] flex items-center gap-2 text-[var(--wa-danger)]"
                >
                  <Trash2 size={14} /> Delete
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {confirming && (
        <ConfirmDeleteModal isOwn={isOwn} onCancel={() => setConfirming(false)} onConfirm={handleConfirmDelete} />
      )}
    </div>
  );
}
