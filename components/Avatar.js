"use client";

import { initials } from "@/lib/utils";
import { Users, Sparkles } from "lucide-react";

export default function Avatar({
  name,
  color = "#00A884",
  avatarUrl = "",
  size = 44,
  isGroup = false,
  isBot = false,
  online = false,
  showStatus = false
}) {
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      {isBot ? (
        <div
          className="w-full h-full rounded-full flex items-center justify-center select-none"
          style={{ background: "linear-gradient(135deg, #4f8cff 0%, #a457f7 50%, #ff6f9c 100%)" }}
        >
          <Sparkles size={size * 0.5} className="text-white" fill="white" />
        </div>
      ) : avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatarUrl}
          alt={name || "avatar"}
          className="w-full h-full rounded-full object-cover select-none"
        />
      ) : (
        <div
          className="w-full h-full rounded-full flex items-center justify-center text-white font-medium select-none"
          style={{ backgroundColor: color, fontSize: size * 0.38 }}
        >
          {isGroup ? <Users size={size * 0.5} /> : initials(name)}
        </div>
      )}
      {showStatus && online && (
        <span
          className="absolute bottom-0 right-0 rounded-full border-2 border-[var(--wa-panel)]"
          style={{ width: size * 0.28, height: size * 0.28, backgroundColor: "var(--wa-green)" }}
        />
      )}
    </div>
  );
}
