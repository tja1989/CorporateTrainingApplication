"use client";

import { useEffect, useId, useState } from "react";

/**
 * Apple-Activity-style progress ring. The arc draws from empty to its value on
 * mount (400ms, `.ring-progress`) in a lime-to-mint sweep; reduced-motion users
 * get the final state immediately via the CSS media query.
 */
export function ProgressRing({ pct, size = 44, label }: { pct: number; size?: number; label?: string }) {
  const stroke = Math.max(4, Math.round(size / 10));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, pct));
  const gradientId = useId();
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const offset = drawn ? c - (clamped / 100) * c : c;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label ?? `${Math.round(clamped)}% complete`}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--accent)" />
          <stop offset="100%" stopColor="var(--success)" />
        </linearGradient>
      </defs>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth={stroke} />
      <circle
        className="ring-progress"
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={`url(#${gradientId})`}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text
        x="50%"
        y="54%"
        dominantBaseline="middle"
        textAnchor="middle"
        fontSize={size * 0.28}
        fill="var(--foreground)"
        fontFamily="var(--font-display)"
        fontWeight={600}
        letterSpacing="-0.02em"
      >
        {Math.round(clamped)}
      </text>
    </svg>
  );
}
