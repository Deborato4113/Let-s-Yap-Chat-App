"use client";

import { X, EyeOff } from "lucide-react";

// Full-screen look at a view-once photo/video. It exists only in this component's
// memory: once closed it is gone from this device, and the server won't send it again.
// (Like any app, this can't stop a screenshot or a photo of the screen.)
export default function ViewOnceViewer({ type, fileData, onClose }) {
  return (
    <div
      className="fixed inset-0 z-[70] bg-black/95 flex flex-col items-center justify-center select-none"
      onContextMenu={(e) => e.preventDefault()}
      onClick={(e) => e.stopPropagation()}
      data-testid="view-once-viewer"
    >
      <button onClick={onClose} aria-label="Close" className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white">
        <X size={22} />
      </button>
      <div className="max-w-[92vw] max-h-[78vh] flex items-center justify-center">
        {type === "video" ? (
          <video
            src={fileData}
            controls
            autoPlay
            playsInline
            controlsList="nodownload noremoteplayback"
            disablePictureInPicture
            className="max-w-[92vw] max-h-[78vh] rounded-md"
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={fileData} alt="View-once photo" draggable={false} className="max-w-[92vw] max-h-[78vh] rounded-md object-contain" />
        )}
      </div>
      <p className="mt-4 flex items-center gap-2 text-sm text-white/80">
        <EyeOff size={16} /> View once. It disappears when you close this.
      </p>
    </div>
  );
}
