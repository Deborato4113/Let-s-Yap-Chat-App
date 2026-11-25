"use client";

import Avatar from "./Avatar";

// Avatar with a segmented ring: one arc per status; unseen arcs are green,
// seen ones grey. With no statuses it's just the avatar.
export default function StatusRing({ user, items = [], size = 52, children }) {
  const n = items.length;
  const stroke = 2.5;
  const r = size / 2 - stroke / 2;
  const c = 2 * Math.PI * r;
  const gap = n > 1 ? 4 : 0;
  const seg = n > 0 ? c / n - gap : 0;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      {n > 0 && (
        <svg width={size} height={size} className="absolute inset-0 -rotate-90">
          {items.map((it, i) => (
            <circle
              key={it.id}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              strokeWidth={stroke}
              strokeLinecap="round"
              stroke={it.viewed ? "var(--wa-text-muted)" : "var(--wa-green)"}
              strokeDasharray={`${Math.max(seg, 1)} ${c - Math.max(seg, 1)}`}
              strokeDashoffset={-(i * (c / n))}
            />
          ))}
        </svg>
      )}
      <div className="absolute" style={{ inset: n > 0 ? 5 : 0 }}>
        <Avatar name={user.name} color={user.avatarColor} avatarUrl={user.avatarUrl} size={n > 0 ? size - 10 : size} />
      </div>
      {children}
    </div>
  );
}
