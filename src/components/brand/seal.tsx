import { useId } from "react";

export interface SealProps {
  /** Rendered size in px (default 64). */
  size?: number;
  /** Accessible name; omit to keep the seal decorative. */
  title?: string;
  className?: string;
}

/** HDX certification seal: navy ring, mustard centre, "HDX · CERTIFIED · POLICY 3.2". */
export function Seal({ size = 64, title, className }: SealProps) {
  // textPath needs an id; useId keeps several seals on one page apart.
  const ringId = `hdx-seal-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={className}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      <defs>
        <path id={ringId} d="M32 8a24 24 0 1 1 0 48a24 24 0 1 1 0-48" />
      </defs>
      <circle cx="32" cy="32" r="31" fill="#0B1F3A" stroke="#FFFFFF" strokeWidth="1.5" />
      <circle cx="32" cy="32" r="28.5" fill="none" stroke="#F2B705" strokeWidth="1" />
      <text fill="#FFFFFF" style={{ fontFamily: "var(--font-source-sans, Arial), Arial, sans-serif" }} fontSize="6" fontWeight="700" letterSpacing="0.6">
        <textPath href={`#${ringId}`} startOffset="0">
          HDX · CERTIFIED · POLICY 3.2 ·
        </textPath>
      </text>
      <circle cx="32" cy="32" r="19" fill="#F2B705" stroke="#FFFFFF" strokeWidth="1" />
      <text
        x="32"
        y="36.5"
        textAnchor="middle"
        fill="#0B1F3A"
        style={{ fontFamily: "var(--font-source-serif, Georgia), Georgia, serif" }}
        fontSize="13"
        fontWeight="600"
        letterSpacing="0.5"
      >
        HDX
      </text>
    </svg>
  );
}
