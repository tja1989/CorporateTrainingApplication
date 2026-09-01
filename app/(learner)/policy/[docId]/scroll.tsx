"use client";

import { useEffect } from "react";

export function ScrollToSection({ anchor }: { anchor: string }) {
  useEffect(() => {
    const el = document.getElementById(anchor);
    if (el) {
      el.scrollIntoView({ block: "start" });
      el.classList.add("bg-warning-tint");
      const timer = setTimeout(() => el.classList.remove("bg-warning-tint"), 2000);
      return () => clearTimeout(timer);
    }
  }, [anchor]);
  return null;
}
