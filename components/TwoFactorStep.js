"use client";

import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";

// Second step of sign-in. Not a <form>, so it can sit inside the login form safely.
export default function TwoFactorStep({ challenge, onDone, onCancel }) {
  const { completeTwoFactor } = useAuth();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!code.trim() || busy) return;
    setError("");
    setBusy(true);
    try {
      await completeTwoFactor(challenge, code.trim());
      onDone();
    } catch (err) {
      const status = err?.response?.status;
      setError(err?.response?.data?.message || "Could not verify the code.");
      if (status === 401 && /expired/i.test(err?.response?.data?.message || "")) onCancel();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4" data-testid="twofactor-step">
      <div className="flex flex-col items-center text-center">
        <div className="w-12 h-12 rounded-full bg-[var(--wa-active)] flex items-center justify-center mb-2">
          <ShieldCheck className="text-[var(--wa-green)]" size={24} />
        </div>
        <h2 className="text-lg font-semibold text-[var(--wa-text-primary)]">Two-step verification</h2>
        <p className="text-sm text-[var(--wa-text-secondary)] mt-1">
          Enter the 6-digit code from your authenticator app, or one of your backup codes.
        </p>
      </div>
      <input
        value={code}
        onChange={(e) => setCode(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } }}
        autoFocus
        autoComplete="one-time-code"
        inputMode="text"
        placeholder="123456"
        aria-label="Verification code"
        className="w-full border border-[var(--wa-border-light)] rounded-lg px-3 py-2.5 text-center text-lg tracking-widest outline-none focus:border-[var(--wa-green)] text-[var(--wa-text-primary)]"
      />
      {error && <p className="text-sm text-[var(--wa-danger)]">{error}</p>}
      <button
        type="button"
        onClick={submit}
        disabled={busy || !code.trim()}
        className="w-full bg-[var(--wa-green)] hover:bg-[var(--wa-green-dark)] transition-colors text-white font-medium rounded-lg py-2.5 disabled:opacity-60"
      >
        {busy ? "Checking…" : "Verify"}
      </button>
      <button type="button" onClick={onCancel} className="w-full text-sm text-[var(--wa-text-secondary)] hover:underline">
        Back to sign in
      </button>
    </div>
  );
}
