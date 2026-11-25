"use client";

import { useEffect, useRef, useState } from "react";
import { Play, Pause, Mic } from "lucide-react";

const BARS = 36;
const SPEEDS = [1, 1.5, 2];
let lastSpeed = 1; // the speed you picked last carries over to the next voice note

function formatDuration(sec) {
  if (!Number.isFinite(sec)) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

// A stable, natural-looking fallback bar pattern when the audio can't be decoded.
function seededBars(seed) {
  let x = 0;
  for (const ch of String(seed)) x = (x * 31 + ch.charCodeAt(0)) >>> 0;
  return Array.from({ length: BARS }, () => {
    x = (x * 1664525 + 1013904223) >>> 0;
    return 0.25 + 0.75 * ((x >>> 8) % 100) / 100;
  });
}

// Real loudness peaks of the recording, so the waveform actually matches the voice.
async function computePeaks(dataUrl) {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const buf = await (await fetch(dataUrl)).arrayBuffer();
  const ctx = new Ctx();
  try {
    const audio = await ctx.decodeAudioData(buf);
    const ch = audio.getChannelData(0);
    const size = Math.floor(ch.length / BARS) || 1;
    const peaks = Array.from({ length: BARS }, (_, i) => {
      let max = 0;
      for (let j = i * size; j < Math.min(ch.length, (i + 1) * size); j += 8) max = Math.max(max, Math.abs(ch[j]));
      return max;
    });
    const top = Math.max(...peaks, 0.001);
    return peaks.map((p) => Math.max(0.12, p / top));
  } finally {
    ctx.close?.().catch?.(() => {});
  }
}

// WhatsApp-style voice note / audio player: play/pause, a waveform you can tap
// to seek, running time, and a 1x / 1.5x / 2x speed button.
export default function AudioMessage({ message, accent = "var(--wa-green)" }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);
  const [speed, setSpeed] = useState(lastSpeed);
  const [bars, setBars] = useState(() => seededBars(message.id || message.fileName));
  const isVoiceNote = (message.fileName || "").startsWith("voice-message");

  useEffect(() => {
    let cancelled = false;
    if (message.fileData?.startsWith("data:") && message.fileData.length < 8_000_000) {
      computePeaks(message.fileData).then((p) => !cancelled && setBars(p)).catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [message.fileData]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.playbackRate = speed;
    const onLoaded = () => {
      // recorded webm files report Infinity until they've been scanned once
      if (audio.duration === Infinity) {
        audio.currentTime = 1e101;
        const fix = () => {
          audio.removeEventListener("timeupdate", fix);
          audio.currentTime = 0;
          setDuration(audio.duration || 0);
        };
        audio.addEventListener("timeupdate", fix);
      } else setDuration(audio.duration || 0);
    };
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
  }, [speed]);

  function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      audio.playbackRate = speed;
      audio.play();
      setPlaying(true);
    }
  }

  function cycleSpeed() {
    const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
    lastSpeed = next;
    setSpeed(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  }

  function seek(e) {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    audio.currentTime = ratio * duration;
    setCurrent(audio.currentTime);
  }

  const progress = duration ? current / duration : 0;

  return (
    <div className="flex items-center gap-2.5 min-w-[240px] py-1">
      <audio ref={audioRef} src={message.fileData} preload="metadata" />
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? "Pause" : "Play"}
        className="w-9 h-9 rounded-full flex items-center justify-center text-white shrink-0"
        style={{ backgroundColor: accent }}
      >
        {playing ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}
      </button>
      <div className="flex-1 min-w-0">
        <div
          role="slider"
          aria-label="Seek"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
          onClick={seek}
          className="h-7 flex items-center gap-[2px] cursor-pointer"
        >
          {bars.map((b, i) => (
            <span
              key={i}
              className="flex-1 rounded-full"
              style={{
                height: `${Math.round(b * 100)}%`,
                minWidth: 2,
                backgroundColor: i / BARS < progress ? accent : "var(--wa-text-muted)",
                opacity: i / BARS < progress ? 1 : 0.5
              }}
            />
          ))}
        </div>
        <div className="flex items-center justify-between mt-0.5">
          <span className="text-[11px] text-[var(--wa-text-secondary)] tabular-nums">
            {formatDuration(playing || current ? current : duration)}
          </span>
          <span className="flex items-center gap-1.5">
            {isVoiceNote && <Mic size={12} className="text-[var(--wa-text-muted)]" />}
            <button
              type="button"
              onClick={cycleSpeed}
              aria-label={`Playback speed ${speed}x`}
              className="text-[11px] font-medium px-1.5 py-px rounded-full bg-[var(--wa-panel-header)] text-[var(--wa-text-secondary)] hover:bg-[var(--wa-border)] tabular-nums"
            >
              {speed}x
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}
