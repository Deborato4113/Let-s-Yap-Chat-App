"use client";

import { getPrefs } from "./prefs";

export const TRANSLATE_LANGUAGES = [
  "English", "Hindi", "Bengali", "Tamil", "Telugu", "Marathi", "Gujarati", "Kannada", "Malayalam", "Punjabi", "Urdu",
  "Spanish", "French", "German", "Portuguese", "Italian", "Dutch", "Russian", "Turkish", "Arabic",
  "Chinese (Simplified)", "Japanese", "Korean", "Indonesian", "Vietnamese", "Thai"
];

// The language "Translate" goes into: the one picked in Settings, else this browser's language.
export function translateTarget() {
  const chosen = getPrefs().translateTo;
  if (chosen) return chosen;
  try {
    const code = (navigator.language || "en").split("-")[0];
    return new Intl.DisplayNames(["en"], { type: "language" }).of(code) || "English";
  } catch {
    return "English";
  }
}
