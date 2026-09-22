"use client";

import { useState } from "react";
import { X, Download, Trash2 } from "lucide-react";
import { formatTime } from "@/lib/utils";
import ConfirmDeleteModal from "./ConfirmDeleteModal";

// Full-screen WhatsApp-style media viewer. Opened by tapping an image/video
// bubble. Any message - yours or received - can be deleted right from here
// via the same confirm dialog used in the chat list ("delete for everyone"
// only shows up when it's your own message).
export default function ImageViewer({ message, isOwn, onClose, onDelete }) {
  const [confirming, setConfirming] = useState(false);

  if (!message) return null;

  function handleConfirm(forEveryone) {
    onDelete(message.id, forEveryone);
    setConfirming(false);
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/90 z-40 flex flex-col">
      <div className="h-16 flex items-center justify-between px-4 text-white bg-black/40 shrink-0">
        <div className="flex items-center gap-4 min-w-0">
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full">
            <X size={22} />
          </button>
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{message.fileName || "Media"}</p>
            <p className="text-xs text-white/60">{formatTime(message.timestamp)}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <a
            href={message.fileData}
            download={message.fileName || "download"}
            className="p-2 hover:bg-white/10 rounded-full"
            title="Download"
          >
            <Download size={20} />
          </a>
          <button
            onClick={() => setConfirming(true)}
            className="p-2 hover:bg-white/10 rounded-full text-[var(--wa-danger)]"
            title="Delete"
          >
            <Trash2 size={20} />
          </button>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-4 overflow-hidden" onClick={onClose}>
        {message.type === "video" ? (
          <video
            src={message.fileData}
            controls
            autoPlay
            className="max-h-full max-w-full rounded"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={message.fileData}
            alt={message.fileName || "image"}
            className="max-h-full max-w-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        )}
      </div>

      {confirming && (
        <ConfirmDeleteModal isOwn={isOwn} onCancel={() => setConfirming(false)} onConfirm={handleConfirm} />
      )}
    </div>
  );
}
