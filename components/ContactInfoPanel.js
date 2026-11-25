"use client";

import { useRef, useState } from "react";
import { X, Ban, ShieldCheck, Flag, Camera, Pencil, Check, UserPlus, LogOut, MoreVertical, Shield } from "lucide-react";
import Avatar from "./Avatar";
import MediaGallery from "./MediaGallery";
import api from "@/lib/api";
import { compressImageFile } from "@/lib/wallpapers";

const TABS = [
  ["info", "Info"],
  ["media", "Media"],
  ["docs", "Docs"],
  ["links", "Links"]
];

function Toggle({ checked, onChange, label }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative w-11 h-6 rounded-full shrink-0 transition-colors ${checked ? "bg-[var(--wa-green)]" : "bg-[var(--wa-border-light)]"}`}
    >
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-5" : ""}`} />
    </button>
  );
}

export default function ContactInfoPanel({
  conversation,
  isBlocked,
  onClose,
  onToggleBlock,
  onReport,
  currentUserId,
  allConversations = [],
  onJumpToMessage
}) {
  const [tab, setTab] = useState("info");
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(conversation.groupName || "");
  const [menuFor, setMenuFor] = useState(null);
  const [adding, setAdding] = useState(false);
  const [picked, setPicked] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const photoRef = useRef(null);

  const peer = conversation.peer;
  const isGroup = conversation.isGroup;
  const label = isGroup ? conversation.groupName : peer?.name || "Unknown";
  const color = isGroup ? conversation.groupAvatarColor : peer?.avatarColor;
  const avatarUrl = isGroup ? conversation.groupAvatarUrl : peer?.avatarUrl;
  const admins = new Set(conversation.admins || []);
  const iAmAdmin = isGroup && admins.has(String(currentUserId));

  async function run(fn, failMsg) {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      alert(err.response?.data?.message || failMsg);
    } finally {
      setBusy(false);
    }
  }

  const patchGroup = (body) => run(() => api.patch(`/conversations/${conversation.id}/group`, body), "Couldn't update the group.");

  async function pickPhoto(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) return alert("Choose an image file.");
    try {
      await patchGroup({ avatarUrl: await compressImageFile(file, 320, 0.8) });
    } catch {
      alert("Couldn't use that photo.");
    }
  }

  async function saveName() {
    const name = nameDraft.trim();
    setEditingName(false);
    if (name && name !== conversation.groupName) await patchGroup({ name });
    else setNameDraft(conversation.groupName || "");
  }

  const memberAction = (userId, fn, failMsg) => {
    setMenuFor(null);
    return run(fn, failMsg);
  };

  const candidates = allConversations
    .filter((c) => !c.isGroup && c.peer && !c.peer.isBot && !(conversation.participants || []).some((p) => String(p.id) === String(c.peer.id)))
    .map((c) => c.peer);

  async function addPicked() {
    if (picked.size === 0) return;
    await run(async () => {
      await api.post(`/conversations/${conversation.id}/members`, { userIds: [...picked] });
      setAdding(false);
      setPicked(new Set());
    }, "Couldn't add them.");
  }

  function leave() {
    if (!confirm("Leave this group? You won't get new messages from it.")) return;
    run(async () => {
      await api.delete(`/conversations/${conversation.id}/members/${currentUserId}`);
      onClose();
    }, "Couldn't leave the group.");
  }

  const jump = onJumpToMessage
    ? (it) => {
        onClose();
        onJumpToMessage(it.id, it.timestamp);
      }
    : undefined;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-[var(--wa-panel)] rounded-lg shadow-xl w-full max-w-sm max-h-[90vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="bg-[var(--wa-green-dark)] text-white px-4 py-4 flex items-center justify-between shrink-0">
          <h2 className="font-medium text-lg">{isGroup ? "Group info" : "Contact info"}</h2>
          <button onClick={onClose} aria-label="Close" className="p-1 hover:bg-white/10 rounded-full">
            <X size={20} />
          </button>
        </div>

        <div className="overflow-y-auto min-h-0">
          <div className="p-6 flex flex-col items-center border-b border-[var(--wa-border)]">
            <div className="relative">
              <Avatar name={label} color={color} avatarUrl={avatarUrl} size={96} isGroup={isGroup} />
              {iAmAdmin && (
                <>
                  <input ref={photoRef} type="file" accept="image/*" className="hidden" onChange={pickPhoto} />
                  <button
                    onClick={() => photoRef.current?.click()}
                    aria-label="Change group photo"
                    className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-[var(--wa-green)] text-white flex items-center justify-center shadow"
                  >
                    <Camera size={15} />
                  </button>
                </>
              )}
            </div>
            {isGroup && iAmAdmin && editingName ? (
              <div className="mt-3 flex items-center gap-2">
                <input
                  autoFocus
                  value={nameDraft}
                  maxLength={60}
                  onChange={(e) => setNameDraft(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && saveName()}
                  className="bg-[var(--wa-panel-header)] rounded-lg px-3 py-1.5 text-sm outline-none text-[var(--wa-text-primary)]"
                />
                <button onClick={saveName} aria-label="Save name" className="p-1.5 rounded-full bg-[var(--wa-green)] text-white">
                  <Check size={14} />
                </button>
              </div>
            ) : (
              <p className="mt-3 text-lg font-medium text-[var(--wa-text-primary)] flex items-center gap-2">
                {label}
                {isGroup && iAmAdmin && (
                  <button onClick={() => setEditingName(true)} aria-label="Edit group name" className="p-1 rounded-full hover:bg-[var(--wa-panel-header)] text-[var(--wa-icon)]">
                    <Pencil size={14} />
                  </button>
                )}
              </p>
            )}
            {!isGroup && <p className="text-sm text-[var(--wa-text-secondary)]">@{peer?.username}</p>}
          </div>

          <div className="flex border-b border-[var(--wa-border)] sticky top-0 bg-[var(--wa-panel)] z-10" role="tablist">
            {TABS.map(([key, text]) => (
              <button
                key={key}
                role="tab"
                aria-selected={tab === key}
                onClick={() => setTab(key)}
                className={`flex-1 py-2.5 text-sm border-b-2 ${tab === key ? "border-[var(--wa-green)] text-[var(--wa-green)] font-medium" : "border-transparent text-[var(--wa-text-secondary)]"}`}
              >
                {text}
              </button>
            ))}
          </div>

          {tab !== "info" && <MediaGallery key={tab} conversationId={conversation.id} kind={tab} onJump={jump} />}

          {tab === "info" && (
            <>
              {!isGroup && (
                <div className="px-6 py-4 border-b border-[var(--wa-border)]">
                  <p className="text-xs text-[var(--wa-green)] font-medium mb-1">Status</p>
                  <p className="text-sm text-[var(--wa-text-primary)]">{peer?.bio || "Hey there! I am using Let's Yap."}</p>
                </div>
              )}

              {isGroup && iAmAdmin && (
                <div className="px-6 py-4 border-b border-[var(--wa-border)] flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[var(--wa-text-primary)]">Only admins can send</p>
                    <p className="text-xs text-[var(--wa-text-secondary)]">Other members can read but not post.</p>
                  </div>
                  <Toggle label="Only admins can send messages" checked={!!conversation.onlyAdminsSend} onChange={(v) => patchGroup({ onlyAdminsSend: v })} />
                </div>
              )}
              {isGroup && !iAmAdmin && conversation.onlyAdminsSend && (
                <p className="px-6 py-3 text-xs text-[var(--wa-text-secondary)] border-b border-[var(--wa-border)]">Only admins can send messages in this group.</p>
              )}

              {isGroup && (
                <div className="px-6 py-4 border-b border-[var(--wa-border)]">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs text-[var(--wa-green)] font-medium">{conversation.participants?.length || 0} members</p>
                    {iAmAdmin && (
                      <button onClick={() => setAdding((v) => !v)} className="flex items-center gap-1.5 text-xs text-[var(--wa-green)] hover:underline">
                        <UserPlus size={14} /> Add members
                      </button>
                    )}
                  </div>

                  {adding && (
                    <div className="mb-3 rounded-lg border border-[var(--wa-border)] p-2">
                      {candidates.length === 0 ? (
                        <p className="text-xs text-[var(--wa-text-secondary)] p-2">Everyone you chat with is already in this group.</p>
                      ) : (
                        <>
                          <div className="max-h-40 overflow-y-auto">
                            {candidates.map((p) => (
                              <label key={p.id} className="flex items-center gap-2.5 py-1.5 px-1 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={picked.has(p.id)}
                                  onChange={() =>
                                    setPicked((prev) => {
                                      const next = new Set(prev);
                                      if (next.has(p.id)) next.delete(p.id);
                                      else next.add(p.id);
                                      return next;
                                    })
                                  }
                                  className="accent-[var(--wa-green)] w-4 h-4"
                                />
                                <Avatar name={p.name} color={p.avatarColor} avatarUrl={p.avatarUrl} size={28} />
                                <span className="text-sm text-[var(--wa-text-primary)] truncate">{p.name}</span>
                              </label>
                            ))}
                          </div>
                          <button
                            onClick={addPicked}
                            disabled={picked.size === 0 || busy}
                            className="mt-2 w-full py-1.5 rounded-full bg-[var(--wa-green)] text-white text-sm disabled:opacity-40"
                          >
                            Add {picked.size || ""}
                          </button>
                        </>
                      )}
                    </div>
                  )}

                  <div className="space-y-1">
                    {conversation.participants?.map((p) => {
                      const isMe = String(p.id) === String(currentUserId);
                      const isAdm = admins.has(String(p.id));
                      return (
                        <div key={p.id} className="relative flex items-center gap-2.5 py-1">
                          <Avatar name={p.name} color={p.avatarColor} avatarUrl={p.avatarUrl} size={32} />
                          <span className="text-sm text-[var(--wa-text-primary)] flex-1 truncate">
                            {p.name}
                            {isMe && <span className="text-[var(--wa-text-muted)]"> (you)</span>}
                          </span>
                          {isAdm && (
                            <span className="flex items-center gap-1 text-[10px] text-[var(--wa-green)] border border-[var(--wa-green)] rounded px-1.5 py-px">
                              <Shield size={10} /> Admin
                            </span>
                          )}
                          {iAmAdmin && !isMe && (
                            <button
                              onClick={() => setMenuFor(menuFor === p.id ? null : p.id)}
                              aria-label={`Actions for ${p.name}`}
                              className="p-1 rounded-full hover:bg-[var(--wa-panel-header)] text-[var(--wa-icon)]"
                            >
                              <MoreVertical size={16} />
                            </button>
                          )}
                          {menuFor === p.id && (
                            <div className="absolute right-0 top-8 z-20 bg-[var(--wa-panel)] shadow-lg rounded-md py-1 w-44 text-sm border border-[var(--wa-border)]">
                              <button
                                onClick={() => memberAction(p.id, () => api.patch(`/conversations/${conversation.id}/members/${p.id}`, { admin: !isAdm }), "Couldn't change admin.")}
                                className="w-full text-left px-3 py-2 hover:bg-[var(--wa-sidebar-hover)]"
                              >
                                {isAdm ? "Dismiss as admin" : "Make group admin"}
                              </button>
                              <button
                                onClick={() => {
                                  if (confirm(`Remove ${p.name} from this group?`)) memberAction(p.id, () => api.delete(`/conversations/${conversation.id}/members/${p.id}`), "Couldn't remove them.");
                                  else setMenuFor(null);
                                }}
                                className="w-full text-left px-3 py-2 hover:bg-[var(--wa-sidebar-hover)] text-[var(--wa-danger)]"
                              >
                                Remove from group
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {isGroup && (
                <div className="p-3">
                  <button onClick={leave} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-[var(--wa-sidebar-hover)] text-left text-sm text-[var(--wa-danger)]">
                    <LogOut size={18} /> Leave group
                  </button>
                </div>
              )}

              {!isGroup && (
                <div className="p-3">
                  <button
                    onClick={onToggleBlock}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-[var(--wa-sidebar-hover)] text-left text-sm ${
                      isBlocked ? "text-[var(--wa-green)]" : "text-[var(--wa-danger)]"
                    }`}
                  >
                    {isBlocked ? <ShieldCheck size={18} /> : <Ban size={18} />}
                    {isBlocked ? `Unblock ${peer?.name}` : `Block ${peer?.name}`}
                  </button>
                  {!peer?.isBot && onReport && (
                    <button onClick={onReport} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-[var(--wa-sidebar-hover)] text-left text-sm text-[var(--wa-danger)]">
                      <Flag size={18} /> Report {peer?.name}
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
