"use client";

import { useEffect } from "react";

export function ScrollToSection({ anchor }: { anchor: string }) {
  useEffect(() => {
    const el = document.getElementById(anchor);
    if (el) {
      el.scrollIntoView({ block: "start" });
      el.focus({ preventScroll: true });
    }
  }, [anchor]);
  return null;
}
