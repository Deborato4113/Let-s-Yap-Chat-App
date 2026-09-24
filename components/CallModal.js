"use client";

import { useEffect, useRef, useState } from "react";
import { Phone, PhoneOff, Video, Mic, MicOff, VideoOff } from "lucide-react";
import Avatar from "./Avatar";

function useElapsed(active) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!active) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSeconds(0);
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [active]);
  const m = Math.floor(seconds / 60);
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export default function CallModal({ call }) {
  const {
    callState,
    callType,
    peerInfo,
    localStream,
    remoteStream,
    muted,
    videoOff,
    error,
    clearError,
    acceptCall,
    rejectCall,
    endCall,
    toggleMute,
    toggleVideo
  } = call;

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const elapsed = useElapsed(callState === "active");

  useEffect(() => {
    if (localVideoRef.current) localVideoRef.current.srcObject = localStream || null;
  }, [localStream]);

  useEffect(() => {
    if (callType === "video" && remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream || null;
    if (callType === "audio" && remoteAudioRef.current) remoteAudioRef.current.srcObject = remoteStream || null;
  }, [remoteStream, callType]);

  // Transient toast for a declined/unavailable/failed call - not a modal,
  // shouldn't block the UI.
  useEffect(() => {
    if (!error) return;
    const id = setTimeout(clearError, 3000);
    return () => clearTimeout(id);
  }, [error, clearError]);

  if (callState === "idle") {
    return error ? (
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-[var(--wa-panel)] shadow-lg rounded-full px-5 py-2.5 text-sm text-[var(--wa-text-primary)] z-50">
        {error}
      </div>
    ) : null;
  }

  const isVideo = callType === "video";

  return (
    <div className="fixed inset-0 bg-[#111b21] z-50 flex flex-col items-center justify-between text-white py-10">
      <audio ref={remoteAudioRef} autoPlay />

      <div className="flex flex-col items-center gap-3 mt-10">
        <Avatar name={peerInfo?.name} color={peerInfo?.avatarColor} avatarUrl={peerInfo?.avatarUrl} size={112} />
        <p className="text-xl font-medium">{peerInfo?.name}</p>
        <p className="text-white/60 text-sm">
          {callState === "calling" && "Calling…"}
          {callState === "ringing" && `Incoming ${isVideo ? "video" : "voice"} call…`}
          {callState === "active" && elapsed}
        </p>
      </div>

      {/*
        These <video> elements stay mounted at all times (for any call type/
        state) rather than being conditionally rendered, and are only hidden
        via CSS when not needed. Conditionally rendering them was a real bug:
        for the person RECEIVING a call, the local camera stream gets set
        while callState is still "ringing" - before this block would have
        mounted - so the srcObject-binding effect ran while the ref was still
        null and did nothing. By the time callState flipped to "active" and
        the video tags finally mounted, `localStream`/`remoteStream` hadn't
        changed again, so the effect never re-ran and the video stayed black.
        Keeping the elements always in the DOM means the effect can bind the
        stream the moment it becomes available, regardless of callState.
      */}
      <div
        className={`relative w-full max-w-2xl aspect-video mx-6 rounded-xl overflow-hidden bg-black/40 ${
          isVideo && (callState === "active" || callState === "calling") ? "" : "hidden"
        }`}
      >
        <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
        <video
          ref={localVideoRef}
          autoPlay
          playsInline
          muted
          className="absolute bottom-3 right-3 w-28 h-20 rounded-lg object-cover border-2 border-white/20"
        />
      </div>
      {!isVideo && <div className="flex-1" />}

      <div className="flex items-center gap-6 mb-4">
        {callState === "ringing" ? (
          <>
            <button
              onClick={rejectCall}
              className="w-16 h-16 rounded-full bg-[var(--wa-danger)] flex items-center justify-center hover:opacity-90"
              title="Decline"
            >
              <PhoneOff size={26} />
            </button>
            <button
              onClick={acceptCall}
              className="w-16 h-16 rounded-full bg-[var(--wa-green)] flex items-center justify-center hover:opacity-90"
              title="Accept"
            >
              {isVideo ? <Video size={26} /> : <Phone size={26} />}
            </button>
          </>
        ) : (
          <>
            <button
              onClick={toggleMute}
              className={`w-14 h-14 rounded-full flex items-center justify-center ${
                muted ? "bg-white text-[#111b21]" : "bg-white/15 hover:bg-white/25"
              }`}
              title={muted ? "Unmute" : "Mute"}
            >
              {muted ? <MicOff size={22} /> : <Mic size={22} />}
            </button>
            {isVideo && (
              <button
                onClick={toggleVideo}
                className={`w-14 h-14 rounded-full flex items-center justify-center ${
                  videoOff ? "bg-white text-[#111b21]" : "bg-white/15 hover:bg-white/25"
                }`}
                title={videoOff ? "Turn camera on" : "Turn camera off"}
              >
                {videoOff ? <VideoOff size={22} /> : <Video size={22} />}
              </button>
            )}
            <button
              onClick={endCall}
              className="w-16 h-16 rounded-full bg-[var(--wa-danger)] flex items-center justify-center hover:opacity-90"
              title="End call"
            >
              <PhoneOff size={26} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
