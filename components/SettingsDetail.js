"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Camera, Check, Sun, Moon, Lock, ChevronRight, ChevronDown, Mic, Video as VideoIcon, Volume2, Download } from "lucide-react";
import Avatar from "./Avatar";
import api from "@/lib/api";
import { useAuth } from "@/lib/AuthContext";
import { useTheme, ACCENT_THEMES } from "@/lib/ThemeContext";
import { usePrefs, setPref, playMessageSound } from "@/lib/prefs";
import { SETTINGS_SECTIONS } from "./SettingsPanel";
import { WALLPAPERS } from "@/lib/wallpapers";
import { TIMER_OPTIONS } from "./DisappearingModal";
import SecuritySection from "./SecuritySection";
import { getPushState, enablePush, disablePush } from "@/lib/pushClient";
import { TRANSLATE_LANGUAGES, translateTarget } from "@/lib/languages";

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

function Toggle({ checked, onChange, disabled, label }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative w-11 h-6 rounded-full shrink-0 transition-colors disabled:opacity-40 ${
        checked ? "bg-[var(--wa-green)]" : "bg-[var(--wa-border-light)]"
      }`}
    >
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-5" : ""}`} />
    </button>
  );
}

function Row({ title, hint, children }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b border-[var(--wa-border)]">
      <div className="min-w-0">
        <p className="text-sm text-[var(--wa-text-primary)]">{title}</p>
        {hint && <p className="text-xs text-[var(--wa-text-secondary)] mt-0.5 leading-snug">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

const Heading = ({ children }) => <p className="text-xs font-medium text-[var(--wa-green)] mt-6 mb-1 first:mt-0">{children}</p>;

/* ---------------- sections ---------------- */

function General() {
  const prefs = usePrefs();
  const sizes = [
    ["sm", "Small"],
    ["md", "Default"],
    ["lg", "Large"],
    ["xl", "Extra large"]
  ];
  return (
    <>
      <Heading>Display</Heading>
      <Row title="Text size" hint="Scales text and buttons across the whole app on this device.">
        <div className="flex rounded-lg overflow-hidden border border-[var(--wa-border-light)] shrink-0">
          {sizes.map(([id, label]) => (
            <button
              key={id}
              onClick={() => setPref("textSize", id)}
              className={`px-3 py-1.5 text-xs ${
                prefs.textSize === id ? "bg-[var(--wa-green)] text-white" : "text-[var(--wa-text-secondary)] hover:bg-[var(--wa-sidebar-hover)]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </Row>
      <Heading>Translation</Heading>
      <Row title="Translate messages into" hint="Used by Translate in a message's menu. Messages are translated by Yap AI when you ask.">
        <select
          value={prefs.translateTo || ""}
          onChange={(e) => setPref("translateTo", e.target.value)}
          aria-label="Translate messages into"
          className="border border-[var(--wa-border-light)] rounded-lg px-2 py-1.5 text-sm bg-transparent text-[var(--wa-text-primary)] max-w-[11rem]"
        >
          <option value="">Browser language{typeof navigator !== "undefined" ? ` (${translateTarget()})` : ""}</option>
          {TRANSLATE_LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
      </Row>
      <Heading>Startup</Heading>
      <Row title="Reopen my last chat" hint="When you open Let's Yap on this device, jump straight back to the chat you were in.">
        <Toggle label="Reopen my last chat" checked={prefs.reopenLast} onChange={(v) => setPref("reopenLast", v)} />
      </Row>
    </>
  );
}

function Profile() {
  const { user, updateUser } = useAuth();
  const [name, setName] = useState(user?.name || "");
  const [bio, setBio] = useState(user?.bio || "");
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl || "");
  const [state, setState] = useState("idle"); // idle | saving | saved
  const fileRef = useRef(null);

  function pickPhoto(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) return alert("Please choose an image file.");
    if (file.size > MAX_PHOTO_BYTES) return alert("Please choose an image smaller than 5MB.");
    const reader = new FileReader();
    reader.onload = () => setAvatarUrl(reader.result);
    reader.readAsDataURL(file);
  }

  async function save() {
    setState("saving");
    try {
      const { data } = await api.patch("/users/me", { name, bio, avatarUrl });
      updateUser(data.user);
      setState("saved");
      setTimeout(() => setState("idle"), 1800);
    } catch {
      setState("idle");
      alert("Couldn't save your profile. Try again.");
    }
  }

  const dirty = name !== (user?.name || "") || bio !== (user?.bio || "") || avatarUrl !== (user?.avatarUrl || "");
  const line = "w-full border-b border-[var(--wa-border)] focus:border-[var(--wa-green)] outline-none py-2 text-sm bg-transparent text-[var(--wa-text-primary)]";

  return (
    <div className="max-w-md">
      <div className="flex flex-col items-center mb-6">
        <button onClick={() => fileRef.current?.click()} className="relative group" title="Change profile photo">
          <Avatar name={name || user?.name} color={user?.avatarColor} avatarUrl={avatarUrl} size={120} />
          <span className="absolute inset-0 rounded-full bg-black/0 group-hover:bg-black/40 flex items-center justify-center transition-colors">
            <Camera size={24} className="text-white opacity-0 group-hover:opacity-100 transition-opacity" />
          </span>
        </button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pickPhoto} />
        {avatarUrl && (
          <button onClick={() => setAvatarUrl("")} className="text-xs text-[var(--wa-danger)] mt-2">
            Remove photo
          </button>
        )}
      </div>

      <label className="text-xs text-[var(--wa-green)] font-medium">Your name</label>
      <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} className={line} />

      <label className="text-xs text-[var(--wa-green)] font-medium block mt-5">Status</label>
      <input value={bio} onChange={(e) => setBio(e.target.value)} maxLength={140} placeholder="Current mood" className={line} />
      <p className="text-[11px] text-[var(--wa-text-muted)] mt-1">Shown to your contacts in Contact info.</p>

      <label className="text-xs text-[var(--wa-green)] font-medium block mt-5">Username</label>
      <p className="py-2 text-sm text-[var(--wa-text-secondary)]">@{user?.username}</p>

      <button
        onClick={save}
        disabled={!dirty || state === "saving"}
        className="mt-5 w-full flex items-center justify-center gap-2 bg-[var(--wa-green)] text-white text-sm font-medium py-2.5 rounded-lg disabled:opacity-50"
      >
        <Check size={16} /> {state === "saving" ? "Saving…" : state === "saved" ? "Saved" : "Save changes"}
      </button>
    </div>
  );
}

function Account({ onOpenAppLock }) {
  const [info, setInfo] = useState(null);
  const [downloading, setDownloading] = useState(false);
  async function downloadData() {
    setDownloading(true);
    try {
      const res = await api.get("/users/export", { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `lets-yap-data-${info?.username || "me"}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      alert("Couldn't prepare your data. Try again.");
    } finally {
      setDownloading(false);
    }
  }
  useEffect(() => {
    api.get("/users/account").then(({ data }) => setInfo(data)).catch(() => setInfo({}));
  }, []);
  const joined = info?.createdAt ? new Date(info.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) : "";
  return (
    <>
      <Heading>Account info</Heading>
      {[
        ["Username", info?.username && `@${info.username}`],
        ["Email", info?.email],
        ["Signed in with", info?.signIn],
        ["Member since", joined]
      ].map(([k, v]) => (
        <Row key={k} title={k}>
          <span className="text-sm text-[var(--wa-text-secondary)] truncate">{info ? v || "-" : "…"}</span>
        </Row>
      ))}
      <Heading>Your data</Heading>
      <button
        onClick={downloadData}
        disabled={downloading}
        className="w-full flex items-center justify-between gap-4 py-3 border-b border-[var(--wa-border)] text-left hover:bg-[var(--wa-sidebar-hover)] px-1 disabled:opacity-50"
      >
        <span className="flex items-center gap-3">
          <Download size={18} className="text-[var(--wa-icon)]" />
          <span>
            <span className="block text-sm text-[var(--wa-text-primary)]">{downloading ? "Preparing your data…" : "Download all my data"}</span>
            <span className="block text-xs text-[var(--wa-text-secondary)]">Your profile, chats and messages as one file. Photos and files are listed by name only.</span>
          </span>
        </span>
      </button>
      <Heading>Security</Heading>
      <button onClick={onOpenAppLock} className="w-full flex items-center justify-between gap-4 py-3 border-b border-[var(--wa-border)] text-left hover:bg-[var(--wa-sidebar-hover)] px-1">
        <span className="flex items-center gap-3">
          <Lock size={18} className="text-[var(--wa-icon)]" />
          <span>
            <span className="block text-sm text-[var(--wa-text-primary)]">App lock</span>
            <span className="block text-xs text-[var(--wa-text-secondary)]">Ask for a PIN to open Let&apos;s Yap on this device.</span>
          </span>
        </span>
        <ChevronRight size={18} className="text-[var(--wa-icon)]" />
      </button>
      <SecuritySection info={info} onInfoChange={(patch) => setInfo((i) => ({ ...i, ...patch }))} />
    </>
  );
}

function Privacy() {
  const [list, setList] = useState(null);
  useEffect(() => {
    api.get("/users/blocked").then(({ data }) => setList(data.users)).catch(() => setList([]));
  }, []);

  async function unblock(u) {
    setList((l) => l.filter((x) => x.id !== u.id));
    try {
      await api.post("/users/block", { userId: u.id, block: false });
    } catch {
      setList((l) => [u, ...l]);
      alert("Couldn't unblock. Try again.");
    }
  }

  const { user, updateUser } = useAuth();
  async function setDefaultTimer(seconds) {
    const before = user?.defaultDisappearingSeconds || 0;
    updateUser({ defaultDisappearingSeconds: seconds });
    try {
      await api.patch("/users/me", { defaultDisappearing: seconds });
    } catch {
      updateUser({ defaultDisappearingSeconds: before });
      alert("Couldn't save. Try again.");
    }
  }

  return (
    <>
      <Heading>Default message timer</Heading>
      <p className="text-xs text-[var(--wa-text-secondary)] mb-2 leading-snug">
        Start new chats with disappearing messages. Existing chats keep their own setting.
      </p>
      <div className="flex flex-wrap gap-2 pb-2">
        {TIMER_OPTIONS.map(([seconds, label]) => (
          <button
            key={seconds}
            onClick={() => setDefaultTimer(seconds)}
            className={`px-3 py-1.5 rounded-full text-xs border ${
              (user?.defaultDisappearingSeconds || 0) === seconds
                ? "bg-[var(--wa-green)] text-white border-[var(--wa-green)]"
                : "border-[var(--wa-border)] text-[var(--wa-text-secondary)]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <Heading>Blocked contacts</Heading>
      <p className="text-xs text-[var(--wa-text-secondary)] mb-2 leading-snug">
        Blocked people can&apos;t see your photo or when you&apos;re online, and they aren&apos;t told that you blocked them.
      </p>
      {list === null && <p className="text-sm text-[var(--wa-text-secondary)] py-4">Loading…</p>}
      {list?.length === 0 && <p className="text-sm text-[var(--wa-text-secondary)] py-4">You haven&apos;t blocked anyone.</p>}
      {list?.map((u) => (
        <div key={u.id} className="flex items-center gap-3 py-2.5 border-b border-[var(--wa-border)]">
          <Avatar name={u.name} color={u.avatarColor} avatarUrl={u.avatarUrl} size={40} />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-[var(--wa-text-primary)] truncate">{u.name}</p>
            <p className="text-xs text-[var(--wa-text-secondary)] truncate">@{u.username}</p>
          </div>
          <button onClick={() => unblock(u)} className="text-sm text-[var(--wa-green)] px-3 py-1.5 rounded-full hover:bg-[var(--wa-sidebar-hover)]">
            Unblock
          </button>
        </div>
      ))}
    </>
  );
}

function Chats() {
  const { accentTheme, darkMode, setAccentTheme, setDarkMode } = useTheme();
  const prefs = usePrefs();
  return (
    <>
      <Heading>Theme</Heading>
      <div className="flex gap-2 py-3">
        {[
          [false, "Light", Sun],
          [true, "Dark", Moon]
        ].map(([dark, label, Icon]) => (
          <button
            key={label}
            onClick={() => setDarkMode(dark)}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm border-2 ${
              darkMode === dark ? "border-[var(--wa-green)] text-[var(--wa-green)]" : "border-[var(--wa-border)] text-[var(--wa-text-secondary)]"
            }`}
          >
            <Icon size={16} /> {label}
          </button>
        ))}
      </div>
      <p className="text-xs text-[var(--wa-text-secondary)] mb-2">Accent colour</p>
      <div className="grid grid-cols-4 gap-3 pb-3">
        {ACCENT_THEMES.map((t) => (
          <button key={t.id} onClick={() => setAccentTheme(t.id)} className="flex flex-col items-center gap-1.5">
            <span
              className="w-11 h-11 rounded-full flex items-center justify-center border-2"
              style={{ backgroundColor: t.swatch, borderColor: accentTheme === t.id ? "var(--wa-text-primary)" : "transparent" }}
            >
              {accentTheme === t.id && <Check size={18} className="text-white" />}
            </span>
            <span className="text-[11px] text-[var(--wa-text-secondary)]">{t.label}</span>
          </button>
        ))}
      </div>
      <Heading>Chat wallpaper</Heading>
      <div className="grid grid-cols-4 gap-3 py-3">
        {WALLPAPERS.map((w) => (
          <button key={w.id} onClick={() => setPref("wallpaper", w.id)} className="flex flex-col items-center gap-1.5" aria-label={`${w.label} wallpaper`}>
            <span
              className={`w-14 h-20 rounded-lg border-2 chat-bg-pattern ${prefs.wallpaper === w.id ? "border-[var(--wa-green)]" : "border-[var(--wa-border)]"}`}
              style={w.style || undefined}
            />
            <span className="text-[11px] text-[var(--wa-text-secondary)]">{w.label}</span>
          </button>
        ))}
      </div>
      <Heading>Chat settings</Heading>
      <Row title="Link previews" hint="Show a title and picture under messages that contain a link.">
        <Toggle label="Link previews" checked={prefs.linkPreviews} onChange={(v) => setPref("linkPreviews", v)} />
      </Row>
    </>
  );
}

function VideoVoice() {
  const prefs = usePrefs();
  const [devices, setDevices] = useState({ cams: [], mics: [], speakers: [] });
  const [labelsKnown, setLabelsKnown] = useState(false);
  const [testing, setTesting] = useState(false);
  const [level, setLevel] = useState(0);
  const [msg, setMsg] = useState("");
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(0);
  const ctxRef = useRef(null);
  const canPickSpeaker = typeof HTMLMediaElement !== "undefined" && "setSinkId" in HTMLMediaElement.prototype;

  async function refresh() {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    const all = await navigator.mediaDevices.enumerateDevices();
    setLabelsKnown(all.some((d) => d.label));
    setDevices({
      cams: all.filter((d) => d.kind === "videoinput"),
      mics: all.filter((d) => d.kind === "audioinput"),
      speakers: all.filter((d) => d.kind === "audiooutput")
    });
  }

  function stopTest() {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    ctxRef.current?.close().catch(() => {});
    ctxRef.current = null;
    setTesting(false);
    setLevel(0);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
    navigator.mediaDevices?.addEventListener?.("devicechange", refresh);
    return () => {
      navigator.mediaDevices?.removeEventListener?.("devicechange", refresh);
      stopTest();
    };
  }, []);

  async function startTest() {
    setMsg("");
    stopTest();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: prefs.mic ? { deviceId: { ideal: prefs.mic } } : true,
        video: prefs.camera ? { deviceId: { ideal: prefs.camera } } : true
      });
      streamRef.current = stream;
      setTesting(true);
      await refresh(); // names appear once permission is granted
      requestAnimationFrame(() => {
        if (videoRef.current) videoRef.current.srcObject = stream;
      });
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      ctxRef.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let peak = 0;
        for (const v of data) peak = Math.max(peak, Math.abs(v - 128));
        setLevel(Math.min(1, peak / 60));
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch {
      setMsg("Couldn't reach your camera or microphone. Allow access in your browser's site settings, then try again.");
    }
  }

  const select = "w-full sm:w-64 rounded-lg px-3 py-2 text-sm bg-[var(--wa-panel-header)] border border-[var(--wa-border-light)] outline-none focus:border-[var(--wa-green)] text-[var(--wa-text-primary)]";
  const opts = (list, kind) =>
    list.map((d, i) => (
      <option key={d.deviceId || i} value={d.deviceId}>
        {d.label || `${kind} ${i + 1}`}
      </option>
    ));

  return (
    <>
      <Heading>Devices used for calls</Heading>
      {!labelsKnown && (
        <p className="text-xs text-[var(--wa-text-secondary)] pb-2 leading-snug">
          Device names show up after you allow access. Use &quot;Test camera and microphone&quot; below.
        </p>
      )}
      <Row title="Microphone">
        <select value={prefs.mic} onChange={(e) => setPref("mic", e.target.value)} className={select}>
          <option value="">System default</option>
          {opts(devices.mics, "Microphone")}
        </select>
      </Row>
      <Row title="Camera">
        <select value={prefs.camera} onChange={(e) => setPref("camera", e.target.value)} className={select}>
          <option value="">System default</option>
          {opts(devices.cams, "Camera")}
        </select>
      </Row>
      <Row title="Speakers" hint={canPickSpeaker ? "" : "Your browser always uses the system default speaker."}>
        {canPickSpeaker && (
          <select value={prefs.speaker} onChange={(e) => setPref("speaker", e.target.value)} className={select}>
            <option value="">System default</option>
            {opts(devices.speakers, "Speaker")}
          </select>
        )}
      </Row>

      <Heading>Test</Heading>
      <div className="py-3">
        {testing ? (
          <div className="space-y-3 max-w-sm">
            <video ref={videoRef} autoPlay playsInline muted className="w-full rounded-lg bg-black aspect-video object-cover -scale-x-100" />
            <div className="flex items-center gap-3">
              <Mic size={16} className="text-[var(--wa-icon)]" />
              <div className="flex-1 h-2 rounded-full bg-[var(--wa-border)] overflow-hidden">
                <div className="h-full bg-[var(--wa-green)] transition-[width] duration-75" style={{ width: `${Math.round(level * 100)}%` }} />
              </div>
            </div>
            <button onClick={stopTest} className="text-sm px-4 py-2 rounded-lg border border-[var(--wa-border-light)] text-[var(--wa-text-primary)] hover:bg-[var(--wa-sidebar-hover)]">
              Stop test
            </button>
          </div>
        ) : (
          <button onClick={startTest} className="flex items-center gap-2 text-sm px-4 py-2 rounded-lg bg-[var(--wa-green)] text-white">
            <VideoIcon size={16} /> Test camera and microphone
          </button>
        )}
        {msg && <p className="text-sm text-[var(--wa-danger)] mt-3">{msg}</p>}
        <p className="text-[11px] text-[var(--wa-text-muted)] mt-3 flex items-center gap-1.5">
          <Volume2 size={12} /> Your choices apply to your next call.
        </p>
      </div>
    </>
  );
}

function Notifications() {
  const prefs = usePrefs();
  const [perm, setPerm] = useState(typeof Notification !== "undefined" ? Notification.permission : "unsupported");

  async function toggleMessages(on) {
    if (on && typeof Notification !== "undefined" && Notification.permission !== "granted") {
      const result = await Notification.requestPermission();
      setPerm(result);
      if (result !== "granted") return setPref("notifMessages", false);
    }
    setPref("notifMessages", on);
  }

  const [push, setPush] = useState({ supported: false, subscribed: false });
  const [pushBusy, setPushBusy] = useState(false);
  const [installable, setInstallable] = useState(false);
  useEffect(() => {
    getPushState().then(setPush).catch(() => {});
    const sync = () => setInstallable(!!window.__yapInstallPrompt);
    sync();
    window.addEventListener("yap-install-available", sync);
    return () => window.removeEventListener("yap-install-available", sync);
  }, []);
  async function togglePush(on) {
    setPushBusy(true);
    try {
      if (on) await enablePush();
      else await disablePush(localStorage.getItem("yap_token"));
      setPush(await getPushState());
      setPerm(typeof Notification !== "undefined" ? Notification.permission : "unsupported");
    } catch (err) {
      alert(err?.message || "Couldn't change this. Try again.");
    } finally {
      setPushBusy(false);
    }
  }
  async function installApp() {
    const ev = window.__yapInstallPrompt;
    if (!ev) return;
    ev.prompt();
    await ev.userChoice.catch(() => {});
    window.__yapInstallPrompt = null;
    setInstallable(false);
  }

  return (
    <>
      <Heading>When Let&apos;s Yap is closed</Heading>
      <Row title="Notify me even when the app is closed" hint={push.supported ? "Get new messages and missed calls as notifications on this device, even with no Let's Yap tab open. Muted chats stay silent." : "This browser can't show notifications when the app is closed. Installing the app or using Chrome, Edge or Firefox usually fixes this."}>
        <Toggle label="Notify me when closed" checked={push.subscribed} onChange={togglePush} disabled={!push.supported || pushBusy} />
      </Row>
      {installable && (
        <Row title="Install Let's Yap" hint="Add it to your home screen or desktop so it opens like an app, in its own window.">
          <button onClick={installApp} className="text-sm text-white bg-[var(--wa-green)] rounded-lg px-4 py-1.5">Install</button>
        </Row>
      )}
      <Heading>Desktop notifications</Heading>
      <Row title="Message notifications" hint="Show a notification for new messages while Let's Yap isn't in front. Muted chats stay silent.">
        <Toggle label="Message notifications" checked={prefs.notifMessages && perm === "granted"} onChange={toggleMessages} disabled={perm === "unsupported"} />
      </Row>
      {perm === "denied" && (
        <p className="text-xs text-[var(--wa-danger)] py-2 leading-snug">Notifications are blocked for this site. Allow them in your browser&apos;s site settings, then turn this on.</p>
      )}
      <Row title="Group notifications" hint="Include messages from groups. @mentions of you always notify.">
        <Toggle label="Group notifications" checked={prefs.notifGroups} onChange={(v) => setPref("notifGroups", v)} disabled={!prefs.notifMessages} />
      </Row>
      <Heading>Sounds</Heading>
      <Row title="Message sounds" hint="A soft chime for incoming messages in chats that aren't muted.">
        <div className="flex items-center gap-3">
          <button onClick={playMessageSound} className="text-xs text-[var(--wa-green)] px-2 py-1 rounded hover:bg-[var(--wa-sidebar-hover)]">
            Play
          </button>
          <Toggle label="Message sounds" checked={prefs.sounds} onChange={(v) => setPref("sounds", v)} />
        </div>
      </Row>
    </>
  );
}

function Shortcuts() {
  const mac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
  const ctrl = mac ? "⌘" : "Ctrl";
  const rows = [
    [`${ctrl} + K`, "Search your chats"],
    ["Alt + N", "Start a new chat"],
    ["Alt + L", "Lock the app (when app lock is on)"],
    ["Enter", "Send the message"],
    ["Esc", "Cancel editing a message, or close the mention list"],
    ["@", "Mention someone in a group"],
    ["↑ / ↓ then Enter", "Pick from the mention list"]
  ];
  return (
    <>
      <Heading>Quick actions</Heading>
      {rows.map(([keys, what]) => (
        <Row key={keys} title={what}>
          <kbd className="text-xs px-2 py-1 rounded-md bg-[var(--wa-panel-header)] border border-[var(--wa-border-light)] text-[var(--wa-text-primary)] shrink-0">{keys}</kbd>
        </Row>
      ))}
    </>
  );
}

const FAQ = [
  ["How do I edit a message?", "Open the message menu and choose Edit. You can edit your own text messages for 15 minutes after sending."],
  ["How do I delete a message for everyone?", "Select the message, choose Delete, then Delete for everyone. This works on your own messages for 48 hours. After that you can still delete it for yourself."],
  ["Can I delete several messages at once?", "Yes. Choose Select from a message's menu, tick the messages you want, then tap Delete."],
  ["How do I pin or archive a chat?", "Hover over a chat and use the pin or archive icons, or use Select chats in the menu to do it for several chats at once. You can pin up to 5 chats."],
  ["How do I schedule a message?", "Tap the clock icon next to the message box, write your message and pick when to send it."],
  ["What does app lock do?", "It covers Let's Yap with a PIN on this device. The PIN is stored only in this browser. If you forget it, log out and sign back in."],
  ["Someone can't see my photo or online status", "They may have blocked you, or you may have blocked them. Blocking is private, so nobody is told."]
];

function Help() {
  const [open, setOpen] = useState(0);
  return (
    <>
      <Heading>Help centre</Heading>
      {FAQ.map(([q, a], i) => (
        <div key={q} className="border-b border-[var(--wa-border)]">
          <button onClick={() => setOpen(open === i ? -1 : i)} className="w-full flex items-center justify-between gap-3 py-3 text-left">
            <span className="text-sm text-[var(--wa-text-primary)]">{q}</span>
            <ChevronDown size={16} className={`text-[var(--wa-icon)] shrink-0 transition-transform ${open === i ? "rotate-180" : ""}`} />
          </button>
          {open === i && <p className="text-sm text-[var(--wa-text-secondary)] pb-3 leading-relaxed">{a}</p>}
        </div>
      ))}
    </>
  );
}

export default function SettingsDetail({ section, onBack, onOpenAppLock }) {
  const meta = SETTINGS_SECTIONS.find((s) => s.id === section);
  if (!meta) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-[var(--wa-panel-header)] text-center px-6">
        <p className="text-2xl font-light text-[var(--wa-text-secondary)] mb-2">Settings</p>
        <p className="text-sm text-[var(--wa-text-secondary)] max-w-xs">Choose a setting from the list.</p>
      </div>
    );
  }
  const body = {
    general: <General />,
    profile: <Profile />,
    account: <Account onOpenAppLock={onOpenAppLock} />,
    privacy: <Privacy />,
    chats: <Chats />,
    video: <VideoVoice />,
    notifications: <Notifications />,
    shortcuts: <Shortcuts />,
    help: <Help />
  }[section];

  return (
    <div className="h-full flex flex-col bg-[var(--wa-panel)] border-l border-[var(--wa-border)]">
      <div className="h-16 shrink-0 flex items-center gap-3 px-5 bg-[var(--wa-panel-header)]">
        <button onClick={onBack} className="md:hidden p-1 -ml-1 text-[var(--wa-icon)]" aria-label="Back">
          <ArrowLeft size={20} />
        </button>
        <h2 className="text-lg font-medium text-[var(--wa-text-primary)]">{meta.title}</h2>
      </div>
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="max-w-xl">{body}</div>
      </div>
    </div>
  );
}
