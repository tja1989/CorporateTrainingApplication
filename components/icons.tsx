import type { ComponentProps } from "react";

/**
 * The icon set — one 24-unit line family drawn at a 1.75 stroke, in
 * `currentColor`, so every icon takes the weight and colour of the text it
 * sits beside. This replaced the typed Unicode glyphs, which rendered at
 * a different weight on every platform and arrived as colour emoji on some.
 *
 * Sized by the `size` prop (px) rather than a class: the theme declares no
 * `--spacing-5`, so a classed `size-5` would silently emit nothing.
 */

export type IconName = keyof typeof PATHS;

const PATHS = {
  home: "M3 10.5 12 3l9 7.5M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5",
  book: "M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5zM4 20.5V5.5M8 7h8M8 10.5h5",
  target: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zM12 12h.01",
  sparkle: "M12 3c.6 4.8 3.6 7.8 8.4 8.4-4.8.6-7.8 3.6-8.4 8.4-.6-4.8-3.6-7.8-8.4-8.4C8.4 10.8 11.4 7.8 12 3zM19 2v3M17.5 3.5h3",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20.5a7.5 7.5 0 0 1 15 0",
  grid: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z",
  users: "M9 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18.5 13.5a6.5 6.5 0 0 1 3 5.5",
  "check-square": "M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v11a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5zM8 12.5l2.75 2.75L16.5 9.5",
  "file-text": "M6 3.5h8l5 5V20a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1zM14 3.5v5h5M8.5 12.5h7M8.5 16h5",
  mail: "M3.5 6.5A1.5 1.5 0 0 1 5 5h14a1.5 1.5 0 0 1 1.5 1.5v11A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5zM3.5 7.5 12 13.5l8.5-6",
  chart: "M4 20h16M6 16v-5M11 16V6M16 16v-8",
  shield: "M12 3 4.5 6v5.5c0 4.5 3.2 7.8 7.5 9.5 4.3-1.7 7.5-5 7.5-9.5V6zM9 12l2 2 4-4.5",
  bell: "M6 16.5V11a6 6 0 1 1 12 0v5.5l1.5 1.5H4.5zM10 20a2 2 0 0 0 4 0",
  sun: "M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4",
  moon: "M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z",
  search: "M10.5 18a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15zM20.5 20.5l-4.6-4.6",
  "arrow-right": "M4 12h16M13 5l7 7-7 7",
  "arrow-left": "M20 12H4M11 5l-7 7 7 7",
  "arrow-up": "M12 20V4M5 11l7-7 7 7",
  "arrow-down": "M12 4v16M5 13l7 7 7-7",
  "chevron-down": "m6 9.5 6 6 6-6",
  "chevron-right": "m9.5 6 6 6-6 6",
  mic: "M12 15a3.5 3.5 0 0 0 3.5-3.5v-5a3.5 3.5 0 0 0-7 0v5A3.5 3.5 0 0 0 12 15zM5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3M9 21h6",
  keyboard: "M3 7.5A1.5 1.5 0 0 1 4.5 6h15A1.5 1.5 0 0 1 21 7.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 16.5zM7 10h.01M11 10h.01M15 10h.01M7 14h10",
  phone: "M8 2.5h8A1.5 1.5 0 0 1 17.5 4v16a1.5 1.5 0 0 1-1.5 1.5H8A1.5 1.5 0 0 1 6.5 20V4A1.5 1.5 0 0 1 8 2.5zM11 18h2",
  note: "M6 3.5h12a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1zM8.5 8h7M8.5 12h7M8.5 16h4",
  warning: "M12 3.5 2.5 20h19zM12 9.5v4.5M12 17h.01",
  check: "m5 12.5 4.5 4.5L19 7",
  x: "M6 6l12 12M18 6 6 18",
  "thumbs-up": "M7 10v10H4V10zM7 10l4-7c1.5 0 2.5 1 2.5 2.5V9h5a2 2 0 0 1 2 2.3l-1 6.5A2.5 2.5 0 0 1 17 20H7",
  "thumbs-down": "M7 14V4H4v10zM7 14l4 7c1.5 0 2.5-1 2.5-2.5V15h5a2 2 0 0 0 2-2.3l-1-6.5A2.5 2.5 0 0 0 17 4H7",
  star: "m12 3 2.7 5.8 6.3.7-4.7 4.3 1.3 6.2-5.6-3.2L6.4 20l1.3-6.2L3 9.5l6.3-.7z",
  play: "M7 4.5v15l12-7.5z",
  stop: "M6 6h12v12H6z",
  section: "M14 6.5c-.5-1.5-4-2.5-5.5-.5S9 10 12 11s4 2.5 2.5 4.5-4.5 1.5-5 0M12 3v2M12 18.5v2.5",
  wave: "M9.5 12V5.5a1.5 1.5 0 0 1 3 0V11M12.5 11V4.5a1.5 1.5 0 0 1 3 0V11M15.5 11V6.5a1.5 1.5 0 0 1 3 0V14a6.5 6.5 0 0 1-11.5 4.1L4.6 14a1.5 1.5 0 0 1 2.4-1.8l2.5 3.2V8.5a1.5 1.5 0 0 1 3 0",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2",
  question: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7M12 17h.01",
  command: "M9 6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3z",
  logout: "M10 4H5.5A1.5 1.5 0 0 0 4 5.5v13A1.5 1.5 0 0 0 5.5 20H10M15 16l4-4-4-4M19 12H9",
  swap: "M4 7h13M14 3.5 17.5 7 14 10.5M20 17H7M10 13.5 6.5 17l3.5 3.5",
  inbox: "M4 13.5 6 5h12l2 8.5V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zM4 13.5h5l1 2h4l1-2h5",
  flame: "M12 21c4 0 7-2.8 7-6.7 0-3-1.6-5-3.2-6.8-.3 1.7-1 2.6-2 3.2C13.7 8 13.3 5 10.5 3c.2 3-1.4 4.2-3 6-1.6 1.7-2.5 3.3-2.5 5.3C5 18.2 8 21 12 21z",
} as const;

export function Icon({
  name,
  size = 20,
  strokeWidth = 1.75,
  className,
  ...props
}: Omit<ComponentProps<"svg">, "name"> & { name: IconName; size?: number; strokeWidth?: number }) {
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
      aria-hidden
      focusable="false"
      className={className}
      {...props}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

/** A coloured disc behind an icon — the tile/empty-state treatment. */
export function IconDisc({
  name,
  tone = "accent",
  size = 44,
  className,
}: {
  name: IconName;
  tone?: "accent" | "success" | "warning" | "destructive" | "ai" | "neutral";
  size?: number;
  className?: string;
}) {
  const tones = {
    accent: "bg-accent text-accent-fg",
    success: "bg-success-tint text-success-fg",
    warning: "bg-warning-tint text-warning-fg",
    destructive: "bg-destructive-tint text-destructive-text",
    ai: "bg-ai-tint text-ai-fg",
    neutral: "bg-surface-2 text-foreground",
  } as const;
  return (
    <span
      className={["inline-flex shrink-0 items-center justify-center rounded-full", tones[tone], className].filter(Boolean).join(" ")}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <Icon name={name} size={Math.round(size * 0.5)} />
    </span>
  );
}
