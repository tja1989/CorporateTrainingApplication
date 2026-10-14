"use client";

import { useEffect, useState } from "react";
import { Icon } from "./icons";

/**
 * Light/dark switch. The icon shows the theme you would switch *to*; it is
 * read from the root class after mount so the server markup never disagrees
 * with the cookie-set theme.
 */
export function ThemeToggle({ className, showLabel = false }: { className?: string; showLabel?: boolean }) {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);
  return (
    <button
      type="button"
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      title={dark ? "Light mode" : "Dark mode"}
      className={className ?? "pressable touch-target rounded-control px-2 hover:bg-surface-2"}
      onClick={() => {
        const root = document.documentElement;
        const next = root.classList.toggle("dark");
        document.cookie = `ll_theme=${next ? "dark" : "light"};path=/;max-age=31536000;samesite=lax`;
        setDark(next);
      }}
    >
      <span key={dark ? "sun" : "moon"} className="inline-flex">
        <Icon name={dark ? "sun" : "moon"} />
      </span>
      {showLabel ? <span>{dark ? "Light mode" : "Dark mode"}</span> : null}
    </button>
  );
}
