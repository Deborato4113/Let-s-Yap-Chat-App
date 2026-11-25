"use client";

import { useCallback, useEffect, useState } from "react";
import { FileText, Mic, Play, ExternalLink, X, Download, CornerDownRight } from "lucide-react";
import api from "@/lib/api";
import { formatDayLabel } from "@/lib/utils";
import { loadMessageFile } from "@/lib/useLazyFile";

// One tab of "Media, links and docs": a grid of photos/videos, a list of files and
// voice notes, or a list of every link shared in the chat.
export default function MediaGallery({ conversationId, kind, onJump }) {
  const [items, setItems] = useState([]);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(null);

  const load = useCallback(
    async (before) => {
      setLoading(true);
      setError("");
      try {
        const { data } = await api.get(`/conversations/${conversationId}/media`, { params: { kind, ...(before ? { before } : {}) } });
        setItems((prev) => (before ? [...prev, ...data.items] : data.items));
        setMore(data.more);
      } catch {
        setError("Couldn't load this. Try again.");
      } finally {
        setLoading(false);
      }
    },
    [conversationId, kind]
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setItems([]);
    load();
  }, [load]);

  // Big attachments are not in the list: photo thumbnails are fetched one at a time,
  // everything else only when it is opened / downloaded.
  const pendingImage = items.find((it) => it.type === "image" && it.fileLazy && !it.fileData);
  useEffect(() => {
    if (!pendingImage) return;
    let cancelled = false;
    loadMessageFile(pendingImage.id).then((d) => {
      if (cancelled) return;
      setItems((prev) => prev.map((x) => (x.id === pendingImage.id ? { ...x, fileData: d || "", fileLazy: false } : x)));
    });
    return () => {
      cancelled = true;
    };
  }, [pendingImage?.id]);

  async function ensureData(it) {
    if (!it.fileLazy || it.fileData) return it;
    const d = await loadMessageFile(it.id);
    const full = { ...it, fileData: d, fileLazy: false };
    setItems((prev) => prev.map((x) => (x.id === it.id ? full : x)));
    return full;
  }
  async function openItem(it) {
    setOpen(it.fileLazy && !it.fileData ? { ...it, loadingFile: true } : it);
    const full = await ensureData(it);
    setOpen(full);
  }
  async function downloadItem(it) {
    const full = await ensureData(it);
    const a = document.createElement("a");
    a.href = full.fileData;
    a.download = full.fileName || "file";
    a.click();
  }

  const empty = !loading && !error && items.length === 0;
  const emptyText = kind === "media" ? "No photos, videos or voice messages yet." : kind === "docs" ? "No files yet." : "No links shared yet.";

  return (
    <div className="px-4 py-3">
      {empty && <p className="text-sm text-[var(--wa-text-secondary)] text-center py-8">{emptyText}</p>}
      {error && <p className="text-sm text-[var(--wa-danger)] text-center py-4">{error}</p>}

      {kind === "media" && (
        <div className="grid grid-cols-3 gap-1">
          {items.map((it) => (
            <button key={it.id} onClick={() => openItem(it)} className="relative aspect-square bg-[var(--wa-panel-header)] overflow-hidden rounded">
              {it.type === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={it.fileData} alt={it.fileName || "Photo"} className="w-full h-full object-cover" />
              ) : it.type === "audio" ? (
                <span className="w-full h-full flex flex-col items-center justify-center gap-1 text-[var(--wa-green)]">
                  <Mic size={24} />
                  <span className="text-[10px] text-[var(--wa-text-secondary)]">Voice</span>
                </span>
              ) : (
                <span className="w-full h-full flex items-center justify-center text-[var(--wa-icon)]">
                  <Play size={26} />
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {kind === "docs" &&
        items.map((it) => (
          <div key={it.id} className="flex items-center gap-3 py-2.5 border-b border-[var(--wa-border-light)]">
            <span className="w-10 h-10 rounded-lg bg-[var(--wa-panel-header)] flex items-center justify-center text-[var(--wa-icon)] shrink-0">
              <FileText size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-[var(--wa-text-primary)] truncate">{it.fileName || "File"}</p>
              <p className="text-xs text-[var(--wa-text-secondary)] truncate">
                {it.senderName} · {formatDayLabel(it.timestamp)}
              </p>
            </div>
            <button onClick={() => downloadItem(it)} aria-label="Download" className="p-2 rounded-full hover:bg-[var(--wa-panel-header)] text-[var(--wa-icon)]">
              <Download size={16} />
            </button>
            {onJump && (
              <button onClick={() => onJump(it)} aria-label="Show in chat" title="Show in chat" className="p-2 rounded-full hover:bg-[var(--wa-panel-header)] text-[var(--wa-icon)]">
                <CornerDownRight size={16} />
              </button>
            )}
          </div>
        ))}

      {kind === "links" &&
        items.map((it) => (
          <div key={it.id} className="flex items-start gap-3 py-2.5 border-b border-[var(--wa-border-light)]">
            <div className="min-w-0 flex-1">
              {it.urls.map((u) => (
                <a key={u} href={u} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-sm text-[var(--wa-green)] hover:underline break-all">
                  <ExternalLink size={13} className="shrink-0" /> {u}
                </a>
              ))}
              <p className="text-xs text-[var(--wa-text-secondary)] mt-0.5">
                {it.senderName} · {formatDayLabel(it.timestamp)}
              </p>
            </div>
            {onJump && (
              <button onClick={() => onJump(it)} aria-label="Show in chat" title="Show in chat" className="p-2 rounded-full hover:bg-[var(--wa-panel-header)] text-[var(--wa-icon)]">
                <CornerDownRight size={16} />
              </button>
            )}
          </div>
        ))}

      {loading && <p className="text-sm text-[var(--wa-text-secondary)] text-center py-3">Loading…</p>}
      {more && !loading && (
        <button onClick={() => load(items[items.length - 1]?.id)} className="w-full text-sm text-[var(--wa-green)] py-2 hover:underline">
          Load more
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-[110] bg-black/90 flex flex-col" onClick={() => setOpen(null)}>
          <div className="flex items-center justify-between px-4 py-3 text-white" onClick={(e) => e.stopPropagation()}>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{open.senderName}</p>
              <p className="text-xs opacity-70">{formatDayLabel(open.timestamp)}</p>
            </div>
            <div className="flex items-center gap-1">
              {onJump && (
                <button onClick={() => { onJump(open); setOpen(null); }} className="px-3 py-1.5 rounded-full text-xs bg-white/15 hover:bg-white/25">
                  Show in chat
                </button>
              )}
              <a href={open.fileData} download={open.fileName || "media"} aria-label="Download" className="p-2 rounded-full hover:bg-white/15">
                <Download size={18} />
              </a>
              <button onClick={() => setOpen(null)} aria-label="Close" className="p-2 rounded-full hover:bg-white/15">
                <X size={20} />
              </button>
            </div>
          </div>
          <div className="flex-1 min-h-0 flex items-center justify-center p-4" onClick={(e) => e.stopPropagation()}>
            {open.loadingFile ? (
              <p className="text-white/80 text-sm">Loading…</p>
            ) : open.type === "audio" ? (
              <audio src={open.fileData} controls autoPlay className="w-full max-w-sm" />
            ) : open.type === "image" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={open.fileData} alt="" className="max-w-full max-h-full object-contain" />
            ) : (
              <video src={open.fileData} controls autoPlay className="max-w-full max-h-full" />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
