"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import api from "./api";
import { useAuth } from "./AuthContext";

const ThemeContext = createContext(null);

export const ACCENT_THEMES = [
  { id: "classic", label: "Classic", swatch: "#00a884" },
  { id: "ocean", label: "Ocean", swatch: "#0088cc" },
  { id: "sunset", label: "Sunset", swatch: "#ff7a59" },
  { id: "orchid", label: "Orchid", swatch: "#8b5cf6" }
];

function applyToDocument(accentTheme, darkMode) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", accentTheme);
  document.documentElement.setAttribute("data-mode", darkMode ? "dark" : "light");
}

export function ThemeProvider({ children }) {
  const { user, updateUser } = useAuth();
  const [accentTheme, setAccentThemeState] = useState("classic");
  const [darkMode, setDarkModeState] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // 1. Apply whatever's in localStorage immediately (no flash before login).
  useEffect(() => {
    try {
      const storedTheme = localStorage.getItem("yap_theme") || "classic";
      const storedMode = localStorage.getItem("yap_dark_mode") === "1";
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAccentThemeState(storedTheme);
      setDarkModeState(storedMode);
      applyToDocument(storedTheme, storedMode);
    } catch {
      // localStorage unavailable - fall back to defaults, already applied.
    }
    setHydrated(true);
  }, []);

  // 2. Once we know who's logged in, their saved preference wins (keeps it
  // consistent across devices) and becomes the new local default.
  useEffect(() => {
    if (!hydrated || !user) return;
    const theme = user.theme || "classic";
    const mode = !!user.darkMode;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAccentThemeState(theme);
    setDarkModeState(mode);
    applyToDocument(theme, mode);
    try {
      localStorage.setItem("yap_theme", theme);
      localStorage.setItem("yap_dark_mode", mode ? "1" : "0");
    } catch {
      /* best-effort */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, user?.id]);

  const persist = useCallback(
    (patch) => {
      try {
        if (patch.theme) localStorage.setItem("yap_theme", patch.theme);
        if (typeof patch.darkMode === "boolean") localStorage.setItem("yap_dark_mode", patch.darkMode ? "1" : "0");
      } catch {
        /* best-effort */
      }
      if (user) {
        api.patch("/users/me", patch).then(({ data }) => updateUser(data.user)).catch(() => {});
      }
    },
    [user, updateUser]
  );

  const setAccentTheme = useCallback(
    (theme) => {
      setAccentThemeState(theme);
      applyToDocument(theme, darkMode);
      persist({ theme });
    },
    [darkMode, persist]
  );

  const setDarkMode = useCallback(
    (mode) => {
      setDarkModeState(mode);
      applyToDocument(accentTheme, mode);
      persist({ darkMode: mode });
    },
    [accentTheme, persist]
  );

  const toggleDarkMode = useCallback(() => setDarkMode(!darkMode), [darkMode, setDarkMode]);

  return (
    <ThemeContext.Provider value={{ accentTheme, darkMode, setAccentTheme, setDarkMode, toggleDarkMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
