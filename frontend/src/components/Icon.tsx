/** Inline stroke icon set ported from the housieGhar prototype. */

const ICON_PATHS: Record<string, string> = {
  home: "M3 10.5 12 3l9 7.5M5 9.5V20h14V9.5",
  grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  trophy: "M6 4h12v3a6 6 0 0 1-12 0zM6 6H3v1a3 3 0 0 0 3 3M18 6h3v1a3 3 0 0 1-3 3M9 16h6M8 20h8M12 16v4",
  help: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.2 9a2.8 2.8 0 0 1 5.5.8c0 1.9-2.7 2.2-2.7 4M12 17.5h.01",
  lock: "M6 10V8a6 6 0 1 1 12 0v2M5 10h14v10H5zM12 14v3",
  key: "M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0",
  x: "M6 6l12 12M18 6 6 18",
  check: "M4 12.5 9.5 18 20 6.5",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3.5 2",
  chevR: "M9 6l6 6-6 6",
  chevL: "M15 6l-6 6 6 6",
  arrowL: "M19 12H5M11 6l-6 6 6 6",
  chat: "M21 11.5a8.4 8.4 0 0 1-12 7.6L3 21l1.9-5.6A8.5 8.5 0 1 1 21 11.5z",
  volume: "M11 5 6 9H3v6h3l5 4zM15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13",
  volumeX: "M11 5 6 9H3v6h3l5 4zM22 9l-6 6M16 9l6 6",
  shield: "M12 3l8 3v6c0 4.5-3.2 7.7-8 9-4.8-1.3-8-4.5-8-9V6z",
  shieldCheck: "M12 3l8 3v6c0 4.5-3.2 7.7-8 9-4.8-1.3-8-4.5-8-9V6zM8.5 12l2.5 2.5 4.5-4.5",
  flame: "M12 3c1 3-2 4-2 7a4 4 0 0 0 8 0c0-1-.4-2-1-2.8.2 2-1.5 3-1.5 3 .8-3.5-2-5.2-3.5-7.2zM12 3c-3 2-6 5-6 9a6 6 0 0 0 12 0",
  zap: "M13 3 4 14h7l-1 7 9-11h-7z",
  menu: "M4 7h16M4 12h16M4 17h16",
  star: "M12 3.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8L12 17l-5.3 2.8 1-5.8L3.5 9.7l5.9-.9z",
  spark: "M12 4v4M12 16v4M4 12h4M16 12h4M6.3 6.3l2.8 2.8M14.9 14.9l2.8 2.8M17.7 6.3l-2.8 2.8M9.1 14.9l-2.8 2.8",
  ticket: "M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2 2 2 0 0 0 0 4 2 2 0 0 1-2 2H5a2 2 0 0 1-2-2 2 2 0 0 0 0-4zM12 6v12",
  wallet: "M3 7h15a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 7l2-3h11l1 3M17 12.5h.01",
  users: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21a7 7 0 0 1 14 0M17 3.5a4 4 0 0 1 0 7.7M22 21a6.5 6.5 0 0 0-4-6",
  chart: "M4 4v16h16M8 16v-5M12 16V8M16 16v-8",
  play: "M7 4l13 8-13 8z",
  pause: "M8 5h3v14H8zM13 5h3v14h-3z",
  bell: "M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6M10 20a2 2 0 0 0 4 0",
  settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3 1a7 7 0 0 0-2-1.2l-.3-2.5H10.7l-.3 2.5a7 7 0 0 0-2 1.2l-2.3-1-2 3.4 2 1.5A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 2 1.2l.3 2.5h2.6l.3-2.5a7 7 0 0 0 2-1.2l2.3 1 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z",
  refresh: "M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5",
  edit: "M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7 M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z",
  trash: "M3 6h18 M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6 M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2",
  eye: "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
  search: "M21 21l-6-6m2-5a7 7 0 1 1-14 0 7 7 0 0 1 14 0z",
  download: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3",
  copy: "M20 9H11a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2zM5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1",
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
