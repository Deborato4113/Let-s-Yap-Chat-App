"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bricolage_Grotesque, Instrument_Sans } from "next/font/google";
import {
  MessageCircle,
  Phone,
  Video,
  Mic,
  Sparkles,
  ShieldCheck,
  Zap,
  Palette,
  CheckCheck,
  Send,
  Smile,
} from "lucide-react";

const display = Bricolage_Grotesque({ subsets: ["latin"], display: "swap" });
const body = Instrument_Sans({ subsets: ["latin"], display: "swap" });

const ACCENTS = [
  { id: "classic", label: "Green", color: "#00a884" },
  { id: "ocean", label: "Blue", color: "#0088cc" },
  { id: "sunset", label: "Orange", color: "#ff7a59" },
  { id: "orchid", label: "Purple", color: "#8b5cf6" },
];

const REPLIES = [
  "haha okay that made my day",
  "say less. see you there!",
  "wait, you have to send a pic 👀",
  "ok but who is paying 😭",
];

const nowTime = () => new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

const FEATURES = [
  { icon: Zap, title: "Instant delivery", text: "Messages land the moment you hit send, and the ticks tell you when they've been seen." },
  { icon: Phone, title: "Voice and video calls", text: "Ring a friend straight from the chat. There's no other app to open." },
  { icon: Mic, title: "Voice notes", text: "Record a voice note and play it back right in the thread." },
  { icon: Sparkles, title: "Catch me up", text: "Back after a busy day? Get the gist of what you missed and which messages are waiting on you." },
  { icon: ShieldCheck, title: "Calmer chats", text: "Harmful messages are blurred before you read them, and you can block someone quietly." },
];

const INTRO = [
  { id: 1, from: "them", text: "did you see the new dosa place near campus??", time: "6:41 PM" },
  { id: 2, from: "me", text: "not yet. is it good?", time: "6:41 PM" },
  { id: 3, from: "them", text: "unreal. friday after class?", time: "6:42 PM" },
  { id: 4, from: "me", text: "friday works 🙌", time: "6:42 PM" },
];

function PhoneDemo() {
  const [msgs, setMsgs] = useState([]);
  const [typing, setTyping] = useState(false);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const threadRef = useRef(null);
  const nextId = useRef(100);
  const replyIdx = useRef(0);
  const timers = useRef([]);

  const later = (fn, ms) => timers.current.push(setTimeout(fn, ms));

  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setMsgs(INTRO.map((m) => (m.id === 4 ? { ...m, reaction: "❤️" } : m)));
      setReady(true);
    } else {
      later(() => setMsgs([INTRO[0]]), 600);
      later(() => setMsgs(INTRO.slice(0, 2)), 1500);
      later(() => setTyping(true), 2400);
      later(() => { setTyping(false); setMsgs(INTRO.slice(0, 3)); }, 3400);
      later(() => setMsgs(INTRO), 4400);
      later(() => setMsgs(INTRO.map((m) => (m.id === 4 ? { ...m, reaction: "❤️" } : m))), 5100);
      later(() => setReady(true), 5600);
    }
    const t = timers.current;
    return () => t.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [msgs, typing]);

  function send(e) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || !ready) return;
    setDraft("");
    setMsgs((m) => [...m, { id: nextId.current++, from: "me", text, time: nowTime() }]);
    later(() => setTyping(true), 700);
    later(() => {
      setTyping(false);
      const reply = REPLIES[replyIdx.current++ % REPLIES.length];
      setMsgs((m) => [...m, { id: nextId.current++, from: "them", text: reply, time: nowTime() }]);
    }, 2000);
  }

  return (
    <div className="ly-device" aria-label="Example conversation you can type into">
      <div className="ly-slab" aria-hidden="true" />
      <div className="ly-phone">
        <div className="ly-phone-head">
          <div className="ly-avatar">M</div>
          <div className="flex-1 min-w-0 whitespace-nowrap">
            <div className="font-semibold leading-tight">Maya</div>
            <div className="text-xs opacity-70">{typing ? "typing…" : "online"}</div>
          </div>
          <Video size={18} className="opacity-70" />
          <Phone size={18} className="opacity-70 ml-3" />
        </div>

        <button
          type="button"
          className={`ly-catch ${ready ? "ly-catch-ready" : ""}`}
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
        >
          <Sparkles size={15} />
          <span>Catch me up</span>
          <span className="ly-catch-hint">{open ? "Hide" : "Try it"}</span>
        </button>

        {open && (
          <div className="ly-summary" role="status">
            <p className="font-semibold">Maya wants to try the new dosa place near campus.</p>
            <p className="mt-1">You agreed to go on Friday after class.</p>
            <p className="ly-summary-note">Needs your reply: nothing right now.</p>
          </div>
        )}

        <div className="ly-thread" ref={threadRef}>
          {msgs.map((m) => (
            <div key={m.id} className={`ly-row ${m.from === "me" ? "ly-row-me" : ""}`}>
              <div className={`ly-bubble ${m.from === "me" ? "ly-bubble-me" : "ly-bubble-them"}`}>
                <span>{m.text}</span>
                <span className="ly-meta">
                  {m.time}
                  {m.from === "me" && <CheckCheck size={14} className="ly-tick" />}
                </span>
                {m.reaction && <span className="ly-reaction">{m.reaction}</span>}
              </div>
            </div>
          ))}
          {typing && (
            <div className="ly-row">
              <div className="ly-bubble ly-bubble-them ly-typing" aria-hidden="true">
                <i /><i /><i />
              </div>
            </div>
          )}
        </div>

        <form className="ly-compose" onSubmit={send}>
          <Smile size={20} className="opacity-60 flex-none" />
          <input
            className="ly-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={!ready}
            maxLength={120}
            placeholder={ready ? "Say something to Maya" : "Type a message"}
            aria-label="Message Maya"
          />
          <button type="submit" className="ly-send" aria-label="Send" disabled={!ready || !draft.trim()}>
            <Send size={16} />
          </button>
        </form>
        <div className="ly-glare" aria-hidden="true" />
      </div>
    </div>
  );
}

function Stage() {
  const ref = useRef(null);
  const raf = useRef(0);

  function move(e) {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      el.style.setProperty("--rx", `${(-py * 16).toFixed(2)}deg`);
      el.style.setProperty("--ry", `${(px * 22).toFixed(2)}deg`);
      el.style.setProperty("--gx", `${((px + 0.5) * 100).toFixed(0)}%`);
      el.style.setProperty("--gy", `${((py + 0.5) * 100).toFixed(0)}%`);
      el.style.setProperty("--px", px.toFixed(3));
      el.style.setProperty("--py", py.toFixed(3));
    });
  }
  function leave() {
    const el = ref.current;
    if (!el) return;
    cancelAnimationFrame(raf.current);
    ["--rx", "--ry", "--px", "--py"].forEach((k) => el.style.setProperty(k, "0"));
    el.style.setProperty("--rx", "0deg");
    el.style.setProperty("--ry", "0deg");
  }

  return (
    <div className="ly-stage" onPointerMove={move} onPointerLeave={leave}>
      <div className="ly-tilt" ref={ref}>
        <span className="ly-sticker ly-sticker-a" aria-hidden="true">🙌</span>
        <span className="ly-sticker ly-sticker-b" aria-hidden="true">💬</span>
        <span className="ly-sticker ly-sticker-c" aria-hidden="true">📞</span>
        <PhoneDemo />
      </div>
    </div>
  );
}

export default function Landing() {
  const [accent, setAccent] = useState(ACCENTS[0]);

  return (
    <div className={`ly ${body.className}`} style={{ "--ly-accent": accent.color }}>
      <style>{CSS}</style>

      <header className="ly-nav">
        <Link href="/" className={`ly-logo ${display.className}`}>
          <span className="ly-logo-mark"><MessageCircle size={20} /></span>
          Let&apos;s Yap
        </Link>
        <nav className="flex items-center gap-2">
          <Link href="/login" className="ly-link ly-link-nav">Sign in</Link>
        </nav>
      </header>

      <main>
        <section className="ly-hero">
          <div className="ly-hero-copy">
            <h1 className={display.className}>
              Yap with your people, skip the scrolling.
            </h1>
            <p className="ly-lede">
              Let&apos;s Yap is a chat app for instant messages, voice and video calls, and an AI that
              catches you up when the group chat has run ahead.
            </p>
            <div className="ly-cta">
              <Link href="/register" className="ly-btn">Create an account</Link>
            </div>
            <p className="ly-small">Go ahead, type something to Maya in the chat.</p>
          </div>

          <div className="ly-hero-demo">
            <Stage />
          </div>
        </section>

        <section className="ly-features">
          <div className="ly-features-head">
            <h2 className={display.className}>Everything a chat needs. Nothing it doesn&apos;t.</h2>
          </div>
          <ul className="ly-list">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <li key={title}>
                <span className="ly-icon"><Icon size={20} /></span>
                <div>
                  <h3 className={display.className}>{title}</h3>
                  <p>{text}</p>
                </div>
              </li>
            ))}
            <li>
              <span className="ly-icon"><Palette size={20} /></span>
              <div>
                <h3 className={display.className}>Your colours</h3>
                <p>Pick an accent, and use light or dark mode. Try one here.</p>
                <div className="ly-swatches" role="radiogroup" aria-label="Accent colour">
                  {ACCENTS.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      role="radio"
                      aria-checked={accent.id === a.id}
                      aria-label={a.label}
                      className={`ly-swatch ${accent.id === a.id ? "ly-swatch-on" : ""}`}
                      style={{ background: a.color }}
                      onClick={() => setAccent(a)}
                    />
                  ))}
                </div>
              </div>
            </li>
          </ul>
        </section>

        <section className="ly-final">
          <h2 className={display.className}>Your people are already typing.</h2>
          <div className="ly-cta ly-cta-center">
            <Link href="/register" className="ly-btn ly-btn-sun">Start yapping</Link>
          </div>
        </section>
      </main>

      <footer className="ly-footer">
        <span>Let&apos;s Yap</span>
        <span>Real-time chat, calls and an AI that catches you up.</span>
      </footer>
    </div>
  );
}

const CSS = `
.ly{--ink:#0f2a24;--paper:#e9f5ee;--white:#fbfefc;--sun:#ffc83d;
  --tint:color-mix(in srgb,var(--ly-accent) 16%,white);
  background:var(--paper);color:var(--ink);min-height:100vh;line-height:1.55;overflow-x:hidden;
  transition:--ly-accent .3s}
.ly *{box-sizing:border-box}
.ly a{color:inherit;text-decoration:none}
.ly :focus-visible{outline:3px solid var(--ink);outline-offset:3px;border-radius:8px}

.ly-nav{display:flex;align-items:center;justify-content:space-between;max-width:1200px;margin:0 auto;padding:20px 24px}
.ly-logo{display:flex;align-items:center;gap:10px;font-weight:800;font-size:22px;letter-spacing:-.02em}
.ly-logo-mark{display:grid;place-items:center;width:36px;height:36px;border-radius:12px;background:var(--ly-accent);color:var(--ink);transition:background .3s}
.ly-link-nav{box-shadow:inset 0 0 0 2px var(--ink)}
.ly-link{padding:10px 18px;font-weight:600;border-radius:999px}
.ly-link:hover{background:rgba(15,42,36,.08)}

.ly-btn{display:inline-flex;align-items:center;justify-content:center;padding:15px 26px;border-radius:999px;background:var(--ink);color:#fff!important;
  font-weight:700;font-size:17px;box-shadow:4px 4px 0 var(--ly-accent);transition:transform .15s,box-shadow .15s,background .3s}
.ly-btn:hover{transform:translate(-2px,-2px);box-shadow:6px 6px 0 var(--ly-accent)}
.ly-btn:active{transform:translate(2px,2px);box-shadow:1px 1px 0 var(--ly-accent)}
.ly-btn-sun{background:var(--sun);color:var(--ink)!important;box-shadow:4px 4px 0 #fff}
.ly-btn-sun:hover{box-shadow:6px 6px 0 #fff}

.ly-hero{display:grid;grid-template-columns:1.1fr .9fr;gap:48px;align-items:center;max-width:1200px;margin:0 auto;padding:40px 24px 96px}
.ly-hero h1{font-size:clamp(44px,7vw,92px);line-height:.98;letter-spacing:-.045em;font-weight:800;margin:0;max-width:11ch}
.ly-lede{font-size:clamp(18px,2vw,21px);max-width:46ch;margin:28px 0 0}
.ly-cta{display:flex;flex-wrap:wrap;gap:14px;align-items:center;margin-top:32px}
.ly-cta-center{justify-content:center}
.ly-small{margin-top:18px;font-size:14px;opacity:.7}

.ly-hero-demo{position:relative;display:flex;justify-content:center;padding:16px}
.ly-stage{perspective:1100px;padding:40px 24px;touch-action:pan-y}
.ly-tilt{position:relative;transform-style:preserve-3d;transform:rotateX(var(--rx,0deg)) rotateY(var(--ry,0deg)) rotateZ(2deg);transition:transform .25s ease-out;will-change:transform}
.ly-device{position:relative;width:100%;max-width:340px;transform-style:preserve-3d;animation:ly-float 6s ease-in-out infinite}
.ly-stage:hover .ly-device{animation-play-state:paused}
@keyframes ly-float{0%,100%{translate:0 0}50%{translate:0 -10px}}
.ly-slab{position:absolute;inset:0;border-radius:32px;background:var(--ink);transform:translateZ(-26px) translate(12px,12px)}
.ly-glare{position:absolute;inset:0;pointer-events:none;background:radial-gradient(circle at var(--gx,30%) var(--gy,20%),rgba(255,255,255,.35),transparent 55%);mix-blend-mode:soft-light}
.ly-sticker{position:absolute;animation:ly-bob 4s ease-in-out infinite;display:grid;place-items:center;width:64px;height:64px;font-size:32px;border-radius:50%;background:var(--sun);
  box-shadow:3px 3px 0 var(--ink);z-index:2}
.ly-sticker-a{top:-24px;right:-14px;transform:translateZ(90px) translate(calc(var(--px,0)*-30px),calc(var(--py,0)*-30px)) rotate(12deg)}
.ly-sticker-b{bottom:60px;left:-34px;background:#fff;transform:translateZ(60px) translate(calc(var(--px,0)*-18px),calc(var(--py,0)*-18px)) rotate(-10deg);animation-delay:-1.3s}
.ly-sticker-c{top:46%;right:-30px;width:52px;height:52px;font-size:26px;background:var(--tint);transform:translateZ(120px) translate(calc(var(--px,0)*-44px),calc(var(--py,0)*-44px)) rotate(8deg);animation-delay:-2.4s}
@keyframes ly-bob{0%,100%{translate:0 0}50%{translate:0 -8px}}

.ly-phone{position:relative;width:100%;height:560px;display:flex;flex-direction:column;background:#e3f1ea;border:3px solid var(--ink);
  border-radius:32px;overflow:hidden}
.ly-phone-head{display:flex;align-items:center;gap:10px;padding:14px 16px;background:var(--white);border-bottom:2px solid var(--ink)}
.ly-avatar{display:grid;place-items:center;width:38px;height:38px;border-radius:50%;background:var(--sun);font-weight:800}
.ly-catch{display:flex;align-items:center;gap:8px;width:100%;padding:9px 16px;background:var(--tint);border:0;border-bottom:1px solid rgba(15,42,36,.12);
  font:inherit;font-size:14px;font-weight:700;color:var(--ink);cursor:pointer;text-align:left}
.ly-catch:hover{background:color-mix(in srgb,var(--ly-accent) 26%,white)}
.ly-catch-hint{margin-left:auto;padding:2px 10px;border-radius:999px;background:var(--ink);color:#fff;font-size:12px;font-weight:600;opacity:0;transition:opacity .3s}
.ly-catch-ready .ly-catch-hint{opacity:1;animation:ly-nudge 1.6s ease-in-out 3}
@keyframes ly-nudge{0%,100%{transform:scale(1)}50%{transform:scale(1.12)}}
.ly-summary{margin:10px 12px 0;padding:12px 14px;background:var(--white);border:2px solid var(--ink);border-radius:14px;font-size:14px;animation:ly-pop .25s ease-out}
.ly-summary-note{margin-top:8px;padding-left:10px;border-left:4px solid var(--ly-accent);font-size:13px}

.ly-thread{flex:1;min-height:0;overflow-y:auto;scrollbar-width:none;display:flex;flex-direction:column;gap:10px;padding:16px 12px}
.ly-row{display:flex}
.ly-row-me{justify-content:flex-end}
.ly-bubble{position:relative;max-width:82%;padding:8px 12px 6px;border-radius:16px;font-size:15px;line-height:1.35;animation:ly-pop .25s ease-out}
.ly-bubble-them{background:#fff;border-top-left-radius:4px}
.ly-bubble-me{background:color-mix(in srgb,var(--ly-accent) 30%,white);border-top-right-radius:4px;transition:background .3s}
.ly-meta{display:flex;justify-content:flex-end;align-items:center;gap:3px;margin-top:2px;font-size:11px;opacity:.6}
.ly-tick{color:#1d8fd1}
.ly-reaction{position:absolute;left:-6px;bottom:-14px;padding:1px 6px;font-size:14px;background:#fff;border-radius:999px;box-shadow:0 1px 3px rgba(0,0,0,.25);animation:ly-pop .3s ease-out}
.ly-typing{display:flex;gap:4px;padding:12px 14px}
.ly-typing i{width:7px;height:7px;border-radius:50%;background:var(--ink);opacity:.4;animation:ly-dot 1s infinite}
.ly-typing i:nth-child(2){animation-delay:.15s}.ly-typing i:nth-child(3){animation-delay:.3s}
@keyframes ly-dot{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}
@keyframes ly-pop{from{opacity:0;transform:translateY(8px) scale(.96)}to{opacity:1;transform:none}}

.ly-compose{display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--white);border-top:2px solid var(--ink)}
.ly-input{flex:1;min-width:0;padding:9px 14px;border:0;border-radius:999px;background:var(--paper);font:inherit;font-size:14px;color:var(--ink)}
.ly-input:disabled{opacity:.6}
.ly-send:disabled{opacity:.45;cursor:default}
.ly-send{border:0;cursor:pointer;display:grid;place-items:center;width:34px;height:34px;border-radius:50%;background:var(--ly-accent);color:var(--ink);transition:background .3s}

.ly-features{display:grid;grid-template-columns:.8fr 1.2fr;gap:56px;max-width:1200px;margin:0 auto;padding:96px 24px}
.ly-features-head h2{position:sticky;top:32px;font-size:clamp(34px,4.6vw,60px);line-height:1.02;letter-spacing:-.04em;font-weight:800;margin:0;max-width:12ch}
.ly-list{list-style:none;margin:0;padding:0}
.ly-list li{display:flex;gap:18px;padding:26px 0;border-top:2px solid var(--ink)}
.ly-list li:last-child{border-bottom:2px solid var(--ink)}
.ly-icon{flex:none;display:grid;place-items:center;width:44px;height:44px;border-radius:14px;background:var(--ly-accent);color:var(--ink);transition:background .3s}
.ly-list h3{margin:0 0 4px;font-size:24px;font-weight:700;letter-spacing:-.02em}
.ly-list p{margin:0;max-width:52ch}
.ly-swatches{display:flex;gap:10px;margin-top:14px}
.ly-swatch{width:34px;height:34px;border-radius:50%;border:3px solid var(--paper);box-shadow:0 0 0 2px var(--ink);cursor:pointer;transition:transform .15s}
.ly-swatch:hover{transform:scale(1.1)}
.ly-swatch-on{box-shadow:0 0 0 2px var(--ink),0 0 0 6px var(--paper),0 0 0 8px var(--ink)}

.ly-final{padding:88px 24px;text-align:center;background:var(--ink);color:#fff;border-radius:40px 40px 0 0}
.ly-final h2{margin:0 auto;font-size:clamp(36px,6vw,76px);line-height:1;letter-spacing:-.04em;font-weight:800;max-width:14ch}
.ly-footer{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;padding:24px;background:var(--ink);color:#fff;font-size:14px}

@media (max-width:900px){
  .ly-hero{grid-template-columns:1fr;padding-bottom:64px}
  .ly-hero h1{max-width:none}
  .ly-features{grid-template-columns:1fr;gap:24px;padding:64px 24px}
  .ly-features-head h2{position:static}
}
@media (prefers-reduced-motion:reduce){
  .ly *{animation:none!important;transition:none!important}
  .ly-tilt{transform:rotateZ(2deg)!important}
}
`;
