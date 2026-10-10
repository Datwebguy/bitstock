/** The Bitstock mark: a shield whose check stroke rises into a chart line — checked before you buy. */
export function LogoMark({ size = 32, title }: { size?: number; title?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" role={title ? "img" : "presentation"} aria-label={title} aria-hidden={title ? undefined : true} className="logo-mark">
      <path d="M16 2.5 27 6.6V15c0 6.9-4.7 12.2-11 14.5C9.7 27.2 5 21.9 5 15V6.6Z" className="logo-shield" />
      <path d="M10.4 16.6 14 20.2 18.2 14.4 21.8 10.8" className="logo-stroke" />
      <circle cx="21.8" cy="10.8" r="1.75" className="logo-dot" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="wordmark">
      <LogoMark size={30} />
      <span className="wordmark-text">
        Bit<b>stock</b>
      </span>
    </span>
  );
}
