export interface HdxMarkProps {
  size?: number;
  /** Thin outline so the navy tile reads on navy surfaces. */
  framed?: boolean;
  /** Accessible name; omit when the mark sits next to the "HDX" text. */
  title?: string;
  className?: string;
}

/** The HDX logo tile: a mustard sausage in a white bun on navy. */
export function HdxMark({ size = 32, framed, title, className }: HdxMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={className}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {framed ? (
        <rect x="0.5" y="0.5" width="31" height="31" rx="6" fill="#0B1F3A" stroke="#3A5175" strokeWidth="1" />
      ) : (
        <rect x="0" y="0" width="32" height="32" rx="6" fill="#0B1F3A" />
      )}
      <rect x="4" y="10" width="24" height="8" rx="4" fill="#F2B705" />
      <path d="M6 16H26V18.5C26 21.5 23.5 24 20.5 24H11.5C8.5 24 6 21.5 6 18.5Z" fill="#FFFFFF" />
    </svg>
  );
}
