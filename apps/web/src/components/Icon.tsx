// Minimal, hand-authored outline icon set — no icon-font or library
// dependency, consistent 1.75px stroke weight, 24x24 viewBox, inherits
// color via `currentColor` so it follows surrounding text/theme color.
import type { SVGProps } from "react";

interface IconProps extends SVGProps<SVGSVGElement> {
  size?: number;
}

function base(props: IconProps) {
  const { size = 20, ...rest } = props;
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    ...rest,
  };
}

export function CameraIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 8.5a1.5 1.5 0 0 1 1.5-1.5h2l1.2-1.8A1 1 0 0 1 9.5 4.7h5a1 1 0 0 1 .83.46L16.5 7h2A1.5 1.5 0 0 1 20 8.5v9A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5z" />
      <circle cx="12" cy="13" r="3.2" />
    </svg>
  );
}

export function EyeIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="2.8" />
    </svg>
  );
}

export function FilmIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="3" y="4.5" width="18" height="15" rx="1.5" />
      <path d="M7.5 4.5v15M16.5 4.5v15M3 9h4.5M16.5 9H21M3 15h4.5M16.5 15H21" />
    </svg>
  );
}

export function GearIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 13.5a7.97 7.97 0 0 0 0-3l1.9-1.3-1.6-2.8-2.2.7a8 8 0 0 0-2.6-1.5L14.5 3h-5l-.4 2.6a8 8 0 0 0-2.6 1.5l-2.2-.7-1.6 2.8L4.6 10.5a7.97 7.97 0 0 0 0 3L2.7 14.8l1.6 2.8 2.2-.7c.76.66 1.64 1.17 2.6 1.5l.4 2.6h5l.4-2.6a8 8 0 0 0 2.6-1.5l2.2.7 1.6-2.8z" />
    </svg>
  );
}

export function GlobeIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.6 3.8 5.7 3.8 9S14.5 18.4 12 21c-2.5-2.6-3.8-5.7-3.8-9S9.5 5.6 12 3Z" />
    </svg>
  );
}

export function ServerIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="3.5" y="4" width="17" height="6.5" rx="1.3" />
      <rect x="3.5" y="13.5" width="17" height="6.5" rx="1.3" />
      <path d="M7 7.25h.01M7 16.75h.01" />
    </svg>
  );
}

export function ActivityIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M3 12h3.5l2-6.5 3 13 2-9.5 1.5 3h6" />
    </svg>
  );
}

export function HardDriveIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M5.5 4.5h13l2.5 8.5H3Z" />
      <rect x="3" y="13" width="18" height="6.5" rx="1.3" />
      <path d="M7 16.25h.01M11 16.25h.01" />
    </svg>
  );
}

export function ArrowLeftIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M19 12H5M11 18l-6-6 6-6" />
    </svg>
  );
}

export function PlayIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M7 4.5v15l13-7.5Z" strokeLinejoin="round" />
    </svg>
  );
}

export function DownloadIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 3.5v12M7 11l5 5 5-5M4.5 19.5h15" />
    </svg>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4.5 7h15M9 7V4.8c0-.44.36-.8.8-.8h4.4c.44 0 .8.36.8.8V7M18 7l-.75 12.1a1.6 1.6 0 0 1-1.6 1.5H8.35a1.6 1.6 0 0 1-1.6-1.5L6 7" />
    </svg>
  );
}

export function ShieldCheckIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 3.3 19 6v6c0 4.6-3 8-7 9-4-1-7-4.4-7-9V6Z" />
      <path d="m9 12 2 2 4-4.2" />
    </svg>
  );
}

export function DotIcon(props: IconProps) {
  const { size = 10, ...rest } = props;
  return (
    <svg width={size} height={size} viewBox="0 0 10 10" fill="currentColor" aria-hidden {...rest}>
      <circle cx="5" cy="5" r="5" />
    </svg>
  );
}

export function CheckCircleIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.3 12.3 2.4 2.4 5-5.2" />
    </svg>
  );
}

export function AlertTriangleIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 4 2.5 20.5h19L12 4Z" strokeLinejoin="round" />
      <path d="M12 10v4.2M12 17.3h.01" />
    </svg>
  );
}

export function ClipboardIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="6" y="4.5" width="12" height="16" rx="1.5" />
      <path d="M9 4.5V3.8c0-.7.56-1.3 1.25-1.3h3.5c.7 0 1.25.56 1.25 1.3v.7M9 10.5h6M9 14h6M9 17.5h3.5" />
    </svg>
  );
}

export function QrIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1" />
      <rect x="14" y="3.5" width="6.5" height="6.5" rx="1" />
      <rect x="3.5" y="14" width="6.5" height="6.5" rx="1" />
      <path d="M14 14h2.5v2.5H14zM17.5 17.5h3v3h-3zM14 20.5h2.5M20.5 14v2.5" />
    </svg>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function XIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

export function ChevronLeftIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="m15 6-6 6 6 6" />
    </svg>
  );
}

export function SunIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" />
    </svg>
  );
}

export function MoonIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />
    </svg>
  );
}

export function ExpandIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7" />
    </svg>
  );
}

export function ShrinkIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M20 10h-6V4M4 14h6v6M14 10l7-7M10 14l-7 7" />
    </svg>
  );
}

export function UsersIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="9" cy="8.5" r="3.2" />
      <path d="M2.8 19c.5-3.2 3-5 6.2-5s5.7 1.8 6.2 5M16 5.6a3.2 3.2 0 0 1 0 5.8M18 14.3c1.8.5 3 2 3.3 4.7" />
    </svg>
  );
}

export function WifiOffIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M3 3l18 18M8.5 16.4a5 5 0 0 1 7 0M5 12.9a10 10 0 0 1 3-2M10.7 6.1A15 15 0 0 1 21 9M2 9.1a15 15 0 0 1 3-2M12 20h.01" />
    </svg>
  );
}

export function LockIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="5" y="10.5" width="14" height="9.5" rx="2" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
    </svg>
  );
}

export function RecordIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3.4" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function SlidersIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
      <circle cx="15" cy="7" r="2" />
      <circle cx="9" cy="17" r="2" />
    </svg>
  );
}

export function PaletteIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.2 0 1.8-.8 1.8-1.7 0-1.4-1.3-1.6-1.3-2.8 0-.9.7-1.5 1.6-1.5h2.2a3.7 3.7 0 0 0 3.7-3.7c0-4-3.8-7.3-8-7.3Z" />
      <path d="M7.8 11.2h.01M10.6 7.8h.01M15 8.4h.01" />
    </svg>
  );
}

export function CopyIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="8.5" y="8.5" width="11" height="11" rx="2" />
      <path d="M15.5 8.5V6.5a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2" />
    </svg>
  );
}
