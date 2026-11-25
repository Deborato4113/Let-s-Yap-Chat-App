"use client";

import { useEffect, useRef, useState } from "react";
import { PhoneOff, Mic, MicOff, Video, VideoOff, MonitorUp, MonitorX, Phone } from "lucide-react";
import Avatar from "./Avatar";
import { applySpeaker } from "@/lib/prefs";

function useElapsed(active) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!active) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSeconds(0);
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [active]);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function Tile({ name, avatarColor, avatarUrl, stream, showVideo, muted, isSelf, sharing, connecting, mirror }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.srcObject !== (stream || null)) el.srcObject = stream || null;
    if (!isSelf) applySpeaker(el);
  }, [stream, isSelf, showVideo]);

  return (
    <div className="relative w-full h-full min-h-0 bg-[#1f2c34] rounded-xl overflow-hidden flex items-center justify-center">
      {/* Always mounted: it also carries a remote person's audio */}
      <video
        ref={ref}
        autoPlay
        playsInline
        muted={isSelf}
        className={`absolute inset-0 w-full h-full ${sharing ? "object-contain bg-black" : "object-cover"} ${mirror && !sharing ? "-scale-x-100" : ""} ${showVideo ? "" : "opacity-0 pointer-events-none"}`}
      />
      {!showVideo && <Avatar name={name} color={avatarColor} avatarUrl={avatarUrl} size={72} />}
      <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between gap-2">
        <span className="px-2 py-0.5 rounded-full bg-black/55 text-xs truncate">
          {isSelf ? "You" : name}
          {sharing ? " · sharing screen" : ""}
          {connecting ? " · connecting…" : ""}
        </span>
        {muted && (
          <span className="w-6 h-6 rounded-full bg-black/55 flex items-center justify-center shrink-0">
            <MicOff size={13} />
          </span>
        )}
      </div>
    </div>
  );
}

// Full-screen group call: a grid of everyone, with mute / camera / share screen / leave.
export default function GroupCallModal({ groupCall, myUser }) {
  const { callState, callType, groupName, localStream, screenStream, peers, muted, videoOff, sharing, incoming, dismissIncoming, error, clearError, joinCall, leaveCall, toggleMute, toggleVideo, toggleScreenShare } = groupCall;
  const elapsed = useElapsed(callState === "active");
  const canShare = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getDisplayMedia;
  const isVideo = callType === "video";

  // Ring banner for a call someone started in a group I'm in
  if (callState === "idle") {
    return (
      <>
        {incoming && (
          <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] bg-[#111b21] text-white rounded-2xl shadow-2xl px-5 py-3 flex items-center gap-4 border border-white/10 max-w-[92vw]">
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{incoming.groupName}</p>
              <p className="text-xs text-white/60 truncate">
                {incoming.fromName} started a {incoming.callType === "video" ? "video" : "voice"} call
              </p>
            </div>
            <button onClick={dismissIncoming} className="px-3 py-1.5 rounded-full text-xs bg-white/15 hover:bg-white/25">
              Ignore
            </button>
            <button
              onClick={() => joinCall(incoming.conversationId, incoming.groupName, incoming.callType)}
              className="px-4 py-1.5 rounded-full text-xs bg-[var(--wa-green)] hover:opacity-90 flex items-center gap-1.5"
            >
              {incoming.callType === "video" ? <Video size={14} /> : <Phone size={14} />} Join
            </button>
          </div>
        )}
        {error && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-[var(--wa-panel)] shadow-lg rounded-full px-5 py-2.5 text-sm text-[var(--wa-text-primary)] z-50" onClick={clearError}>
            {error}
          </div>
        )}
      </>
    );
  }

  const total = peers.length + 1;
  const cols = total <= 1 ? "grid-cols-1" : total <= 4 ? "grid-cols-2" : "grid-cols-3";
  const selfShowsVideo = sharing || (isVideo && !videoOff);

  return (
    <div className="fixed inset-0 z-50 bg-[#0b141a] text-white flex flex-col">
      <div className="flex items-center justify-between px-5 py-3">
        <div className="min-w-0">
          <p className="font-medium truncate">{groupName}</p>
          <p className="text-xs text-white/60">
            {total} in call · {elapsed}
          </p>
        </div>
      </div>

      <div className={`flex-1 min-h-0 px-4 pb-4 grid ${cols} gap-3 auto-rows-fr`}>
        <Tile
          isSelf
          mirror={!sharing}
          name={myUser?.name}
          avatarColor={myUser?.avatarColor}
          avatarUrl={myUser?.avatarUrl}
          stream={sharing ? screenStream : localStream}
          showVideo={selfShowsVideo}
          muted={muted}
          sharing={sharing}
        />
        {peers.map((p) => {
          const hasVideoTrack = !!p.stream && p.stream.getVideoTracks().some((t) => t.readyState === "live");
          const showVideo = hasVideoTrack && (p.sharing || (isVideo && !p.videoOff));
          return (
            <Tile
              key={p.id}
              name={p.name}
              avatarColor={p.avatarColor}
              avatarUrl={p.avatarUrl}
              stream={p.stream}
              showVideo={showVideo}
              muted={p.muted}
              sharing={p.sharing}
              connecting={p.state !== "connected"}
            />
          );
        })}
      </div>

      {error && <p className="text-center text-sm text-white/80 pb-2" onClick={clearError}>{error}</p>}

      <div className="flex items-center justify-center gap-4 pb-6 pt-2">
        <button
          onClick={toggleMute}
          title={muted ? "Unmute" : "Mute"}
          aria-label={muted ? "Unmute" : "Mute"}
          className={`w-14 h-14 rounded-full flex items-center justify-center ${muted ? "bg-white text-[#111b21]" : "bg-white/15 hover:bg-white/25"}`}
        >
          {muted ? <MicOff size={22} /> : <Mic size={22} />}
        </button>
        {isVideo && (
          <button
            onClick={toggleVideo}
            title={videoOff ? "Turn camera on" : "Turn camera off"}
            aria-label={videoOff ? "Turn camera on" : "Turn camera off"}
            className={`w-14 h-14 rounded-full flex items-center justify-center ${videoOff ? "bg-white text-[#111b21]" : "bg-white/15 hover:bg-white/25"}`}
          >
            {videoOff ? <VideoOff size={22} /> : <Video size={22} />}
          </button>
        )}
        {canShare && (
          <button
            onClick={toggleScreenShare}
            title={sharing ? "Stop sharing" : "Share screen"}
            aria-label={sharing ? "Stop sharing" : "Share screen"}
            className={`w-14 h-14 rounded-full flex items-center justify-center ${sharing ? "bg-[var(--wa-green)]" : "bg-white/15 hover:bg-white/25"}`}
          >
            {sharing ? <MonitorX size={22} /> : <MonitorUp size={22} />}
          </button>
        )}
        <button onClick={leaveCall} title="Leave call" aria-label="Leave call" className="w-16 h-16 rounded-full bg-[var(--wa-danger)] flex items-center justify-center hover:opacity-90">
          <PhoneOff size={26} />
        </button>
      </div>
    </div>
  );
}
