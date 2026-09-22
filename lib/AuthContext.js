"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import api from "./api";
import { disconnectSocket } from "./socket";

const AuthContext = createContext(null);

// avatarUrl is a base64 image (can be several MB) - localStorage is capped at
// ~5-10MB per origin for ALL keys combined, so persisting it here risks
// QuotaExceededError on every login/profile update. Keep only a lightweight
// copy on disk for instant reload hydration; the full profile (with photo)
// lives in React state and gets refetched from the server on mount.
function stripForStorage(user) {
  if (!user) return user;
  const { avatarUrl, ...rest } = user;
  return rest;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    // one-time hydration of the session from localStorage on mount
    const storedToken = localStorage.getItem("yap_token");
    const storedUser = localStorage.getItem("yap_user");
    if (storedToken && storedUser) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setToken(storedToken);
      setUser(JSON.parse(storedUser));
      // storedUser has no avatarUrl (see stripForStorage) - fetch the full
      // profile so the photo shows up again without waiting for an edit.
      api
        .get("/users/me")
        .then(({ data }) => setUser(data.user))
        .catch(() => {});
    }
    setLoading(false);
  }, []);

  const login = useCallback(async (identifier, password) => {
    const { data } = await api.post("/auth/login", { identifier, password });
    localStorage.setItem("yap_token", data.token);
    try {
      localStorage.setItem("yap_user", JSON.stringify(stripForStorage(data.user)));
    } catch {
      /* best-effort - full user still lives in state */
    }
    setToken(data.token);
    setUser(data.user);
    return data.user;
  }, []);

  const register = useCallback(async (payload) => {
    const { data } = await api.post("/auth/register", payload);
    localStorage.setItem("yap_token", data.token);
    try {
      localStorage.setItem("yap_user", JSON.stringify(stripForStorage(data.user)));
    } catch {
      /* best-effort - full user still lives in state */
    }
    setToken(data.token);
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("yap_token");
    localStorage.removeItem("yap_user");
    disconnectSocket();
    setToken(null);
    setUser(null);
    router.push("/login");
  }, [router]);

  const updateUser = useCallback((patch) => {
    setUser((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem("yap_user", JSON.stringify(stripForStorage(next)));
      } catch {
        /* best-effort - full user (with photo) still lives in state */
      }
      return next;
    });
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
