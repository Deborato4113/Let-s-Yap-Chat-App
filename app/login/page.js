"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/AuthContext";
import { MessageCircle, Lock, User as UserIcon } from "lucide-react";

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await login(identifier, password);
      router.push("/chat");
    } catch (err) {
      setError(err?.response?.data?.message || "Login failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex-1 min-h-screen flex items-center justify-center bg-[var(--wa-panel-header)] px-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-6">
          <div className="w-16 h-16 rounded-full bg-[var(--wa-green)] flex items-center justify-center mb-3 shadow-md">
            <MessageCircle className="text-white" size={32} />
          </div>
          <h1 className="text-2xl font-semibold text-[var(--wa-text-primary)]">Let&apos;s Yap</h1>
          <p className="text-sm text-[var(--wa-text-secondary)] mt-1">Sign in to keep chatting</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-[var(--wa-panel)] rounded-xl shadow-sm p-8 space-y-4">
          <div>
            <label className="block text-xs font-medium text-[var(--wa-text-secondary)] mb-1.5">Username or email</label>
            <div className="flex items-center border border-[var(--wa-border-light)] rounded-lg px-3 py-2.5 focus-within:border-[var(--wa-green)]">
              <UserIcon size={18} className="text-[var(--wa-text-muted)] mr-2" />
              <input
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                required
                className="w-full outline-none text-sm text-[var(--wa-text-primary)]"
                placeholder="janedoe or jane@example.com"
                autoFocus
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--wa-text-secondary)] mb-1.5">Password</label>
            <div className="flex items-center border border-[var(--wa-border-light)] rounded-lg px-3 py-2.5 focus-within:border-[var(--wa-green)]">
              <Lock size={18} className="text-[var(--wa-text-muted)] mr-2" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full outline-none text-sm text-[var(--wa-text-primary)]"
                placeholder="••••••••"
              />
            </div>
          </div>

          {error && <p className="text-sm text-[var(--wa-danger)]">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            className="w-full bg-[var(--wa-green)] hover:bg-[var(--wa-green-dark)] transition-colors text-white font-medium rounded-lg py-2.5 disabled:opacity-60"
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>

          <p className="text-sm text-center text-[var(--wa-text-secondary)]">
            New here?{" "}
            <Link href="/register" className="text-[var(--wa-green)] font-medium hover:underline">
              Create an account
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
