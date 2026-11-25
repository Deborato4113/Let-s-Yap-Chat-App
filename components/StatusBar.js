"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { formatListTime } from "@/lib/utils";
import StatusRing from "./StatusRing";
import StatusViewer from "./StatusViewer";
import StatusComposer from "./StatusComposer";

function ago(ts) {
  if (!ts) return "";
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  return `Today, ${formatListTime(ts)}`;
}

// The Status tab: my own status on top, then contacts who posted in the last
// 24 hours - unseen ones first, then already-viewed ones. `statusFeed` comes
// from useStatusFeed (shared with the nav rail's green dot).
export default function StatusBar({ statusFeed }) {
  const { user } = useAuth();
  const { feed, refresh, markSeen } = statusFeed;
  const [viewer, setViewer] = useState(null); // { groups, start }
  const [composing, setComposing] = useState(false);

  const myGroup = feed.mine || {
    user: { id: user?.id, name: user?.name, avatarColor: user?.avatarColor, avatarUrl: user?.avatarUrl },
    items: []
  };
  const recent = feed.contacts.filter((g) => !g.allViewed);
  const viewed = feed.contacts.filter((g) => g.allViewed);

  function openMine() {
    if (!feed.mine) return setComposing(true);
    setViewer({ groups: [feed.mine], key: "mine" });
  }
  function openContact(group, list) {
    setViewer({ groups: list, start: list.indexOf(group) });
  }

  // keep the open viewer's data in step with the feed (e.g. after deleting)
  const liveViewer = viewer
    ? {
        ...viewer,
        groups: viewer.groups
          .map((g) => {
            const live =
              String(g.user.id) === String(user?.id) ? feed.mine : feed.contacts.find((c) => String(c.user.id) === String(g.user.id));
            return live || g;
          })
          .filter((g) => g.items.length > 0)
      }
    : null;

  const Row = ({ group, onClick, subtitle }) => (
    <button onClick={onClick} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--wa-sidebar-hover)] text-left">
      <StatusRing user={group.user} items={group.items} size={50} />
      <div className="min-w-0">
        <p className="text-sm font-medium text-[var(--wa-text-primary)] truncate">{group.user.name}</p>
        <p className="text-xs text-[var(--wa-text-secondary)]">{subtitle}</p>
      </div>
    </button>
  );

  return (
    <>
      <div className="flex-1 overflow-y-auto">
        <div className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--wa-sidebar-hover)]">
          <button onClick={openMine} className="relative rounded-full" title={feed.mine ? "View my status" : "Add status"}>
            <StatusRing user={myGroup.user} items={myGroup.items} size={50} />
            <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-[var(--wa-green)] text-white flex items-center justify-center border-2 border-[var(--wa-panel)]">
              <Plus size={12} strokeWidth={3} />
            </span>
          </button>
          <button onClick={openMine} className="min-w-0 text-left flex-1">
            <p className="text-sm font-medium text-[var(--wa-text-primary)]">My status</p>
            <p className="text-xs text-[var(--wa-text-secondary)]">
              {feed.mine ? ago(feed.mine.items[feed.mine.items.length - 1]?.createdAt) : "Tap to add a status update"}
            </p>
          </button>
          {feed.mine && (
            <button
              onClick={() => setComposing(true)}
              className="text-xs font-medium text-[var(--wa-green)] px-2 py-1 rounded hover:bg-[var(--wa-border)]"
            >
              Add
            </button>
          )}
        </div>

        {recent.length > 0 && (
          <>
            <p className="px-4 pt-3 pb-1 text-xs font-medium text-[var(--wa-green)]">Recent updates</p>
            {recent.map((g) => (
              <Row key={g.user.id} group={g} subtitle={ago(g.latest)} onClick={() => openContact(g, recent)} />
            ))}
          </>
        )}
        {viewed.length > 0 && (
          <>
            <p className="px-4 pt-3 pb-1 text-xs font-medium text-[var(--wa-text-secondary)]">Viewed updates</p>
            {viewed.map((g) => (
              <Row key={g.user.id} group={g} subtitle={ago(g.latest)} onClick={() => openContact(g, viewed)} />
            ))}
          </>
        )}
        {feed.contacts.length === 0 && (
          <p className="text-center text-sm text-[var(--wa-text-secondary)] mt-8 px-8 leading-snug">
            Statuses from your contacts show up here for 24 hours.
          </p>
        )}
      </div>

      {liveViewer && liveViewer.groups.length > 0 && (
        <StatusViewer
          groups={liveViewer.groups}
          startGroup={Math.min(liveViewer.start || 0, liveViewer.groups.length - 1)}
          meId={user?.id}
          onClose={() => {
            setViewer(null);
            refresh();
          }}
          onSeen={markSeen}
          onDeleted={refresh}
        />
      )}
      {composing && <StatusComposer onClose={() => setComposing(false)} onPosted={refresh} />}
    </>
  );
}
