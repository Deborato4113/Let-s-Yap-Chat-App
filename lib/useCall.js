"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import api from "./api";

// STUN alone (just the Google server) only helps two peers discover each
// other's public address - it can't relay media itself. That's enough when
// both sides can reach each other directly, which is why calls "worked" in
// local testing, but many real-world networks (especially mobile/carrier
// NAT, or strict corporate/home routers) can't establish a direct
// peer-to-peer path at all - the call still connects (SDP/ICE candidates
// exchange fine over the signaling socket) but no audio/video ever arrives,
// because there's nothing to fall back to. A TURN server relays the actual
// media through itself when a direct path fails.
//
// Real TURN credentials (Metered.ca) are fetched fresh from our own
// /api/turn-credentials route right before each call - never hardcoded here,
// since this file ships to the browser and anyone could read a hardcoded key
// straight out of the JS bundle. The API key itself lives server-side only
// (METERED_API_KEY env var). If that fetch fails for any reason, fall back to
// STUN-only so calls between peers on friendly networks still work.
const FALLBACK_ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }];

let cachedIceServers = null;
let cachedIceServersAt = 0;

async function getIceServers() {
  // Metered's credentials are short-lived, but there's no need to re-fetch on
  // every single call in quick succession - a minute of caching is plenty.
  if (cachedIceServers && Date.now() - cachedIceServersAt < 60 * 1000) return cachedIceServers;
  try {
    const { data } = await api.get("/turn-credentials");
    if (Array.isArray(data?.iceServers) && data.iceServers.length) {
      cachedIceServers = data.iceServers;
      cachedIceServersAt = Date.now();
      return cachedIceServers;
    }
  } catch (err) {
    console.error("Failed to fetch TURN credentials, falling back to STUN-only:", err.message);
  }
  return FALLBACK_ICE_SERVERS;
}

// 1:1 audio/video calling. The socket only relays the SDP offer/answer and
// ICE candidates between the two users - the actual media stream is
// peer-to-peer via WebRTC once the connection is established.
export function useCall(socket) {
  const [callState, setCallState] = useState("idle"); // idle | calling | ringing | active
  const [callType, setCallType] = useState("audio"); // audio | video
  const [peerInfo, setPeerInfo] = useState(null); // { id, name, avatarColor, avatarUrl }
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [muted, setMuted] = useState(false);
  const [videoOff, setVideoOff] = useState(false);
  const [error, setError] = useState("");

  const pcRef = useRef(null);
  const pendingOfferRef = useRef(null);
  const pendingCandidatesRef = useRef([]);

  const cleanup = useCallback(() => {
    pcRef.current?.close();
    pcRef.current = null;
    localStream?.getTracks().forEach((t) => t.stop());
    pendingOfferRef.current = null;
    pendingCandidatesRef.current = [];
    setLocalStream(null);
    setRemoteStream(null);
    setCallState("idle");
    setPeerInfo(null);
    setMuted(false);
    setVideoOff(false);
  }, [localStream]);

  const createPeerConnection = useCallback(
    async (toUserId) => {
      const iceServers = await getIceServers();
      const pc = new RTCPeerConnection({ iceServers });
      pc.onicecandidate = (e) => {
        if (e.candidate) socket.emit("call-ice-candidate", { toUserId, candidate: e.candidate });
      };
      pc.ontrack = (e) => setRemoteStream(e.streams[0]);
      pc.onconnectionstatechange = () => {
        if (["failed", "disconnected", "closed"].includes(pc.connectionState)) {
          if (pc.connectionState === "failed") setError("Call connection failed.");
        }
      };
      // Visible in the browser console (F12) - if a call ever "connects" but
      // shows no video/audio again, checking this immediately says whether
      // it's a signaling issue (never gets past "checking") or a media
      // issue (reaches "connected" but ontrack never fires).
      pc.oniceconnectionstatechange = () => {
        console.log("[call] ICE connection state:", pc.iceConnectionState);
      };
      pcRef.current = pc;
      return pc;
    },
    [socket]
  );

  const startCall = useCallback(
    async (peer, type) => {
      if (!socket || !peer) return;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: type === "video"
        });
        setLocalStream(stream);
        setCallType(type);
        setPeerInfo(peer);
        setCallState("calling");

        const pc = await createPeerConnection(peer.id);
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit("call-user", { toUserId: peer.id, callType: type, offer });
      } catch {
        setError("Couldn't access your microphone/camera.");
        cleanup();
      }
    },
    [socket, createPeerConnection, cleanup]
  );

  const acceptCall = useCallback(async () => {
    if (!socket || !pendingOfferRef.current) return;
    const { fromUserId, offer, type } = pendingOfferRef.current;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: type === "video"
      });
      setLocalStream(stream);

      const pc = await createPeerConnection(fromUserId);
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      for (const candidate of pendingCandidatesRef.current) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
      }
      pendingCandidatesRef.current = [];

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit("call-answer", { toUserId: fromUserId, answer });
      setCallState("active");
    } catch {
      setError("Couldn't access your microphone/camera.");
      socket.emit("call-reject", { toUserId: fromUserId });
      cleanup();
    }
  }, [socket, createPeerConnection, cleanup]);

  const rejectCall = useCallback(() => {
    if (pendingOfferRef.current) socket?.emit("call-reject", { toUserId: pendingOfferRef.current.fromUserId });
    cleanup();
  }, [socket, cleanup]);

  const endCall = useCallback(() => {
    if (peerInfo) socket?.emit("call-end", { toUserId: peerInfo.id });
    cleanup();
  }, [socket, peerInfo, cleanup]);

  const toggleMute = useCallback(() => {
    if (!localStream) return;
    const next = !muted;
    localStream.getAudioTracks().forEach((t) => (t.enabled = !next));
    setMuted(next);
  }, [localStream, muted]);

  const toggleVideo = useCallback(() => {
    if (!localStream) return;
    const next = !videoOff;
    localStream.getVideoTracks().forEach((t) => (t.enabled = !next));
    setVideoOff(next);
  }, [localStream, videoOff]);

  useEffect(() => {
    if (!socket) return;

    function onIncomingCall({ fromUserId, fromName, fromAvatarColor, fromAvatarUrl, callType: type, offer }) {
      // Already on a call - silently reject (busy).
      if (pcRef.current) {
        socket.emit("call-reject", { toUserId: fromUserId });
        return;
      }
      pendingOfferRef.current = { fromUserId, offer, type };
      setPeerInfo({ id: fromUserId, name: fromName, avatarColor: fromAvatarColor, avatarUrl: fromAvatarUrl });
      setCallType(type);
      setCallState("ringing");
    }

    async function onCallAnswered({ answer }) {
      const pc = pcRef.current;
      if (!pc) return;
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
      setCallState("active");
    }

    async function onIceCandidate({ candidate }) {
      const pc = pcRef.current;
      if (pc && pc.remoteDescription) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
      } else {
        pendingCandidatesRef.current.push(candidate);
      }
    }

    function onCallRejected() {
      setError("Call declined.");
      cleanup();
    }

    function onCallEnded() {
      cleanup();
    }

    function onCallUnavailable() {
      setError("They're not available right now.");
      cleanup();
    }

    socket.on("incoming-call", onIncomingCall);
    socket.on("call-answered", onCallAnswered);
    socket.on("call-ice-candidate", onIceCandidate);
    socket.on("call-rejected", onCallRejected);
    socket.on("call-ended", onCallEnded);
    socket.on("call-unavailable", onCallUnavailable);

    return () => {
      socket.off("incoming-call", onIncomingCall);
      socket.off("call-answered", onCallAnswered);
      socket.off("call-ice-candidate", onIceCandidate);
      socket.off("call-rejected", onCallRejected);
      socket.off("call-ended", onCallEnded);
      socket.off("call-unavailable", onCallUnavailable);
    };
  }, [socket, cleanup]);

  return {
    callState,
    callType,
    peerInfo,
    localStream,
    remoteStream,
    muted,
    videoOff,
    error,
    clearError: () => setError(""),
    startCall,
    acceptCall,
    rejectCall,
    endCall,
    toggleMute,
    toggleVideo
  };
}
