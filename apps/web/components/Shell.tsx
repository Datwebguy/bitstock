"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { short, useWallet } from "@/lib/wallet";
import { LanguagePicker } from "./Language";
import { Wordmark } from "./Logo";
import { FlowBackground, ScrollDriver } from "./Motion";
import { RegionGate } from "./RegionGate";

const NAV = [
  { href: "/check", label: "Check", icon: "M12 3 20 6.5V12c0 4.6-3.3 8.1-8 9.5C7.3 20.1 4 16.6 4 12V6.5Z M8.5 12.3l2.4 2.4 4.6-5" },
  { href: "/buy", label: "Buy", icon: "M12 4v16 M4 12h16" },
  { href: "/claim", label: "Gift", icon: "M4 9h16v4H4z M6 13h12v7H6z M12 9v11 M12 9c-2-4-5-3.5-5-1.5S10 9 12 9z M12 9c2-4 5-3.5 5-1.5S14 9 12 9z" },
  { href: "/autopilot", label: "Autopilot", icon: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 7v5l3.5 2" },
  { href: "/holdings", label: "Holdings", icon: "M4 7h16v12H4z M4 7l2-3h12l2 3 M9 12h6" },
  { href: "/learn", label: "Learn", icon: "M4 5h7a3 3 0 0 1 3 3v12a2 2 0 0 0-2-2H4z M20 5h-5 M20 5v13h-6" },
  { href: "/about", label: "About", icon: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 11v6 M12 7.5v.5" },
];

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {d.split(" M").map((seg, i) => (
        <path key={i} d={i === 0 ? seg : `M${seg}`} />
      ))}
    </svg>
  );
}

function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);
  useEffect(() => {
    try {
      const t = localStorage.getItem("theme");
      if (t === "light" || t === "dark") {
        document.documentElement.dataset.theme = t;
        setTheme(t);
      }
    } catch {
      /* storage unavailable: follow the system */
    }
  }, []);
  const next = () => {
    const current = theme ?? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    const t = current === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = t;
    setTheme(t);
    try {
      localStorage.setItem("theme", t);
    } catch {
      /* ignore */
    }
  };
  return (
    <button type="button" className="icon-btn" onClick={next} aria-label="Switch between light and dark">
      <Icon d="M12 3a9 9 0 1 0 9 9 7 7 0 0 1-9-9z" />
    </button>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const w = useWallet();
  const isOn = (href: string) => path.startsWith(href);
  return (
    <>
      <FlowBackground />
      <ScrollDriver />
      <RegionGate />
      <a className="skip" href="#main">Skip to content</a>
      <header className="topbar">
        <div className="topbar-in">
          <Link href="/" aria-label="Bitstock home" className="wordmark-link">
            <Wordmark />
          </Link>
          <nav className="topnav" aria-label="Main">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} aria-current={isOn(n.href) ? "page" : undefined}>
                {n.label}
              </Link>
            ))}
          </nav>
          <span className="spacer" />
          {w.account ? <button type="button" className="pill good pill-btn" title={w.account} aria-label={`Wallet ${short(w.account)}. Open the wallet menu`} onClick={() => void w.connect()}>{short(w.account)}</button> : null}
          <LanguagePicker />
          <ThemeToggle />
        </div>
      </header>
      <main id="main" className={path === "/" ? "page page-landing" : "page"}>
        {children}
      </main>
      <nav className="tabbar" aria-label="Main">
        {NAV.filter((n) => n.href !== "/about").map((n) => (
          <Link key={n.href} href={n.href} aria-current={isOn(n.href) ? "page" : undefined}>
            <Icon d={n.icon} />
            {n.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
