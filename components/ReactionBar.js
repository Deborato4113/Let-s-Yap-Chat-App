"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import EmojiPicker from "./EmojiPicker";

const QUICK_EMOJIS = ["😀", "😂", "🥰", "👍", "🙏", "🎉", "🔥", "❤️", "😢", "😮", "🙌", "👏"];

// The small hover popover: a row of quick reactions plus a "+" that expands
// into the full emoji picker for any reaction, same pattern as WhatsApp.
// Every dimension here is fixed (not left to shrink-to-fit) so the popover
// can't collapse or blow up depending on whatever container it's anchored in.
export default function ReactionBar({ onSelect, onClose }) {
  const [showFull, setShowFull] = useState(false);

  if (showFull) {
    return (
      <EmojiPicker
        onSelect={(emoji) => {
          onSelect(emoji);
          onClose();
        }}
      />
    );
  }

  return (
    <div
      className="bg-[var(--wa-panel)] shadow-lg rounded-2xl p-1.5"
      style={{ width: "216px" }}
    >
      <div className="grid grid-cols-6 gap-0.5">
        {QUICK_EMOJIS.map((em) => (
          <button
            key={em}
            type="button"
            onClick={() => {
              onSelect(em);
              onClose();
            }}
            className="flex items-center justify-center rounded hover:bg-[var(--wa-panel-header)] hover:scale-125 transition-transform"
            style={{ width: "28px", height: "28px", fontSize: "18px", lineHeight: 1 }}
          >
            {em}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setShowFull(true)}
          className="flex items-center justify-center rounded hover:bg-[var(--wa-panel-header)] text-[var(--wa-icon)]"
          style={{ width: "28px", height: "28px" }}
          title="More emojis"
        >
          <Plus size={16} />
        </button>
      </div>
    </div>
  );
}
