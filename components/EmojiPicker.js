"use client";

import { useEffect, useState } from "react";
import EmojiPickerReact, { Theme } from "emoji-picker-react";

const PREFERRED_WIDTH = 320;
const PREFERRED_HEIGHT = 380;
const VIEWPORT_MARGIN = 16; // leaves a little breathing room on each side

// Thousands of emojis with search + categories, via emoji-picker-react.
// Used both for the message composer and for "react to this message".
export default function EmojiPicker({ onSelect }) {
  // A HARDCODED 320px width doesn't fit every window - a narrow browser
  // window (or dev tools docked and eating up most of the width, as
  // happened during testing: a 568px-wide viewport) has nowhere to put a
  // fixed 320px panel without it overlapping whatever's next to it.
  // AnchoredPopover's flip/clamp logic can only work with the size it's
  // given, so the picker itself needs to shrink to fit instead.
  const [size, setSize] = useState({ width: PREFERRED_WIDTH, height: PREFERRED_HEIGHT });

  useEffect(() => {
    function computeSize() {
      const maxWidth = window.innerWidth - VIEWPORT_MARGIN * 2;
      const maxHeight = window.innerHeight - VIEWPORT_MARGIN * 2;
      setSize({
        width: Math.max(240, Math.min(PREFERRED_WIDTH, maxWidth)),
        height: Math.max(280, Math.min(PREFERRED_HEIGHT, maxHeight))
      });
    }
    computeSize();
    window.addEventListener("resize", computeSize);
    return () => window.removeEventListener("resize", computeSize);
  }, []);

  return (
    <div className="rounded-lg overflow-hidden shadow-lg">
      <EmojiPickerReact
        onEmojiClick={(emojiData) => onSelect(emojiData.emoji)}
        theme={Theme.AUTO}
        width={size.width}
        height={size.height}
        lazyLoadEmojis
        previewConfig={{ showPreview: false }}
      />
    </div>
  );
}
