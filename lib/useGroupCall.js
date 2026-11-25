"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { mediaConstraints } from "./prefs";
import { getIceServers } from "./useCall";

// Group voice/video calls as a WebRTC "mesh": each person keeps one direct
// connection to every other person. The server only tracks who is in the call and
// relays offers/answers/ICE. Connections use the "perfect negotiation" pattern so
// that adding or removing a track mid-call (screen sharing) can't deadlock when
// both sides happen to renegotiate at the same moment.
export function useGroupCall(socket, myId) {
  const [callState, setCallState] = useState("idle"); // idle | active
  const [callType, setCallType] = useState("audio");
  const [conversationId, setConversationId] = useState(null);
  const [groupName, setGroupName] = useState("");
  const [localStream, setLocalStream] = useState(null);
  const [screenStream, setScreenStream] = useState(null);
  const [peers, setPeers] = useState({}); // userId -> { id, name, avatarColor, avatarUrl, stream, muted, videoOff, sharing, state }
  const [muted, setMuted] = useState(false);
  const [videoOff, setVideoOff] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [incoming, setIncoming] = useState(null); // { conversationId, groupName, callType, fromName }
  const [statuses, setStatuses] = useState({}); // conversationId -> { callType, participants }
  const [error, setError] = useState("");

  const pcsRef = useRef(new Map());
  const iceRef = useRef([]);
  const localRef = useRef(null);
  const screenTrackRef = useRef(null);
  const convoRef = useRef(null);
  const stateRef = useRef({ muted: false, videoOff: false, sharing: false });
  const typeRef = useRef("audio");

  const patchPeer = useCallback((id, patch) => {
    setPeers((prev) => (prev[id] ? { ...prev, [id]: { ...prev[id], ...patch } } : prev));
  }, []);

  const announceState = useCallback(
    (patch = {}) => {
      stateRef.current = { ...stateRef.current, ...patch };
      if (convoRef.current) socket?.emit("group-call-media-state", { conversationId: convoRef.current, ...stateRef.current });
    },
    [socket]
  );

  const signal = useCallback(
    (toUserId, payload) => {
      socket?.emit("group-call-signal", { conversationId: convoRef.current, toUserId, signal: payload });
    },
    [socket]
  );

  const ensurePeer = useCallback(
    (info) => {
      let entry = pcsRef.current.get(info.id);
      if (entry) return entry;
      const pc = new RTCPeerConnection({ iceServers: iceRef.current });
      entry = { pc, polite: String(myId) > String(info.id), makingOffer: false, ignoreOffer: false, queue: [], screenSender: null };
      pcsRef.current.set(info.id, entry);
      localRef.current?.getTracks().forEach((t) => pc.addTrack(t, localRef.current));
      // Someone already sharing their screen when I join: send it too
      if (screenTrackRef.current) {
        const sender = pc.getSenders().find((s) => s.track?.kind === "video");
        if (sender) {
          sender.replaceTrack(screenTrackRef.current);
          entry.screenSender = { sender, replaced: true };
        } else {
          entry.screenSender = { sender: pc.addTrack(screenTrackRef.current, localRef.current), replaced: false };
        }
      }

      pc.onicecandidate = (e) => {
        if (e.candidate) signal(info.id, { type: "candidate", candidate: e.candidate });
      };
      pc.ontrack = (e) => {
        const stream = e.streams[0] || new MediaStream([e.track]);
        setPeers((prev) => (prev[info.id] ? { ...prev, [info.id]: { ...prev[info.id], stream, rev: (prev[info.id].rev || 0) + 1 } } : prev));
        if (!stream.__yapWatched) {
          stream.__yapWatched = true;
          const bump = () => setPeers((prev) => (prev[info.id] ? { ...prev, [info.id]: { ...prev[info.id], rev: (prev[info.id].rev || 0) + 1 } } : prev));
          stream.addEventListener("addtrack", bump);
          stream.addEventListener("removetrack", bump);
        }
      };
      pc.onnegotiationneeded = async () => {
        try {
          entry.makingOffer = true;
          await pc.setLocalDescription();
          signal(info.id, { type: "description", description: pc.localDescription });
        } catch (err) {
          console.error("[group call] negotiation failed:", err.message);
        } finally {
          entry.makingOffer = false;
        }
      };
      pc.onconnectionstatechange = () => {
        patchPeer(info.id, { state: pc.connectionState });
        if (pc.connectionState === "failed") pc.restartIce?.();
      };
      return entry;
    },
    [myId, signal, patchPeer]
  );

  const closePeer = useCallback((id) => {
    const entry = pcsRef.current.get(id);
    if (entry) {
      entry.pc.close();
      pcsRef.current.delete(id);
    }
    setPeers((prev) => {
      if (!prev[id]) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const cleanup = useCallback(() => {
    pcsRef.current.forEach((e) => e.pc.close());
    pcsRef.current.clear();
    localRef.current?.getTracks().forEach((t) => t.stop());
    screenTrackRef.current?.stop();
    localRef.current = null;
    screenTrackRef.current = null;
    convoRef.current = null;
    stateRef.current = { muted: false, videoOff: false, sharing: false };
    setLocalStream(null);
    setScreenStream(null);
    setPeers({});
    setMuted(false);
    setVideoOff(false);
    setSharing(false);
    setCallState("idle");
    setConversationId(null);
  }, []);

  const withAck = useCallback(
    (event, payload) =>
      new Promise((resolve) => {
        const timer = setTimeout(() => resolve({ error: "No response from the server." }), 10000);
        socket.emit(event, payload, (res) => {
          clearTimeout(timer);
          resolve(res || {});
        });
      }),
    [socket]
  );

  const enter = useCallback(
    async (event, convoId, name, type) => {
      if (!socket || callState !== "idle") return;
      setIncoming(null);
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(mediaConstraints(type));
      } catch {
        setError("Couldn't access your microphone/camera.");
        return;
      }
      localRef.current = stream;
      iceRef.current = await getIceServers();
      const res = await withAck(event, { conversationId: convoId, callType: type });
      if (res.error) {
        stream.getTracks().forEach((t) => t.stop());
        localRef.current = null;
        setError(res.error);
        return;
      }
      const effectiveType = res.callType || type;
      // A voice call that someone joined with a video type can't need a camera; and
      // vice versa a video call joined with only audio shows an avatar - keep it simple:
      typeRef.current = effectiveType;
      convoRef.current = String(convoId);
      setLocalStream(stream);
      setCallType(effectiveType);
      setConversationId(String(convoId));
      setGroupName(name || "Group call");
      setPeers(Object.fromEntries((res.peers || []).map((p) => [p.id, { ...p, stream: null, state: "connecting" }])));
      setCallState("active");
      // I'm the newcomer, so I make the first offer to everyone already in the call.
      (res.peers || []).forEach((p) => ensurePeer(p));
    },
    [socket, callState, withAck, ensurePeer]
  );

  const startCall = useCallback((conversation, type) => enter("group-call-start", conversation.id, conversation.groupName, type), [enter]);
  const joinCall = useCallback(
    (convoId, name, type) => enter("group-call-join", convoId, name, type || statuses[String(convoId)]?.callType || "audio"),
    [enter, statuses]
  );

  const leaveCall = useCallback(() => {
    if (convoRef.current) socket?.emit("group-call-leave", { conversationId: convoRef.current });
    cleanup();
  }, [socket, cleanup]);

  const toggleMute = useCallback(() => {
    const next = !stateRef.current.muted;
    localRef.current?.getAudioTracks().forEach((t) => (t.enabled = !next));
    setMuted(next);
    announceState({ muted: next });
  }, [announceState]);

  const toggleVideo = useCallback(() => {
    const next = !stateRef.current.videoOff;
    localRef.current?.getVideoTracks().forEach((t) => (t.enabled = !next));
    setVideoOff(next);
    announceState({ videoOff: next });
  }, [announceState]);

  const stopScreenShare = useCallback(() => {
    const track = screenTrackRef.current;
    if (!track) return;
    const cam = localRef.current?.getVideoTracks()[0] || null;
    pcsRef.current.forEach((entry) => {
      const ss = entry.screenSender;
      if (!ss) return;
      try {
        if (ss.replaced) ss.sender.replaceTrack(cam);
        else entry.pc.removeTrack(ss.sender);
      } catch {}
      entry.screenSender = null;
    });
    track.onended = null;
    track.stop();
    screenTrackRef.current = null;
    setScreenStream(null);
    setSharing(false);
    announceState({ sharing: false });
  }, [announceState]);

  const toggleScreenShare = useCallback(async () => {
    if (screenTrackRef.current) return stopScreenShare();
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setError("Screen sharing isn't supported on this device.");
      return;
    }
    let display;
    try {
      display = await navigator.mediaDevices.getDisplayMedia({ video: true });
    } catch {
      return; // the person closed the picker
    }
    const track = display.getVideoTracks()[0];
    screenTrackRef.current = track;
    track.onended = () => stopScreenShare();
    pcsRef.current.forEach((entry) => {
      const sender = entry.pc.getSenders().find((s) => s.track?.kind === "video");
      if (sender) {
        sender.replaceTrack(track);
        entry.screenSender = { sender, replaced: true };
      } else {
        entry.screenSender = { sender: entry.pc.addTrack(track, localRef.current), replaced: false };
      }
    });
    setScreenStream(new MediaStream([track]));
    setSharing(true);
    announceState({ sharing: true });
  }, [stopScreenShare, announceState]);

  useEffect(() => {
    if (!socket) return;

    const refreshList = () => socket.emit("group-calls-list", (list) => {
      setStatuses(Object.fromEntries((list || []).map((s) => [String(s.conversationId), s])));
    });
    if (socket.connected) refreshList();
    socket.on("connect", refreshList);

    function onStatus(s) {
      setStatuses((prev) => {
        const next = { ...prev };
        if (s.active) next[String(s.conversationId)] = s;
        else delete next[String(s.conversationId)];
        return next;
      });
      if (!s.active) setIncoming((cur) => (cur && String(cur.conversationId) === String(s.conversationId) ? null : cur));
    }
    function onIncoming(c) {
      if (callState !== "idle") return;
      setIncoming(c);
    }
    function onPeerJoined({ conversationId: cid, peer }) {
      if (String(cid) !== convoRef.current) return;
      setPeers((prev) => ({ ...prev, [peer.id]: { ...peer, stream: null, state: "connecting" } }));
    }
    function onPeerLeft({ conversationId: cid, userId }) {
      if (String(cid) !== convoRef.current) return;
      closePeer(userId);
    }
    function onMediaState({ conversationId: cid, userId, muted: m, videoOff: v, sharing: sh }) {
      if (String(cid) !== convoRef.current) return;
      patchPeer(userId, { muted: m, videoOff: v, sharing: sh });
    }
    async function onSignal({ conversationId: cid, fromUserId, signal: sig }) {
      if (String(cid) !== convoRef.current) return;
      const entry = ensurePeer({ id: fromUserId });
      const pc = entry.pc;
      try {
        if (sig.type === "description") {
          const d = sig.description;
          const collision = d.type === "offer" && (entry.makingOffer || pc.signalingState !== "stable");
          entry.ignoreOffer = !entry.polite && collision;
          if (entry.ignoreOffer) return;
          await pc.setRemoteDescription(d);
          for (const c of entry.queue.splice(0)) await pc.addIceCandidate(c).catch(() => {});
          if (d.type === "offer") {
            await pc.setLocalDescription();
            signal(fromUserId, { type: "description", description: pc.localDescription });
          }
        } else if (sig.type === "candidate") {
          if (!pc.remoteDescription) entry.queue.push(sig.candidate);
          else await pc.addIceCandidate(sig.candidate).catch((err) => {
            if (!entry.ignoreOffer) console.error("[group call] ICE error:", err.message);
          });
        }
      } catch (err) {
        console.error("[group call] signal failed:", err.message);
      }
    }

    socket.on("group-call-status", onStatus);
    socket.on("group-call-incoming", onIncoming);
    socket.on("group-call-peer-joined", onPeerJoined);
    socket.on("group-call-peer-left", onPeerLeft);
    socket.on("group-call-media-state", onMediaState);
    socket.on("group-call-signal", onSignal);
    return () => {
      socket.off("connect", refreshList);
      socket.off("group-call-status", onStatus);
      socket.off("group-call-incoming", onIncoming);
      socket.off("group-call-peer-joined", onPeerJoined);
      socket.off("group-call-peer-left", onPeerLeft);
      socket.off("group-call-media-state", onMediaState);
      socket.off("group-call-signal", onSignal);
    };
  }, [socket, callState, ensurePeer, closePeer, patchPeer, signal]);

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(""), 3500);
    return () => clearTimeout(t);
  }, [error]);

  return {
    callState,
    callType,
    conversationId,
    groupName,
    localStream,
    screenStream,
    peers: Object.values(peers),
    muted,
    videoOff,
    sharing,
    incoming,
    dismissIncoming: () => setIncoming(null),
    statuses,
    error,
    clearError: () => setError(""),
    startCall,
    joinCall,
    leaveCall,
    toggleMute,
    toggleVideo,
    toggleScreenShare
  };
}
