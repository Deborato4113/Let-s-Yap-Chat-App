"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

// Renders `children` in a portal on document.body, positioned next to
// `anchorRef`'s element using a fixed-position coordinate computed from its
// bounding rect, and flips/clamps to stay fully on-screen.
//
// This exists because popovers like the emoji-reaction bar used to be
// rendered as a plain `position: absolute` child inside the message list,
// which scrolls with `overflow-y-auto`. Any ancestor with overflow other
// than `visible` clips its absolutely-positioned descendants at its own
// edge, not just the viewport edge - so a popover opened near the bottom of
// the (short) visible scroll area, or near the left/right edge of a
// left/right-aligned message bubble, got visually chopped off exactly like
// the reported bug, even though there was plenty of room in the actual
// browser window. Portaling to <body> with `position: fixed` coordinates
// sidesteps that entirely: the popover is no longer a descendant of the
// clipping container at all.
export default function AnchoredPopover({ anchorRef, align = "end", onClose, children }) {
  const popRef = useRef(null);
  const [style, setStyle] = useState({ position: "fixed", top: 0, left: 0, visibility: "hidden" });

  const reposition = useRef(null);
  // Reassigned every render (not lazily initialized once) so the closure
  // below always sees the current `align` prop - otherwise the
  // ResizeObserver effect (which mounts once with an empty dep array) would
  // keep calling a version of this function frozen with whatever `align`
  // was on the very first render.
  reposition.current = () => {
    const anchor = anchorRef.current;
    const pop = popRef.current;
    if (!anchor || !pop) return;

    const GAP = 6;
    const MARGIN = 8;
    const anchorRect = anchor.getBoundingClientRect();
    const popRect = pop.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Prefer opening below the anchor; flip above it if there isn't room.
    // This same calculation re-runs (via the ResizeObserver below) whenever
    // the popover's own size changes - e.g. the reaction bar expanding into
    // the much taller full emoji picker when "+" is clicked - not just once
    // when it first opens. Without that, a popover that opened downward
    // while small would stay anchored downward even after growing past the
    // bottom of the screen, instead of flipping up the way WhatsApp's does.
    let top = anchorRect.bottom + GAP;
    if (top + popRect.height > vh - MARGIN) {
      const above = anchorRect.top - GAP - popRect.height;
      top = above >= MARGIN ? above : Math.max(MARGIN, vh - popRect.height - MARGIN);
    }

    // Align to the anchor's trailing (align="end") or leading (align="start")
    // edge, then clamp so it never runs off either side of the viewport -
    // this is what keeps it fully visible for both left-side (received) and
    // right-side (sent) message bubbles.
    let left = align === "end" ? anchorRect.right - popRect.width : anchorRect.left;
    left = Math.min(Math.max(left, MARGIN), vw - popRect.width - MARGIN);

    setStyle({ position: "fixed", top, left, visibility: "visible" });
  };

  useIsomorphicLayoutEffect(() => {
    reposition.current();
  }, [anchorRef, align]);

  useEffect(() => {
    const pop = popRef.current;
    if (!pop || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => reposition.current());
    observer.observe(pop);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    function onDocMouseDown(e) {
      if (popRef.current && !popRef.current.contains(e.target) && !anchorRef.current?.contains(e.target)) {
        onClose?.();
      }
    }
    function onScrollOrResize(e) {
      // Scroll events don't bubble, so this capturing window listener is the
      // only way to notice the message list scrolling underneath the
      // popover - but the capture pass also sees scrolling that happens
      // INSIDE the popover itself (e.g. the emoji picker's own emoji grid,
      // or a long reaction/context menu). Without this check, the moment you
      // tried to scroll within the popover it looked like "the page
      // scrolled" and the popover closed itself instantly - which is exactly
      // what made the emoji list seem unscrollable.
      // A resize event's target is the `window` object itself, not a DOM
      // node - `Node.contains()` throws a TypeError if it's handed anything
      // that isn't actually a Node, which is exactly what crashed this
      // handler the moment a resize event fired (e.g. from the browser's
      // zoom control, or a dev-tools device toolbar). `instanceof Node`
      // guards against that for resize, while still letting the "did this
      // scroll happen inside the popover" check work for real scroll events.
      if (popRef.current && e.target instanceof Node && popRef.current.contains(e.target)) return;
      onClose?.();
    }
    document.addEventListener("mousedown", onDocMouseDown);
    window.addEventListener("resize", onScrollOrResize);
    // capture:true so this fires for scrolling inside the message list too,
    // not just window-level scroll.
    window.addEventListener("scroll", onScrollOrResize, true);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      window.removeEventListener("resize", onScrollOrResize);
      window.removeEventListener("scroll", onScrollOrResize, true);
    };
  }, [anchorRef, onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div ref={popRef} style={style} className="z-[100]" onMouseDown={(e) => e.stopPropagation()}>
      {children}
    </div>,
    document.body
  );
}
