"use client";

// WhatsApp-style "Delete message?" confirmation dialog. Shown before any
// destructive delete (text or media) so deleting a photo works exactly the
// same way as deleting a text message.
export default function ConfirmDeleteModal({ isOwn, onCancel, onConfirm }) {
  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center px-4"
      onClick={onCancel}
    >
      <div
        className="bg-[var(--wa-panel)] rounded-lg shadow-xl w-full max-w-sm overflow-hidden animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-5 pb-3">
          <h3 className="text-base font-medium text-[var(--wa-text-primary)]">Delete message?</h3>
        </div>
        <div className="flex flex-col">
          {isOwn && (
            <button
              onClick={() => onConfirm(true)}
              className="text-left px-5 py-3 text-sm text-[var(--wa-danger)] hover:bg-[var(--wa-sidebar-hover)] border-t border-[var(--wa-border)]"
            >
              Delete for everyone
            </button>
          )}
          <button
            onClick={() => onConfirm(false)}
            className="text-left px-5 py-3 text-sm text-[var(--wa-text-primary)] hover:bg-[var(--wa-sidebar-hover)] border-t border-[var(--wa-border)]"
          >
            Delete for me
          </button>
          <button
            onClick={onCancel}
            className="text-left px-5 py-3 text-sm text-[var(--wa-text-secondary)] hover:bg-[var(--wa-sidebar-hover)] border-t border-[var(--wa-border)]"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
