"use client";

import { useEffect, useRef, useState } from "react";
import { Play, Pause, Mic } from "lucide-react";

function formatDuration(sec) {
  if (!Number.isFinite(sec)) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${s}`;
}

// A small WhatsApp-style voice note / audio-file player: play/pause button,
// a scrub bar, and a running/total time readout, backed by a plain <audio>.
export default function AudioMessage({ message, accent = "var(--wa-green)" }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onLoaded = () => setDuration(audio.duration || 0);
    const onTime = () => setCurrent(audio.currentTime || 0);
    const onEnd = () => {
      setPlaying(false);
      setCurrent(0);
    };
    audio.addEventListener("loadedmetadata", onLoaded);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("ended", onEnd);
    return () => {
      audio.removeEventListener("loadedmetadata", onLoaded);
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("ended", onEnd);
    };
  }, []);

  function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      audio.play();
      setPlaying(true);
    }
  }

  function seek(e) {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    const ratio = Number(e.target.value) / 100;
    audio.currentTime = ratio * duration;
    setCurrent(audio.currentTime);
  }

  const progress = duration ? (current / duration) * 100 : 0;
  const isVoiceNote = (message.fileName || "").startsWith("voice-message");

  return (
    <div className="flex items-center gap-2.5 min-w-[220px] py-1">
      <audio ref={audioRef} src={message.fileData} preload="metadata" />
      <button
        type="button"
        onClick={toggle}
        className="w-9 h-9 rounded-full flex items-center justify-center text-white shrink-0"
        style={{ backgroundColor: accent }}
      >
        {playing ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}
      </button>
      <div className="flex-1 min-w-0">
        <input
          type="range"
          min={0}
          max={100}
          value={progress}
          onChange={seek}
          className="w-full h-1 accent-[var(--wa-green)]"
          style={{ accentColor: accent }}
        />
        <div className="flex items-center justify-between mt-0.5">
          <span className="text-[11px] text-[var(--wa-text-secondary)]">
            {formatDuration(playing || current ? current : duration)}
          </span>
          {isVoiceNote && <Mic size={12} className="text-[var(--wa-text-muted)]" />}
        </div>
      </div>
    </div>
  );
}
