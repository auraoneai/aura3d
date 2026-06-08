/* Icon set — stroke icons, Lucide-ish. Ported from design `icons.jsx`. */
import type { CSSProperties } from "react";

const P: Record<string, string> = {
  play: "M6 4l14 8-14 8z",
  pause: "M7 4h4v16H7zM13 4h4v16h-4z",
  prev: "M7 5v14M19 5l-9 7 9 7z",
  next: "M17 5v14M5 5l9 7-9 7z",
  search: "M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.3-4.3",
  chevD: "M6 9l6 6 6-6",
  chevR: "M9 6l6 6-6 6",
  chevL: "M15 6l-6 6 6 6",
  plus: "M12 5v14M5 12h14",
  eye: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z@M12 12m-3 0a3 3 0 106 0 3 3 0 10-6 0",
  eyeOff: "M3 3l18 18@M10.6 10.6a3 3 0 004.2 4.2@M9.4 5.2A10 10 0 0112 5c6.5 0 10 7 10 7a18 18 0 01-3 3.8M6.1 6.1A18 18 0 002 12s3.5 7 10 7a10 10 0 003.9-.8",
  user: "M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0",
  film: "M3 4h18v16H3zM7 4v16M17 4v16M3 9h4M17 9h4M3 15h4M17 15h4",
  globe: "M12 21a9 9 0 100-18 9 9 0 000 18zM3 12h18M12 3a14 14 0 010 18 14 14 0 010-18",
  frame: "M4 7V4h3M20 7V4h-3M4 17v3h3M20 17v3h-3",
  planet: "M12 16a5 5 0 100-10 5 5 0 000 10z@M4.5 14c-1.6.9-2.4 1.9-2 2.7.7 1.4 5 .8 9.6-1.4s7.9-5.2 7.2-6.6c-.4-.8-1.7-1-3.4-.7",
  cube: "M12 2l8 4.5v9L12 20l-8-4.5v-9zM12 2v9M12 11l8-4.5M12 11l-8-4.5",
  spark: "M12 3l1.8 5.4L19 10l-5.2 1.6L12 17l-1.8-5.4L5 10l5.2-1.6z",
  layers: "M12 3l9 5-9 5-9-5zM3 13l9 5 9-5",
  camera: "M3 8h3l1.5-2h9L18 8h3v11H3zM12 16a3 3 0 100-6 3 3 0 000 6z",
  zap: "M13 2L4 14h7l-1 8 9-12h-7z",
  sliders: "M4 7h10M18 7h2M4 17h2M10 17h10@M14 5v4M8 15v4",
  render: "M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8",
  send: "M4 12l16-8-6 16-3-6-7-2z",
  bolt: "M11 2L4 13h6l-1 9 8-12h-6z",
  mic: "M12 3a3 3 0 013 3v6a3 3 0 01-6 0V6a3 3 0 013-3zM5 11a7 7 0 0014 0M12 18v3",
  image: "M3 4h18v16H3zM3 16l5-5 4 4 3-3 6 6M9 9a1.5 1.5 0 100-3 1.5 1.5 0 000 3",
  grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  expand: "M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5",
  settings:
    "M12 15a3 3 0 100-6 3 3 0 000 6z@M19 12a7 7 0 00-.1-1.3l2-1.5-2-3.4-2.3 1a7 7 0 00-2.3-1.3L16 2H8l-.3 2.2a7 7 0 00-2.3 1.3l-2.3-1-2 3.4 2 1.5a7 7 0 000 2.6l-2 1.5 2 3.4 2.3-1a7 7 0 002.3 1.3L8 22h8l.3-2.2a7 7 0 002.3-1.3l2.3 1 2-3.4-2-1.5A7 7 0 0019 12z",
  check: "M5 12l5 5 9-11",
  x: "M6 6l12 12M18 6L6 18",
  play2: "M8 5v14l11-7z",
  download: "M12 3v12M7 11l5 5 5-5M5 21h14",
  share: "M4 12v8h16v-8M12 3v12M8 7l4-4 4 4",
  history: "M12 8v4l3 2M3 12a9 9 0 109-9 9 9 0 00-8.5 6M3 4v3h3",
  folder: "M3 6h6l2 2h10v11H3z",
  sound: "M11 5L6 9H3v6h3l5 4zM16 9a4 4 0 010 6M19 6a8 8 0 010 12",
  wand: "M5 19l9-9M14 6l1.5-1.5M18 10l1.5-.5M15 13l1 1M19 14l.5 1.5@M14 6l4 4",
  move: "M12 3v18M3 12h18M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3",
  sparkles: "M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5zM5 15l.8 2.2L8 18l-2.2.8L5 21l-.8-2.2L2 18l2.2-.8z"
};

export interface IconProps {
  name: string;
  size?: number;
  sw?: number;
  style?: CSSProperties;
  className?: string;
}

export function Icon({ name, size = 16, sw = 1.8, style, className }: IconProps) {
  const d = P[name];
  if (!d) return null;
  const parts = d.split("@");
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      className={className}
    >
      {parts.map((p, i) => (
        <path key={i} d={p} />
      ))}
    </svg>
  );
}

export function Logo({ size = 30 }: { size?: number }) {
  return (
    <div className="logo" style={{ width: size, height: size }}>
      <svg width={size * 0.62} height={size * 0.62} viewBox="0 0 24 24" fill="none">
        <path d="M12 2l9 16H3z" fill="none" stroke="#fff" strokeWidth={2} strokeLinejoin="round" opacity={0.95} />
        <circle cx={12} cy={13} r={3} fill="#fff" />
      </svg>
    </div>
  );
}
