"use client";

export function ThemeToggle() {
  return (
    <button
      type="button"
      aria-label="Toggle dark mode"
      className="pressable touch-target rounded-[--radius-control] px-2 text-lg hover:bg-surface-2"
      onClick={() => {
        const root = document.documentElement;
        const dark = root.classList.toggle("dark");
        document.cookie = `ll_theme=${dark ? "dark" : "light"};path=/;max-age=31536000;samesite=lax`;
      }}
    >
      ◐
    </button>
  );
}
