"use client";

import { useEffect, useState } from "react";
import { KeyRound, ShieldCheck, Monitor, LogOut, Copy, Check } from "lucide-react";
import api from "@/lib/api";
import { useAuth } from "@/lib/AuthContext";

const Heading = ({ children }) => (
  <h3 className="text-xs font-semibold text-[var(--wa-green)] mt-7 mb-2">{children}</h3>
);
const input = "w-full border border-[var(--wa-border-light)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--wa-green)] bg-transparent text-[var(--wa-text-primary)]";
const primary = "bg-[var(--wa-green)] text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50";
const ghost = "text-sm text-[var(--wa-text-secondary)] hover:underline px-2 py-2";
const msg = (err, fallback) => err?.response?.data?.message || fallback;

// After the server hands back a fresh token (password changed, old logins ended),
// store it and reload so this device reconnects with it.
function adoptToken(token) {
  try { localStorage.setItem("yap_token", token); } catch { /* ignore */ }
  window.location.reload();
}

function RowButton({ icon: Icon, title, hint, right, onClick }) {
  return (
    <button onClick={onClick} className="w-full flex items-center justify-between gap-4 py-3 border-b border-[var(--wa-border)] text-left hover:bg-[var(--wa-sidebar-hover)] px-1">
      <span className="flex items-center gap-3">
        <Icon size={18} className="text-[var(--wa-icon)]" />
        <span>
          <span className="block text-sm text-[var(--wa-text-primary)]">{title}</span>
          {hint && <span className="block text-xs text-[var(--wa-text-secondary)]">{hint}</span>}
        </span>
      </span>
      {right}
    </button>
  );
}

function ChangePassword({ hasPassword }) {
  const [open, setOpen] = useState(false);
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    setErr("");
    if (next.length < 6) return setErr("New password must be at least 6 characters.");
    if (next !== again) return setErr("The two new passwords don't match.");
    setBusy(true);
    try {
      const { data } = await api.post("/users/password", { currentPassword: cur, newPassword: next });
      adoptToken(data.token);
    } catch (e) {
      setErr(msg(e, "Couldn't change the password."));
      setBusy(false);
    }
  }

  return (
    <>
      <RowButton
        icon={KeyRound}
        title={hasPassword ? "Change password" : "Set a password"}
        hint={hasPassword ? "Other devices are signed out when you change it." : "Lets you also sign in with your username and password."}
        onClick={() => setOpen((o) => !o)}
      />
      {open && (
        <div className="py-3 space-y-2 max-w-sm" data-testid="password-form">
          {hasPassword && <input type="password" className={input} placeholder="Current password" value={cur} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" />}
          <input type="password" className={input} placeholder="New password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
          <input type="password" className={input} placeholder="New password again" value={again} onChange={(e) => setAgain(e.target.value)} autoComplete="new-password" />
          {err && <p className="text-sm text-[var(--wa-danger)]">{err}</p>}
          <div className="flex items-center">
            <button onClick={save} disabled={busy || !next} className={primary}>{busy ? "Saving…" : "Save password"}</button>
            <button onClick={() => setOpen(false)} className={ghost}>Cancel</button>
          </div>
        </div>
      )}
    </>
  );
}

function TwoStep({ enabled, onChange }) {
  const [step, setStep] = useState("idle"); // idle | scan | codes | disable
  const [setup, setSetup] = useState(null);
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState([]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function start() {
    setErr(""); setCode(""); setBusy(true);
    try {
      const { data } = await api.post("/users/2fa/setup");
      setSetup(data);
      setStep("scan");
    } catch (e) { alert(msg(e, "Couldn't start setup.")); }
    setBusy(false);
  }
  async function enable() {
    setErr(""); setBusy(true);
    try {
      const { data } = await api.post("/users/2fa/enable", { code });
      setCodes(data.backupCodes);
      setStep("codes");
      onChange(true);
    } catch (e) { setErr(msg(e, "Couldn't turn it on.")); }
    setBusy(false);
  }
  async function disable() {
    setErr(""); setBusy(true);
    try {
      await api.post("/users/2fa/disable", { code });
      setStep("idle"); setCode("");
      onChange(false);
    } catch (e) { setErr(msg(e, "Couldn't turn it off.")); }
    setBusy(false);
  }
  async function copyCodes() {
    try { await navigator.clipboard.writeText(codes.join("\n")); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* ignore */ }
  }

  return (
    <>
      <RowButton
        icon={ShieldCheck}
        title="Two-step verification"
        hint={enabled ? "On. You'll enter a code from your authenticator app when you sign in." : "Ask for a code from an authenticator app when you sign in."}
        right={<span className={`text-xs font-medium ${enabled ? "text-[var(--wa-green)]" : "text-[var(--wa-text-muted)]"}`}>{enabled ? "On" : "Off"}</span>}
        onClick={() => { if (step !== "idle") setStep("idle"); else if (enabled) { setCode(""); setErr(""); setStep("disable"); } else start(); }}
      />
      {step === "scan" && setup && (
        <div className="py-3 space-y-3 max-w-sm" data-testid="twofa-scan">
          <p className="text-sm text-[var(--wa-text-primary)]">Scan this with an authenticator app (Google Authenticator, Authy, 1Password…), then enter the 6-digit code it shows.</p>
          <div className="bg-white p-2 rounded-lg w-48 h-48 [&>svg]:w-full [&>svg]:h-full" dangerouslySetInnerHTML={{ __html: setup.qrSvg }} />
          <p className="text-xs text-[var(--wa-text-secondary)] break-all">Can&apos;t scan? Enter this key instead: <span className="font-mono select-all text-[var(--wa-text-primary)]">{setup.secret}</span></p>
          <input className={input} inputMode="numeric" placeholder="6-digit code" value={code} onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => e.key === "Enter" && code && enable()} />
          {err && <p className="text-sm text-[var(--wa-danger)]">{err}</p>}
          <div className="flex items-center">
            <button onClick={enable} disabled={busy || !code} className={primary}>{busy ? "Checking…" : "Turn on"}</button>
            <button onClick={() => setStep("idle")} className={ghost}>Cancel</button>
          </div>
        </div>
      )}
      {step === "codes" && (
        <div className="py-3 space-y-3 max-w-sm" data-testid="twofa-codes">
          <p className="text-sm text-[var(--wa-text-primary)]">Two-step verification is on. Save these backup codes somewhere safe. Each works once if you lose your phone, and they won&apos;t be shown again.</p>
          <div className="grid grid-cols-2 gap-2 font-mono text-sm bg-[var(--wa-panel-header)] rounded-lg p-3 text-[var(--wa-text-primary)]">
            {codes.map((c) => <span key={c} className="select-all">{c}</span>)}
          </div>
          <div className="flex items-center">
            <button onClick={copyCodes} className={`${primary} inline-flex items-center gap-2`}>{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? "Copied" : "Copy codes"}</button>
            <button onClick={() => setStep("idle")} className={ghost}>Done</button>
          </div>
        </div>
      )}
      {step === "disable" && (
        <div className="py-3 space-y-2 max-w-sm" data-testid="twofa-disable">
          <p className="text-sm text-[var(--wa-text-primary)]">Enter a current code from your authenticator app (or a backup code) to turn it off.</p>
          <input className={input} placeholder="Code" value={code} onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => e.key === "Enter" && code && disable()} />
          {err && <p className="text-sm text-[var(--wa-danger)]">{err}</p>}
          <div className="flex items-center">
            <button onClick={disable} disabled={busy || !code} className={primary}>{busy ? "Checking…" : "Turn off"}</button>
            <button onClick={() => setStep("idle")} className={ghost}>Cancel</button>
          </div>
        </div>
      )}
    </>
  );
}

function ago(ms) {
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 90) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(ms).toLocaleDateString();
}

function Devices() {
  const { logout } = useAuth();
  const [list, setList] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = () => api.get("/users/sessions").then(({ data }) => setList(data)).catch(() => setList({ sessions: [] }));
  useEffect(() => { load(); }, []);

  async function end(s) {
    if (!confirm(`Sign out ${s.device}?`)) return;
    try {
      await api.delete(`/users/sessions/${s.id}`);
      setList((l) => ({ ...l, sessions: l.sessions.filter((x) => x.id !== s.id) }));
    } catch (e) { alert(msg(e, "Couldn't sign that device out.")); load(); }
  }
  async function endAll() {
    if (!confirm("Sign out of Let's Yap on every other device?")) return;
    setBusy(true);
    try {
      const { data } = await api.post("/users/sessions/logout-all", {});
      if (data.signedOut) return logout();
      if (data.token) return adoptToken(data.token);
      await load();
    } catch (e) { alert(msg(e, "Couldn't sign the other devices out.")); }
    setBusy(false);
  }

  const sessions = list?.sessions || [];
  return (
    <>
      <Heading>Logged-in devices</Heading>
      {!list && <p className="text-sm text-[var(--wa-text-secondary)]">Loading…</p>}
      {list && sessions.length === 0 && (
        <p className="text-xs text-[var(--wa-text-secondary)] mb-2 leading-snug">
          Devices will be listed here from your next sign-in. &quot;Log out everywhere&quot; works right now.
        </p>
      )}
      {sessions.map((s) => (
        <div key={s.id} data-testid="session-row" className="flex items-center justify-between gap-3 py-3 border-b border-[var(--wa-border)] px-1">
          <span className="flex items-center gap-3 min-w-0">
            <Monitor size={18} className="text-[var(--wa-icon)] shrink-0" />
            <span className="min-w-0">
              <span className="block text-sm text-[var(--wa-text-primary)] truncate">
                {s.device}{s.current && <span className="ml-2 text-xs text-[var(--wa-green)]">This device</span>}
              </span>
              <span className="block text-xs text-[var(--wa-text-secondary)] truncate">{s.ip ? `${s.ip} · ` : ""}Active {ago(s.lastActive)}</span>
            </span>
          </span>
          {!s.current && <button onClick={() => end(s)} className="text-xs text-[var(--wa-danger)] hover:underline shrink-0">Sign out</button>}
        </div>
      ))}
      <button onClick={endAll} disabled={busy} className="mt-3 inline-flex items-center gap-2 text-sm text-[var(--wa-danger)] border border-[var(--wa-border-light)] rounded-lg px-4 py-2 hover:bg-[var(--wa-sidebar-hover)] disabled:opacity-50">
        <LogOut size={16} /> Log out everywhere else
      </button>
    </>
  );
}

export default function SecuritySection({ info, onInfoChange }) {
  return (
    <>
      <ChangePassword hasPassword={!!info?.hasPassword} />
      <TwoStep enabled={!!info?.twoFactor} onChange={(v) => onInfoChange({ twoFactor: v })} />
      <Devices />
    </>
  );
}
