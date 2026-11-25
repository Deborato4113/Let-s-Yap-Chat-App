"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";

// message id -> Promise<fileData>, so a big attachment is downloaded once per page load
const loads = new Map();

export function loadMessageFile(id) {
  if (!loads.has(id)) {
    loads.set(
      id,
      api
        .get(`/messages/${id}/file`)
        .then(({ data }) => data.fileData || "")
        .catch(() => {
          loads.delete(id);
          return "";
        })
    );
  }
  return loads.get(id);
}

// Returns the message with its attachment filled in once it has been fetched
// (small attachments already come with the message).
export function useHydratedMessage(message) {
  const [loaded, setLoaded] = useState({ id: null, data: "" });
  const lazy = !!message && !!message.fileLazy && !message.fileData && !message.deletedForEveryone;
  useEffect(() => {
    if (!lazy) return;
    let cancelled = false;
    loadMessageFile(message.id).then((d) => !cancelled && setLoaded({ id: message.id, data: d }));
    return () => {
      cancelled = true;
    };
  }, [lazy, message?.id]);
  return lazy && loaded.id === message.id && loaded.data ? { ...message, fileData: loaded.data } : message;
}
