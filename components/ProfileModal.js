"use client";

import { useRef, useState } from "react";
import { X, Check, Camera } from "lucide-react";
import Avatar from "./Avatar";
import api from "@/lib/api";
import { useAuth } from "@/lib/AuthContext";

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

export default function ProfileModal({ onClose }) {
  const { user, updateUser } = useAuth();
  const [name, setName] = useState(user?.name || "");
  const [bio, setBio] = useState(user?.bio || "");
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl || "");
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef(null);

  function handlePhotoChange(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      alert("Please choose an image file.");
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      alert("Please choose an image smaller than 5MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setAvatarUrl(reader.result);
    reader.readAsDataURL(file);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const { data } = await api.patch("/users/me", { name, bio, avatarUrl });
      updateUser(data.user);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-[var(--wa-panel)] rounded-lg shadow-xl w-full max-w-sm overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="bg-[var(--wa-green-dark)] text-white px-4 py-4 flex items-center justify-between">
          <h2 className="font-medium text-lg">Profile</h2>
          <button onClick={onClose} className="p-1 hover:bg-white/10 rounded-full">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 flex flex-col items-center">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="relative group"
            title="Change profile photo"
          >
            <Avatar name={name || user?.name} color={user?.avatarColor} avatarUrl={avatarUrl} size={96} />
            <span className="absolute inset-0 rounded-full bg-black/0 group-hover:bg-black/40 flex items-center justify-center transition-colors">
              <Camera size={22} className="text-white opacity-0 group-hover:opacity-100 transition-opacity" />
            </span>
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
          {avatarUrl && (
            <button
              type="button"
              onClick={() => setAvatarUrl("")}
              className="text-xs text-[var(--wa-danger)] mt-2"
            >
              Remove photo
            </button>
          )}

          <div className="w-full mt-6">
            <label className="text-xs text-[var(--wa-green)] font-medium">Your name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={40}
              className="w-full border-b border-[var(--wa-border)] focus:border-[var(--wa-green)] outline-none py-2 text-sm text-[var(--wa-text-primary)]"
            />
          </div>

          <div className="w-full mt-4">
            <label className="text-xs text-[var(--wa-green)] font-medium">Status</label>
            <input
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              maxLength={140}
              placeholder="Hey there! I am using Let's Yap."
              className="w-full border-b border-[var(--wa-border)] focus:border-[var(--wa-green)] outline-none py-2 text-sm text-[var(--wa-text-primary)]"
            />
            <p className="text-[11px] text-[var(--wa-text-muted)] mt-1">Shown to your contacts in Contact Info.</p>
          </div>

          <p className="w-full text-xs text-[var(--wa-text-secondary)] mt-4">@{user?.username}</p>

          <button
            onClick={handleSave}
            disabled={saving}
            className="mt-6 w-full flex items-center justify-center gap-2 bg-[var(--wa-green)] hover:bg-[var(--wa-green-dark)] text-white text-sm font-medium py-2.5 rounded-lg disabled:opacity-60"
          >
            <Check size={16} /> {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
