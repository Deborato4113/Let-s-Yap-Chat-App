"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/AuthContext";
import api from "@/lib/api";
import {
  signInWithGoogle,
  signInWithFirebaseEmail,
  registerWithFirebaseEmail
} from "@/lib/firebaseClient";
import { Mail } from "lucide-react";

// Google + Firebase email/password sign-in, shared by /login and /register.
// Either path ends the same way: get a Firebase ID token client-side, hand it
// to /api/auth/firebase which verifies it and returns our own app JWT, then
// feed that into AuthContext exactly like a normal login.
export default function FirebaseAuthButtons() {
  const { loginWithFirebase } = useAuth();
  const router = useRouter();
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function finishWithIdToken(idToken) {
    const { data } = await api.post("/auth/firebase", { idToken });
    loginWithFirebase(data);
    router.push("/chat");
  }

  async function handleGoogle() {
    setError("");
    setBusy(true);
    try {
      const idToken = await signInWithGoogle();
      await finishWithIdToken(idToken);
    } catch (err) {
      if (err?.code === "auth/popup-closed-by-user") {
        // user just backed out - not a real error
      } else {
        setError(err?.response?.data?.message || "Google sign-in failed.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleEmailContinue(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      let idToken;
      try {
        idToken = await signInWithFirebaseEmail(email, password);
      } catch (err) {
        // No account with this email yet under Firebase - create one. Any
        // other error (wrong password, malformed email, etc.) surfaces as-is.
        if (err?.code === "auth/user-not-found" || err?.code === "auth/invalid-credential") {
          idToken = await registerWithFirebaseEmail(email, password);
        } else {
          throw err;
        }
      }
      await finishWithIdToken(idToken);
    } catch (err) {
      setError(err?.response?.data?.message || firebaseErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2">
      <div className="flex items-center gap-3 my-4">
        <div className="h-px flex-1 bg-[var(--wa-border-light)]" />
        <span className="text-xs text-[var(--wa-text-muted)]">or continue with</span>
        <div className="h-px flex-1 bg-[var(--wa-border-light)]" />
      </div>

      <button
        type="button"
        onClick={handleGoogle}
        disabled={busy}
        className="w-full flex items-center justify-center gap-2 border border-[var(--wa-border-light)] rounded-lg py-2.5 text-sm font-medium text-[var(--wa-text-primary)] hover:bg-[var(--wa-panel-header)] transition-colors disabled:opacity-60"
      >
        <GoogleIcon />
        Continue with Google
      </button>

      {!showEmailForm ? (
        <button
          type="button"
          onClick={() => setShowEmailForm(true)}
          className="w-full flex items-center justify-center gap-2 border border-[var(--wa-border-light)] rounded-lg py-2.5 text-sm font-medium text-[var(--wa-text-primary)] hover:bg-[var(--wa-panel-header)] transition-colors mt-2"
        >
          <Mail size={16} />
          Continue with email
        </button>
      ) : (
        <form onSubmit={handleEmailContinue} className="mt-2 space-y-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="you@example.com"
            className="w-full border border-[var(--wa-border-light)] rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[var(--wa-green)]"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            placeholder="Password"
            className="w-full border border-[var(--wa-border-light)] rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[var(--wa-green)]"
          />
          <button
            type="submit"
            disabled={busy}
            className="w-full bg-[var(--wa-green)] hover:bg-[var(--wa-green-dark)] transition-colors text-white font-medium rounded-lg py-2.5 disabled:opacity-60"
          >
            {busy ? "Please wait…" : "Continue"}
          </button>
        </form>
      )}

      {error && <p className="text-sm text-[var(--wa-danger)] mt-2">{error}</p>}
    </div>
  );
}

function firebaseErrorMessage(err) {
  switch (err?.code) {
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "Incorrect password.";
    case "auth/invalid-email":
      return "That email address doesn't look right.";
    case "auth/weak-password":
      return "Password should be at least 6 characters.";
    default:
      return "Something went wrong. Please try again.";
  }
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20.4H24v7.2h11.3c-1.6 4.6-6 7.9-11.3 7.9-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3l5.1-5.1C33.7 5.6 29.1 3.6 24 3.6 12.9 3.6 4 12.5 4 23.6s8.9 20 20 20 20-8.9 20-20c0-1.1-.1-2.1-.4-3.1Z"/>
      <path fill="#FF3D00" d="m6.3 14.7 5.9 4.3c1.6-4 5.4-6.8 9.8-6.8 3.1 0 5.9 1.2 8 3l5.1-5.1C33.7 5.6 29.1 3.6 24 3.6c-7.4 0-13.8 4.2-17 10.4Z"/>
      <path fill="#4CAF50" d="M24 43.6c5 0 9.6-1.9 13-5.1l-6-5c-1.9 1.3-4.3 2.1-7 2.1-5.3 0-9.7-3.3-11.3-7.9l-6 4.6c3.2 6.3 9.6 10.6 17.3 10.6Z"/>
      <path fill="#1976D2" d="M43.6 20.5H42V20.4H24v7.2h11.3c-.8 2.3-2.2 4.2-4.2 5.6l6 5c-.4.4 6.9-5.1 6.9-14.7 0-1.1-.1-2.1-.4-3.1Z"/>
    </svg>
  );
}
