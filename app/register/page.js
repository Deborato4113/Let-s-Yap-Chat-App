"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/AuthContext";
import { MessageCircle } from "lucide-react";

export default function RegisterPage() {
  const { register } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({ name: "", username: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function update(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await register(form);
      router.push("/chat");
    } catch (err) {
      setError(err?.response?.data?.message || "Registration failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex-1 min-h-screen flex items-center justify-center bg-[var(--wa-panel-header)] px-4 py-10">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-6">
          <div className="w-16 h-16 rounded-full bg-[var(--wa-green)] flex items-center justify-center mb-3 shadow-md">
            <MessageCircle className="text-white" size={32} />
          </div>
          <h1 className="text-2xl font-semibold text-[var(--wa-text-primary)]">Create your account</h1>
          <p className="text-sm text-[var(--wa-text-secondary)] mt-1">Join Let&apos;s Yap in seconds</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-[var(--wa-panel)] rounded-xl shadow-sm p-8 space-y-4">
          <div>
            <label className="block text-xs font-medium text-[var(--wa-text-secondary)] mb-1.5">Full name</label>
            <input
              value={form.name}
              onChange={update("name")}
              required
              className="w-full border border-[var(--wa-border-light)] rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[var(--wa-green)]"
              placeholder="Jane Doe"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--wa-text-secondary)] mb-1.5">Username</label>
            <input
              value={form.username}
              onChange={update("username")}
              required
              minLength={3}
              className="w-full border border-[var(--wa-border-light)] rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[var(--wa-green)]"
              placeholder="janedoe"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--wa-text-secondary)] mb-1.5">Email</label>
            <input
              type="email"
              value={form.email}
              onChange={update("email")}
              required
              className="w-full border border-[var(--wa-border-light)] rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[var(--wa-green)]"
              placeholder="jane@example.com"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--wa-text-secondary)] mb-1.5">Password</label>
            <input
              type="password"
              value={form.password}
              onChange={update("password")}
              required
              minLength={6}
              className="w-full border border-[var(--wa-border-light)] rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[var(--wa-green)]"
              placeholder="At least 6 characters"
            />
          </div>

          {error && <p className="text-sm text-[var(--wa-danger)]">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            className="w-full bg-[var(--wa-green)] hover:bg-[var(--wa-green-dark)] transition-colors text-white font-medium rounded-lg py-2.5 disabled:opacity-60"
          >
            {busy ? "Creating account…" : "Create account"}
          </button>

          <p className="text-sm text-center text-[var(--wa-text-secondary)]">
            Already have an account?{" "}
            <Link href="/login" className="text-[var(--wa-green)] font-medium hover:underline">
              Sign in
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
