/**
 * The Bitstock mark: three rising candles, with a check sweeping across them — checked, then up.
 * A cut-out stroke in the tile colour separates the check from the candles.
 */
export function LogoMark({ size = 32, title }: { size?: number; title?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" role={title ? "img" : "presentation"} aria-label={title} aria-hidden={title ? undefined : true} className="logo-mark">
      <defs>
        <linearGradient id="bs-tile" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FFE27A" />
          <stop offset="0.55" stopColor="#F0B90B" />
          <stop offset="1" stopColor="#D98E04" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="30" height="30" rx="9" fill="url(#bs-tile)" />
      <rect x="7" y="18.5" width="4.2" height="7" rx="1.6" className="logo-candle" />
      <rect x="13.9" y="14.5" width="4.2" height="11" rx="1.6" className="logo-candle" />
      <rect x="20.8" y="10.5" width="4.2" height="15" rx="1.6" className="logo-candle" />
      <path d="M6.2 13.4 10.6 17.6 25.2 5.8" className="logo-cut" />
      <path d="M6.2 13.4 10.6 17.6 25.2 5.8" className="logo-check" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="wordmark">
      <LogoMark size={30} />
      <span className="wordmark-text">
        bit<b>stock</b>
      </span>
    </span>
  );
}
