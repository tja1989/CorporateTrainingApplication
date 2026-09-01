"use client";

import { useEffect, useState } from "react";

/**
 * Apple-Activity-style progress ring. The arc draws from empty to its value on
 * mount (400ms, `.ring-progress`); reduced-motion users get the final state
 * immediately via the CSS media query.
 */
export function ProgressRing({ pct, size = 44, label }: { pct: number; size?: number; label?: string }) {
  const stroke = 4;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, pct));
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const offset = drawn ? c - (clamped / 100) * c : c;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label ?? `${Math.round(clamped)}% complete`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth={stroke} />
      <circle
        className="ring-progress"
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--primary)"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x="50%" y="54%" dominantBaseline="middle" textAnchor="middle" fontSize={size * 0.26} fill="var(--foreground)" fontWeight={500}>
        {Math.round(clamped)}
      </text>
    </svg>
  );
}
