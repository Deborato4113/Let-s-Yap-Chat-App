"use client";

import { MessageSquare, Phone, Video, CircleDashed, Archive, Sparkles, Star } from "lucide-react";
import Avatar from "./Avatar";

// `npm run dev` floats Next.js's round "N" badge over the bottom-left corner,
// which sits right on top of the first/last icons. Leave room for it in dev only.
const DEV_PAD = process.env.NODE_ENV === "development" ? "md:pb-20 pl-14 md:pl-0" : "";

function Badge({ n }) {
  if (!n) return null;
  return (
    <span className="absolute -top-1 -right-1 bg-[var(--wa-green)] text-white text-[10px] font-semibold rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center">
      {n > 99 ? "99+" : n}
    </span>
  );
}

function RailButton({ label, active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      className={`relative w-11 h-11 shrink-0 rounded-full flex items-center justify-center transition-colors ${
        active ? "bg-[var(--wa-border)] text-[var(--wa-text-primary)]" : "text-[var(--wa-icon)] hover:bg-[var(--wa-sidebar-hover)]"
      }`}
    >
      {children}
    </button>
  );
}

// Left icon rail (vertical on desktop, a bottom bar on phones): switches the
// list between Chats / Calls / Video calls / Status / Archived, opens Yap AI,
// and holds my profile at the bottom.
export default function NavRail({
  view,
  onViewChange,
  chatsBadge = 0,
  archivedBadge = 0,
  statusDot = false,
  yapActive = false,
  onOpenYapAi,
  onOpenStarred,
  onOpenProfile,
  profileActive = false,
  user
}) {
  return (
    <nav
      className={`flex md:flex-col flex-row items-center justify-around md:justify-start gap-1 md:gap-2 md:w-[64px] md:h-full h-14 w-full py-1 md:py-3 bg-[var(--wa-panel-header)] border-t md:border-t-0 md:border-r border-[var(--wa-border)] ${DEV_PAD}`}
      aria-label="Main navigation"
    >
      <RailButton label="Chats" active={view === "chats"} onClick={() => onViewChange("chats")}>
        <MessageSquare size={22} />
        <Badge n={chatsBadge} />
      </RailButton>
      <RailButton label="Calls" active={view === "calls"} onClick={() => onViewChange("calls")}>
        <Phone size={22} />
      </RailButton>
      <RailButton label="Video calls" active={view === "video"} onClick={() => onViewChange("video")}>
        <Video size={22} />
      </RailButton>
      <RailButton label="Status" active={view === "status"} onClick={() => onViewChange("status")}>
        <CircleDashed size={22} />
        {statusDot && <span className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-[var(--wa-green)] border-2 border-[var(--wa-panel-header)]" />}
      </RailButton>

      <span className="hidden md:block w-7 h-px bg-[var(--wa-border-light)] my-1" />

      <RailButton label="Archived chats" active={view === "archived"} onClick={() => onViewChange("archived")}>
        <Archive size={22} />
        <Badge n={archivedBadge} />
      </RailButton>
      <RailButton label="Yap AI" active={yapActive} onClick={onOpenYapAi}>
        <Sparkles size={22} className={yapActive ? "text-[var(--wa-green)]" : ""} />
      </RailButton>

      <span className="hidden md:block flex-1" />

      <span className="hidden md:block">
        <RailButton label="Starred messages" onClick={onOpenStarred}>
          <Star size={22} />
        </RailButton>
      </span>
      <button
        onClick={onOpenProfile}
        title="Profile"
        aria-label="Profile"
        aria-current={profileActive ? "page" : undefined}
        className={`w-11 h-11 shrink-0 rounded-full flex items-center justify-center hover:bg-[var(--wa-sidebar-hover)] ${
          profileActive ? "bg-[var(--wa-border)]" : ""
        }`}
      >
        <Avatar name={user?.name} color={user?.avatarColor} avatarUrl={user?.avatarUrl} size={32} />
      </button>
    </nav>
  );
}
