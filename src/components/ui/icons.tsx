// Stroke icons drawn from the design boards. Decorative: always pair them with visible text
// or an aria-label on the control.

import type { ReactNode, SVGProps } from "react";

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, "children"> {
  size?: number;
  strokeWidth?: number;
}

function icon(paths: ReactNode, defaultStroke = 1.75) {
  function Icon({ size = 20, strokeWidth = defaultStroke, ...props }: IconProps) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
        {...props}
      >
        {paths}
      </svg>
    );
  }
  return Icon;
}

export const ArrowRightIcon = icon(
  <>
    <path d="M5 12h14" />
    <path d="M13 6l6 6-6 6" />
  </>,
  2,
);
export const ChevronDownIcon = icon(<path d="M6 9l6 6 6-6" />, 2);
export const ChevronRightIcon = icon(<path d="M9 6l6 6-6 6" />, 2);
export const MenuIcon = icon(
  <>
    <path d="M4 7h16" />
    <path d="M4 12h16" />
    <path d="M4 17h16" />
  </>,
);
export const CloseIcon = icon(
  <>
    <path d="M6 6l12 12" />
    <path d="M18 6L6 18" />
  </>,
  2,
);
export const PlusIcon = icon(
  <>
    <path d="M12 5v14" />
    <path d="M5 12h14" />
  </>,
  2,
);
export const CheckIcon = icon(<path d="M5 12.5l4.5 4.5L19 7.5" />, 2.5);
export const CheckCircleIcon = icon(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M8 12.5l2.8 2.8L16.5 9.5" />
  </>,
  2.5,
);
export const ClockIcon = icon(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </>,
);
export const LockIcon = icon(
  <>
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </>,
);
export const GlobeIcon = icon(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18" />
    <path d="M12 3c2.5 2.5 3.8 5.5 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.5-3.8-9S9.5 5.5 12 3z" />
  </>,
);
export const ShieldIcon = icon(
  <>
    <path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-0.7-8-4.5-8-9V6z" />
    <path d="M9 12l2 2 4-4" />
  </>,
);
export const DownloadIcon = icon(
  <>
    <path d="M12 4v12" />
    <path d="M7 11l5 5 5-5" />
    <path d="M4 20h16" />
  </>,
  2,
);
export const PrinterIcon = icon(
  <>
    <path d="M7 8V4h10v4" />
    <path d="M7 17H5a1 1 0 0 1-1-1v-6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1h-2" />
    <path d="M7 14h10v6H7z" />
  </>,
  2,
);
export const LinkIcon = icon(
  <>
    <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
    <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
  </>,
  2,
);
export const CopyIcon = icon(
  <>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15V5a1 1 0 0 1 1-1h10" />
  </>,
  2,
);
export const UploadIcon = icon(
  <>
    <path d="M12 15V4" />
    <path d="M7 9l5-5 5 5" />
    <path d="M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4" />
  </>,
);
export const CameraIcon = icon(
  <>
    <path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
    <circle cx="12" cy="13.5" r="3.5" />
  </>,
);
export const ScanIcon = icon(
  <>
    <path d="M4 8V5a1 1 0 0 1 1-1h3" />
    <path d="M16 4h3a1 1 0 0 1 1 1v3" />
    <path d="M20 16v3a1 1 0 0 1-1 1h-3" />
    <path d="M8 20H5a1 1 0 0 1-1-1v-3" />
    <path d="M8 12h8" />
  </>,
);
export const HistoryIcon = icon(
  <>
    <path d="M3 12a9 9 0 1 0 3-6.7" />
    <path d="M3 4v4h4" />
    <path d="M12 8v4l3 2" />
  </>,
);
export const CertificateIcon = icon(
  <>
    <circle cx="12" cy="9" r="5" />
    <path d="M9 13.5L8 21l4-2 4 2-1-7.5" />
  </>,
);
export const LayersIcon = icon(
  <>
    <path d="M12 3l9 5-9 5-9-5z" />
    <path d="M3 13l9 5 9-5" />
  </>,
);
export const ListIcon = icon(
  <>
    <path d="M9 6h11" />
    <path d="M9 12h11" />
    <path d="M9 18h11" />
    <path d="M4.5 6h0.01" />
    <path d="M4.5 12h0.01" />
    <path d="M4.5 18h0.01" />
  </>,
);
export const KeyIcon = icon(
  <>
    <circle cx="8" cy="15" r="4" />
    <path d="M10.8 12.2L20 3" />
    <path d="M16 7l3 3" />
  </>,
);
export const SlidersIcon = icon(
  <>
    <path d="M4 6h9" />
    <path d="M17 6h3" />
    <circle cx="15" cy="6" r="2" />
    <path d="M4 12h3" />
    <path d="M11 12h9" />
    <circle cx="9" cy="12" r="2" />
    <path d="M4 18h11" />
    <path d="M19 18h1" />
    <circle cx="17" cy="18" r="2" />
  </>,
);
export const ScaleIcon = icon(
  <>
    <path d="M12 4v16" />
    <path d="M5 7h14" />
    <path d="M5 7l-3 6a3 3 0 0 0 6 0z" />
    <path d="M19 7l-3 6a3 3 0 0 0 6 0z" />
    <path d="M8 20h8" />
  </>,
  2,
);
export const TagIcon = icon(
  <>
    <path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z" />
    <circle cx="7.5" cy="7.5" r="1.5" />
  </>,
  2,
);
export const ExpandIcon = icon(
  <>
    <path d="M4 9V4h5" />
    <path d="M15 4h5v5" />
    <path d="M20 15v5h-5" />
    <path d="M9 20H4v-5" />
  </>,
);
export const LogOutIcon = icon(
  <>
    <path d="M9 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h4" />
    <path d="M15 17l5-5-5-5" />
    <path d="M20 12H9" />
  </>,
);
export const BuildingIcon = icon(
  <>
    <path d="M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16" />
    <path d="M15 9h4a1 1 0 0 1 1 1v11" />
    <path d="M3 21h18" />
    <path d="M8 8h3" />
    <path d="M8 12h3" />
    <path d="M8 16h3" />
  </>,
);
export const TrophyIcon = icon(
  <>
    <path d="M8 4h8v5a4 4 0 0 1-8 0z" />
    <path d="M8 6H5a3 3 0 0 0 3 4" />
    <path d="M16 6h3a3 3 0 0 1-3 4" />
    <path d="M12 13v4" />
    <path d="M8 20h8" />
    <path d="M9.5 17h5v3h-5z" />
  </>,
);
export const AlertIcon = icon(
  <>
    <path d="M12 4l9 16H3z" />
    <path d="M12 10v4" />
    <path d="M12 17.5v0.01" />
  </>,
  2,
);
export const InfoIcon = icon(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5" />
    <path d="M12 7.5v0.01" />
  </>,
  2,
);
export const QrIcon = icon(
  <>
    <path d="M4 8V4h4" />
    <path d="M16 4h4v4" />
    <path d="M20 16v4h-4" />
    <path d="M8 20H4v-4" />
    <rect x="9" y="9" width="6" height="6" />
  </>,
);
export const ExternalIcon = icon(
  <>
    <path d="M14 4h6v6" />
    <path d="M20 4l-9 9" />
    <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
  </>,
  2,
);
export const SearchIcon = icon(
  <>
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-4-4" />
  </>,
  2,
);
