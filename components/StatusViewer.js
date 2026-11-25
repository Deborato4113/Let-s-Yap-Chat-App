"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X, Eye, Trash2, Pause } from "lucide-react";
import api from "@/lib/api";
import Avatar from "./Avatar";

const TEXT_MS = 5000;
const IMAGE_MS = 6500;

function timeAgo(ts) {
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} h ago`;
  return "Yesterday";
}

// Full-screen story viewer. `groups` is [{ user, items }]; it starts at
// groups[startGroup] and flows on to the next person when one ends.
//   Tap the right side / right arrow = next, left side / left arrow = back.
//   Hold anywhere to pause. Esc closes.
export default function StatusViewer({ groups, startGroup = 0, meId, onClose, onSeen, onDeleted }) {
  const [gi, setGi] = useState(startGroup);
  const [ii, setIi] = useState(0);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [media, setMedia] = useState({}); // statusId -> dataURL
  const [viewers, setViewers] = useState(null); // null = closed
  const [confirmDelete, setConfirmDelete] = useState(false);
  const seenRef = useRef(new Set());

  const group = groups[gi];
  const item = group?.items[ii];
  const mine = group && String(group.user.id) === String(meId);
  const isImage = item?.kind === "image";
  const loaded = !isImage || !!media[item?.id];
  const frozen = paused || viewers !== null || confirmDelete || !loaded;

  const next = useCallback(() => {
    setProgress(0);
    setViewers(null);
    if (!group) return onClose();
    if (ii < group.items.length - 1) return setIi(ii + 1);
    if (gi < groups.length - 1) {
      setGi(gi + 1);
      return setIi(0);
    }
    onClose();
  }, [group, ii, gi, groups.length, onClose]);

  const prev = useCallback(() => {
    setProgress(0);
    setViewers(null);
    if (ii > 0) return setIi(ii - 1);
    if (gi > 0) {
      setGi(gi - 1);
      return setIi(groups[gi - 1].items.length - 1);
    }
  }, [ii, gi, groups]);

  // fetch the photo (kept out of the feed so the feed stays small)
  useEffect(() => {
    if (!item || item.kind !== "image" || media[item.id]) return;
    let cancelled = false;
    api
      .get(`/status/${item.id}`)
      .then(({ data }) => !cancelled && setMedia((m) => ({ ...m, [item.id]: data.fileData })))
      .catch(() => !cancelled && setMedia((m) => ({ ...m, [item.id]: "" })));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id, item?.kind, media]);

  // mark as seen the first time it's shown
  useEffect(() => {
    if (!item || mine || seenRef.current.has(item.id)) return;
    seenRef.current.add(item.id);
    api.post(`/status/${item.id}/view`).catch(() => {});
    onSeen?.(group.user.id, item.id);
  }, [item, mine, group, onSeen]);

  // progress timer
  useEffect(() => {
    if (!item || frozen) return;
    const total = isImage ? IMAGE_MS : TEXT_MS;
    const tick = 50;
    const t = setInterval(() => {
      setProgress((p) => {
        const np = p + tick / total;
        return np >= 1 ? 1 : np;
      });
    }, tick);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id, frozen, isImage]);

  useEffect(() => {
    if (progress >= 1) next();
  }, [progress, next]);

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev, onClose]);

  async function openViewers() {
    setViewers([]);
    try {
      const { data } = await api.get(`/status/${item.id}/view`);
      setViewers(data.viewers || []);
    } catch {
      setViewers([]);
    }
  }

  async function doDelete() {
    setConfirmDelete(false);
    const id = item.id;
    try {
      await api.delete(`/status/${id}`);
    } catch {
      return;
    }
    onDeleted?.(id);
    // groups prop updates from the parent; step forward/close if it was the last
    if (group.items.length <= 1) onClose();
    else setIi((i) => Math.min(i, group.items.length - 2));
  }

  if (!group || !item) return null;

  const fontSize = item.text.length > 180 ? "text-xl" : item.text.length > 80 ? "text-2xl" : "text-4xl";

  return (
    <div className="fixed inset-0 z-[130] bg-black flex items-center justify-center select-none">
      <div
        className="relative w-full h-full max-w-[460px] flex flex-col"
        style={{ backgroundColor: item.kind === "text" ? item.bgColor : "#000" }}
        onPointerDown={() => setPaused(true)}
        onPointerUp={() => setPaused(false)}
        onPointerLeave={() => setPaused(false)}
      >
        {/* progress bars */}
        <div className="absolute top-0 inset-x-0 z-20 flex gap-1 px-2 pt-2">
          {group.items.map((it, idx) => (
            <div key={it.id} className="h-[3px] flex-1 rounded-full bg-white/35 overflow-hidden">
              <div
                className="h-full bg-white"
                style={{ width: idx < ii ? "100%" : idx === ii ? `${Math.min(progress, 1) * 100}%` : "0%" }}
              />
            </div>
          ))}
        </div>

        {/* header */}
        <div className="absolute top-3 inset-x-0 z-20 flex items-center gap-3 px-3 pt-3 text-white bg-gradient-to-b from-black/50 to-transparent pb-6">
          <Avatar name={group.user.name} color={group.user.avatarColor} avatarUrl={group.user.avatarUrl} size={38} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate">{mine ? "My status" : group.user.name}</p>
            <p className="text-xs opacity-80">{timeAgo(item.createdAt)}</p>
          </div>
          {paused && <Pause size={16} className="opacity-80" />}
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={onClose}
            className="p-2 rounded-full hover:bg-white/15"
            title="Close"
          >
            <X size={22} />
          </button>
        </div>

        {/* content */}
        <div className="flex-1 min-h-0 flex items-center justify-center relative">
          {item.kind === "text" ? (
            <p className={`px-8 text-center text-white font-medium whitespace-pre-wrap break-words ${fontSize}`}>{item.text}</p>
          ) : media[item.id] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={media[item.id]} alt="Status" className="max-h-full max-w-full object-contain" draggable={false} />
          ) : media[item.id] === "" ? (
            <p className="text-white/80 text-sm">Couldn&apos;t load this photo.</p>
          ) : (
            <div className="w-8 h-8 border-4 border-white/40 border-t-transparent rounded-full animate-spin" />
          )}

          {/* tap zones */}
          <button className="absolute inset-y-0 left-0 w-[30%] z-10 cursor-w-resize" onClick={prev} aria-label="Previous" />
          <button className="absolute inset-y-0 right-0 w-[70%] z-10 cursor-e-resize" onClick={next} aria-label="Next" />
        </div>

        {item.kind === "image" && item.text && (
          <p className="absolute bottom-16 inset-x-0 z-20 text-center text-white text-sm px-6 py-2 bg-black/45">{item.text}</p>
        )}

        {mine && (
          <div className="absolute bottom-0 inset-x-0 z-20 flex items-center justify-between px-4 py-3 text-white bg-gradient-to-t from-black/60 to-transparent">
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={openViewers}
              className="flex items-center gap-2 text-sm px-3 py-1.5 rounded-full hover:bg-white/15"
            >
              <Eye size={18} /> {item.viewCount ?? 0}
            </button>
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => setConfirmDelete(true)}
              className="p-2 rounded-full hover:bg-white/15"
              title="Delete status"
            >
              <Trash2 size={20} />
            </button>
          </div>
        )}

        {viewers !== null && (
          <div className="absolute inset-x-0 bottom-0 z-30 max-h-[60%] bg-[var(--wa-panel)] rounded-t-2xl flex flex-col" onPointerDown={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--wa-border)]">
              <p className="text-sm font-medium text-[var(--wa-text-primary)] flex items-center gap-2">
                <Eye size={16} /> Viewed by {viewers.length}
              </p>
              <button onClick={() => setViewers(null)} className="p-1 text-[var(--wa-icon)]">
                <X size={18} />
              </button>
            </div>
            <div className="overflow-y-auto">
              {viewers.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-[var(--wa-text-secondary)]">No views yet.</p>
              ) : (
                viewers.map((v) => (
                  <div key={v.id} className="flex items-center gap-3 px-4 py-2.5">
                    <Avatar name={v.name} color={v.avatarColor} avatarUrl={v.avatarUrl} size={36} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-[var(--wa-text-primary)] truncate">{v.name}</p>
                      <p className="text-xs text-[var(--wa-text-secondary)]">{timeAgo(v.viewedAt)}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {confirmDelete && (
          <div className="absolute inset-0 z-40 bg-black/60 flex items-center justify-center px-6" onPointerDown={(e) => e.stopPropagation()}>
            <div className="bg-[var(--wa-panel)] rounded-lg w-full max-w-xs p-5">
              <p className="text-sm text-[var(--wa-text-primary)] mb-4">Delete this status update? It will disappear for everyone.</p>
              <div className="flex justify-end gap-2">
                <button onClick={() => setConfirmDelete(false)} className="px-3 py-1.5 text-sm text-[var(--wa-text-secondary)]">
                  Cancel
                </button>
                <button onClick={doDelete} className="px-3 py-1.5 text-sm font-medium text-[var(--wa-danger)]">
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
