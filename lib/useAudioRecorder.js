"use client";

import { useCallback, useRef, useState } from "react";

// Records a voice message with MediaRecorder and hands back a base64 data
// URL (same "inline attachment" pattern as images/files elsewhere in the app).
export function useAudioRecorder() {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const timerRef = useRef(null);
  const [levels, setLevels] = useState([]); // recent loudness 0-1, drives the live waveform
  const meterRef = useRef({ ctx: null, timer: null });

  const stopMeter = useCallback(() => {
    clearInterval(meterRef.current.timer);
    meterRef.current.ctx?.close?.().catch?.(() => {});
    meterRef.current = { ctx: null, timer: null };
    setLevels([]);
  }, []);

  const cleanup = useCallback(() => {
    stopMeter();
    clearInterval(timerRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    mediaRecorderRef.current = null;
    setRecording(false);
    setSeconds(0);
  }, [stopMeter]);

  const start = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      alert("Voice messages need microphone access, which isn't available in this browser.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      // Live level meter (best effort - recording works without it)
      try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        const ctx = new Ctx();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        ctx.createMediaStreamSource(stream).connect(analyser);
        const buf = new Uint8Array(analyser.fftSize);
        const timer = setInterval(() => {
          analyser.getByteTimeDomainData(buf);
          let peak = 0;
          for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i] - 128));
          setLevels((prev) => [...prev.slice(-47), Math.min(1, peak / 90)]);
        }, 90);
        meterRef.current = { ctx, timer };
      } catch {}
      setRecording(true);
      setSeconds(0);
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch {
      alert("Microphone access was denied, so a voice message can't be recorded.");
    }
  }, []);

  // Resolves with { fileData, seconds } once the recorder has flushed its last chunk.
  const stop = useCallback(() => {
    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current;
      if (!recorder) return resolve(null);
      const finalSeconds = seconds;
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        const reader = new FileReader();
        reader.onload = () => {
          cleanup();
          resolve({ fileData: reader.result, seconds: finalSeconds });
        };
        reader.readAsDataURL(blob);
      };
      recorder.stop();
    });
  }, [seconds, cleanup]);

  const cancel = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.onstop = null;
      recorder.stop();
    }
    cleanup();
  }, [cleanup]);

  return { recording, seconds, levels, start, stop, cancel };
}
