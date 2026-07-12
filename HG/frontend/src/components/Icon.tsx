/** Inline stroke icon set ported from the housieGhar prototype. */

const ICON_PATHS: Record<string, string> = {
  grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  trophy: "M6 4h12v3a6 6 0 0 1-12 0zM6 6H3v1a3 3 0 0 0 3 3M18 6h3v1a3 3 0 0 1-3 3M9 16h6M8 20h8M12 16v4",
  help: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.2 9a2.8 2.8 0 0 1 5.5.8c0 1.9-2.7 2.2-2.7 4M12 17.5h.01",
  lock: "M6 10V8a6 6 0 1 1 12 0v2M5 10h14v10H5zM12 14v3",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0",
  x: "M6 6l12 12M18 6 6 18",
  check: "M4 12.5 9.5 18 20 6.5",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3.5 2",
  chevR: "M9 6l6 6-6 6",
  arrowL: "M19 12H5M11 6l-6 6 6 6",
  chat: "M21 11.5a8.4 8.4 0 0 1-12 7.6L3 21l1.9-5.6A8.5 8.5 0 1 1 21 11.5z",
  volume: "M11 5 6 9H3v6h3l5 4zM15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13",
  volumeX: "M11 5 6 9H3v6h3l5 4zM22 9l-6 6M16 9l6 6",
  shield: "M12 3l8 3v6c0 4.5-3.2 7.7-8 9-4.8-1.3-8-4.5-8-9V6z",
  shieldCheck: "M12 3l8 3v6c0 4.5-3.2 7.7-8 9-4.8-1.3-8-4.5-8-9V6zM8.5 12l2.5 2.5 4.5-4.5",
  flame: "M12 3c1 3-2 4-2 7a4 4 0 0 0 8 0c0-1-.4-2-1-2.8.2 2-1.5 3-1.5 3 .8-3.5-2-5.2-3.5-7.2zM12 3c-3 2-6 5-6 9a6 6 0 0 0 12 0",
  zap: "M13 3 4 14h7l-1 7 9-11h-7z",
  menu: "M4 7h16M4 12h16M4 17h16",
  ticket: "M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2 2 2 0 0 0 0 4 2 2 0 0 1-2 2H5a2 2 0 0 1-2-2 2 2 0 0 0 0-4zM12 6v12",
  wallet: "M3 7h15a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 7l2-3h11l1 3M17 12.5h.01",
  trash: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5M14 11v5",
  users: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21a7 7 0 0 1 14 0M17 3.5a4 4 0 0 1 0 7.7M22 21a6.5 6.5 0 0 0-4-6",
  chart: "M4 4v16h16M8 16v-5M12 16V8M16 16v-8",
  play: "M7 4l13 8-13 8z",
  pause: "M8 5h3v14H8zM13 5h3v14h-3z",
  bell: "M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6M10 20a2 2 0 0 0 4 0",
  sun: "M12 5V3M12 21v-2M5 12H3M21 12h-2M7.05 7.05 5.64 5.64M18.36 18.36l-1.41-1.41M7.05 16.95l-1.41 1.41M18.36 5.64l-1.41 1.41M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8",
  moon: "M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z",
};

export type IconName = keyof typeof ICON_PATHS;

interface IconProps {
  name: string;
  size?: number;
  stroke?: string;
  fill?: string;
  strokeWidth?: number;
  style?: React.CSSProperties;
  className?: string;
}

export function Icon({ name, size = 20, stroke, fill = "none", strokeWidth = 1.8, style, className }: IconProps) {
  const d = ICON_PATHS[name] || ICON_PATHS.help;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill}
      stroke={stroke || "currentColor"}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
    >
      {d.split("M").filter(Boolean).map((seg, i) => (
        <path key={i} d={"M" + seg} />
      ))}
    </svg>
  );
}
