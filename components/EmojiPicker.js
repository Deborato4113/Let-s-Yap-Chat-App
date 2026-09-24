"use client";

import EmojiPickerReact, { Theme } from "emoji-picker-react";

// Thousands of emojis with search + categories, via emoji-picker-react.
// Used both for the message composer and for "react to this message".
export default function EmojiPicker({ onSelect }) {
  return (
    <div className="rounded-lg overflow-hidden shadow-lg">
      <EmojiPickerReact
        onEmojiClick={(emojiData) => onSelect(emojiData.emoji)}
        theme={Theme.AUTO}
        width={320}
        height={380}
        lazyLoadEmojis
        previewConfig={{ showPreview: false }}
      />
    </div>
  );
}
