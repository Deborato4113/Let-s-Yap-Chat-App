"use client";

import { useRef, useState } from "react";
import { X, Type, Image as ImageIcon, Send } from "lucide-react";
import api from "@/lib/api";

const BACKGROUNDS = ["#00a884", "#0b3d3a", "#1e2a4a", "#6a3df0", "#c2185b", "#e65100", "#37474f", "#7b5e2b"];

// Photos are shrunk in the browser first (max 1280px, JPEG) so a status is a
// few hundred KB, not a multi-megabyte camera original.
function shrinkImage(file, maxSide = 1280, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Couldn't read that image."));
    };
    img.src = url;
  });
}

// Full-screen "new status": a coloured text card, or a photo with a caption.
export default function StatusComposer({ onClose, onPosted }) {
  const [mode, setMode] = useState("text");
  const [text, setText] = useState("");
  const [bg, setBg] = useState(BACKGROUNDS[0]);
  const [image, setImage] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef(null);

  async function pickImage(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) return setError("Please choose an image.");
    setError("");
    try {
      setImage(await shrinkImage(file));
    } catch (err) {
      setError(err.message);
    }
  }

  async function post() {
    setError("");
    if (mode === "text" && !text.trim()) return setError("Write something first.");
    if (mode === "image" && !image) return setError("Choose a photo first.");
    setBusy(true);
    try {
      await api.post("/status", {
        kind: mode,
        text: text.trim(),
        bgColor: bg,
        fileData: mode === "image" ? image : undefined
      });
      onPosted();
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || "Couldn't post your status.");
      setBusy(false);
    }
  }

  const fontSize = text.length > 180 ? "text-xl" : text.length > 80 ? "text-2xl" : "text-4xl";

  return (
    <div className="fixed inset-0 z-[120] flex flex-col" style={{ backgroundColor: mode === "text" ? bg : "#111b21" }}>
      <div className="flex items-center justify-between px-4 py-3 text-white">
        <button onClick={onClose} className="p-2 rounded-full hover:bg-white/15" title="Close">
          <X size={22} />
        </button>
        <div className="flex items-center gap-1 bg-black/25 rounded-full p-1">
          <button
            onClick={() => setMode("text")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm ${mode === "text" ? "bg-white/25" : "opacity-80"}`}
          >
            <Type size={16} /> Text
          </button>
          <button
            onClick={() => setMode("image")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm ${mode === "image" ? "bg-white/25" : "opacity-80"}`}
          >
            <ImageIcon size={16} /> Photo
          </button>
        </div>
        <span className="w-10" />
      </div>

      <div className="flex-1 min-h-0 flex items-center justify-center px-6">
        {mode === "text" ? (
          <textarea
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={700}
            placeholder="Type a status"
            className={`w-full max-w-xl bg-transparent text-white text-center outline-none resize-none placeholder-white/60 font-medium ${fontSize}`}
            rows={6}
          />
        ) : image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt="Status preview" className="max-h-full max-w-full object-contain rounded-lg" />
        ) : (
          <button
            onClick={() => fileRef.current?.click()}
            className="flex flex-col items-center gap-3 text-white/90 border-2 border-dashed border-white/40 rounded-2xl px-12 py-14 hover:bg-white/10"
          >
            <ImageIcon size={40} />
            <span className="text-sm">Choose a photo</span>
          </button>
        )}
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pickImage} />
      </div>

      {error && <p className="text-center text-sm text-white bg-black/40 mx-auto px-3 py-1 rounded-full mb-2">{error}</p>}

      <div className="px-4 pb-5 pt-2 flex flex-col gap-3">
        {mode === "text" ? (
          <div className="flex justify-center gap-2.5">
            {BACKGROUNDS.map((c) => (
              <button
                key={c}
                onClick={() => setBg(c)}
                style={{ backgroundColor: c }}
                className={`w-7 h-7 rounded-full border-2 ${bg === c ? "border-white" : "border-white/30"}`}
                aria-label={`Background ${c}`}
              />
            ))}
          </div>
        ) : (
          image && (
            <div className="flex items-center gap-2 max-w-xl w-full mx-auto">
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={700}
                placeholder="Add a caption"
                className="flex-1 bg-white/15 text-white placeholder-white/60 rounded-full px-4 py-2.5 text-sm outline-none"
              />
              <button onClick={() => fileRef.current?.click()} className="text-white/90 text-sm px-2 hover:underline">
                Change
              </button>
            </div>
          )
        )}
        <button
          onClick={post}
          disabled={busy}
          className="self-end flex items-center gap-2 bg-[var(--wa-green)] text-white rounded-full px-5 py-3 font-medium shadow-lg hover:bg-[var(--wa-green-dark)] disabled:opacity-60"
        >
          <Send size={18} /> {busy ? "Posting…" : "Post status"}
        </button>
      </div>
    </div>
  );
}
