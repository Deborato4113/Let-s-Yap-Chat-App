"use client";

import { useCallback, useEffect, useState } from "react";
import api from "@/lib/api";

// The status feed ({ mine, contacts }) shared by the nav rail (green dot when
// there is something unseen) and the Status tab. Refreshes when a contact
// posts/removes one, and every few minutes so expired ones drop off.
export function useStatusFeed(socket, enabled = true) {
  const [feed, setFeed] = useState({ mine: null, contacts: [] });

  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get("/status");
      setFeed(data);
    } catch {
      /* optional - keep whatever we had */
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [enabled, refresh]);

  useEffect(() => {
    if (!socket) return;
    socket.on("status-updated", refresh);
    return () => socket.off("status-updated", refresh);
  }, [socket, refresh]);

  useEffect(() => {
    if (!enabled) return;
    const t = setInterval(refresh, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, [enabled, refresh]);

  // flip a status to "seen" locally right away (the server call is in the viewer)
  const markSeen = useCallback((userId, itemId) => {
    setFeed((f) => ({
      ...f,
      contacts: f.contacts.map((g) => {
        if (String(g.user.id) !== String(userId)) return g;
        const items = g.items.map((i) => (i.id === itemId ? { ...i, viewed: true } : i));
        return { ...g, items, allViewed: items.every((i) => i.viewed) };
      })
    }));
  }, []);

  const hasUnseen = feed.contacts.some((g) => !g.allViewed);
  return { feed, refresh, markSeen, hasUnseen };
}
