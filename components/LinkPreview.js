"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";

// url -> Promise<preview | null>, so the same link in many messages (or the
// same message re-rendering) only hits the server once per page load.
const requests = new Map();

function loadPreview(url) {
  if (!requests.has(url)) {
    requests.set(
      url,
      api
        .get("/link-preview", { params: { url } })
        .then(({ data }) => data.preview || null)
        .catch(() => null)
    );
  }
  return requests.get(url);
}

export default function LinkPreview({ url }) {
  const [preview, setPreview] = useState(null);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadPreview(url).then((p) => {
      if (!cancelled) setPreview(p);
    });
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (!preview) return null;

  return (
    <a
      href={preview.url || url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="block mb-1 mt-0.5 rounded-md overflow-hidden bg-black/5 hover:bg-black/10 border-l-4 border-[var(--wa-green)] max-w-[300px]"
    >
      {preview.image && !imageFailed && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={preview.image}
          alt=""
          referrerPolicy="no-referrer"
          onError={() => setImageFailed(true)}
          className="w-full max-h-[160px] object-cover"
        />
      )}
      <div className="px-2.5 py-1.5">
        {preview.siteName && <p className="text-[11px] text-[var(--wa-text-secondary)] truncate">{preview.siteName}</p>}
        {preview.title && (
          <p className="text-sm font-medium text-[var(--wa-text-primary)] line-clamp-2 break-words">{preview.title}</p>
        )}
        {preview.description && (
          <p className="text-xs text-[var(--wa-text-secondary)] line-clamp-2 break-words">{preview.description}</p>
        )}
      </div>
    </a>
  );
}
