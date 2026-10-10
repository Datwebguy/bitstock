"use client";
/**
 * Motion primitives. One shared scroll loop writes CSS variables on <html>; CSS does the rest.
 * Everything here stops under prefers-reduced-motion. Styles are set through the CSSOM, which the
 * Content-Security-Policy allows, never through inline style attributes.
 */
import { useEffect, useRef, useState } from "react";
import { LogoMark } from "./Logo";

const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Mount once: writes --sy (scroll px), --sp (page progress 0..1) and --sv (smoothed velocity). */
export function ScrollDriver() {
  useEffect(() => {
    const root = document.documentElement;
    if (reduced()) {
      root.style.setProperty("--sy", "0");
      root.style.setProperty("--sp", "0");
      return;
    }
    let last = window.scrollY;
    let vel = 0;
    let raf = 0;
    const tick = () => {
      const y = window.scrollY;
      const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      vel = vel * 0.86 + (y - last) * 0.14;
      last = y;
      root.style.setProperty("--sy", String(y));
      root.style.setProperty("--sp", (y / max).toFixed(4));
      root.style.setProperty("--sv", vel.toFixed(2));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <div className="scroll-progress" aria-hidden="true" />;
}

/** The site-wide flowing background: drifting light, streaming gold contour lines, floating particles. */
export function FlowBackground() {
  const lines = [
    "M-200 620 C 120 520, 360 760, 680 640 S 1180 470, 1640 600",
    "M-200 660 C 160 560, 400 800, 720 680 S 1220 510, 1640 640",
    "M-200 700 C 200 600, 440 840, 760 720 S 1260 550, 1640 680",
    "M-200 300 C 180 180, 460 400, 760 300 S 1240 140, 1640 260",
    "M-200 340 C 220 220, 500 440, 800 340 S 1280 180, 1640 300",
    "M-200 380 C 260 260, 540 480, 840 380 S 1320 220, 1640 340",
    "M-200 820 C 240 760, 520 900, 860 820 S 1300 720, 1640 800",
  ];
  return (
    <div className="flowbg" aria-hidden="true">
      <div className="glow g1" />
      <div className="glow g2" />
      <div className="glow g3" />
      <svg className="silk" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="silk-g" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="#f0b90b" stopOpacity="0" />
            <stop offset="0.35" stopColor="#ffd84d" stopOpacity="0.9" />
            <stop offset="0.7" stopColor="#f0b90b" stopOpacity="0.6" />
            <stop offset="1" stopColor="#ff8a00" stopOpacity="0" />
          </linearGradient>
        </defs>
        <g className="silk-a">{lines.slice(0, 3).map((d, i) => <path key={i} d={d} className={`silk-line l${i + 1}`} />)}</g>
        <g className="silk-b">{lines.slice(3, 6).map((d, i) => <path key={i} d={d} className={`silk-line l${i + 4}`} />)}</g>
        <g className="silk-c"><path d={lines[6]} className="silk-line l7" /></g>
      </svg>
      <div className="motes">{Array.from({ length: 14 }).map((_, i) => <i key={i} className={`m${i + 1}`} />)}</div>
      <div className="grain" />
    </div>
  );
}

/** Words rise in one after another when the element scrolls into view. */
export function SplitReveal({ text, as: Tag = "h2", className = "" }: { text: string; as?: "h1" | "h2" | "p"; className?: string }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduced() || !("IntersectionObserver" in window)) return void el.classList.add("in");
    el.classList.add("pre");
    const io = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && (e.target.classList.add("in"), io.unobserve(e.target))), { threshold: 0.2 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const words = text.split(" ");
  return (
    <Tag ref={ref} className={`split ${className}`} aria-label={text}>
      {words.map((w, i) => (
        <span key={i} className="w" aria-hidden="true">
          <span className={`wi d${Math.min(i + 1, 16)}`}>{w}</span>{" "}
        </span>
      ))}
    </Tag>
  );
}

/** A statement whose words light up in gold as you scroll through it. */
export function ScrollLit({ text }: { text: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const words = Array.from(el.querySelectorAll<HTMLElement>(".lw"));
    if (reduced()) return void words.forEach((w) => w.classList.add("lit"));
    let raf = 0;
    const tick = () => {
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const p = Math.min(1, Math.max(0, (vh * 0.85 - r.top) / (r.height + vh * 0.45)));
      const n = Math.round(p * words.length);
      words.forEach((w, i) => w.classList.toggle("lit", i < n));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <p ref={ref} className="scroll-lit" aria-label={text}>
      {text.split(" ").map((w, i) => (
        <span key={i} className="lw" aria-hidden="true">{w} </span>
      ))}
    </p>
  );
}

/** A large outlined band that slides with scroll speed and direction. */
export function VelocityBand({ words }: { words: string[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || reduced()) return;
    let x = 0;
    let raf = 0;
    const tick = () => {
      const v = Number(getComputedStyle(document.documentElement).getPropertyValue("--sv")) || 0;
      x -= 0.35 + Math.abs(v) * 0.6 * (v >= 0 ? 1 : -1);
      const w = el.scrollWidth / 2;
      if (x < -w) x += w;
      if (x > 0) x -= w;
      el.style.transform = `translate3d(${x}px,0,0)`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  const strip = words.map((w, i) => (
    <span key={i} className={i % 2 ? "vb-solid" : "vb-outline"}>{w}<LogoMark size={44} /></span>
  ));
  return (
    <div className="vband" aria-hidden="true">
      <div ref={ref} className="vband-track">{strip}{strip}</div>
    </div>
  );
}

/** Types and erases each phrase in turn. Screen readers get the static label instead. */
export function TypeCycle({ phrases, label }: { phrases: string[]; label: string }) {
  const [text, setText] = useState(phrases[0] ?? "");
  useEffect(() => {
    if (reduced()) return;
    let i = 0;
    let n = 0;
    let dir = 1;
    let hold = 0;
    const t = setInterval(() => {
      const p = phrases[i] ?? "";
      if (hold > 0) return void hold--;
      n += dir;
      if (n >= p.length) {
        dir = -1;
        hold = 22;
      } else if (n <= 0) {
        dir = 1;
        i = (i + 1) % phrases.length;
      }
      setText((phrases[i] ?? "").slice(0, Math.max(0, n)));
    }, 55);
    return () => clearInterval(t);
  }, [phrases]);
  return (
    <p className="typer">
      <span className="sr-only">{label}</span>
      <span aria-hidden="true">{text}</span>
      <span className="caret" aria-hidden="true" />
    </p>
  );
}

/** A turning gold coin carrying the Bitstock mark. */
export function Coin({ size = "lg" }: { size?: "lg" | "sm" }) {
  return (
    <div className={`coin coin-${size}`} aria-hidden="true">
      <div className="coin-body">
        <div className="coin-face front"><LogoMark size={size === "lg" ? 74 : 40} /></div>
        <div className="coin-face back"><LogoMark size={size === "lg" ? 74 : 40} /></div>
      </div>
      <div className="coin-shadow" />
    </div>
  );
}
