"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { animate, useReducedMotion } from "motion/react";
import { DUR, EASE_OUT } from "@/lib/motion";

const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/**
 * Counts up to `value` on mount (slow token). Server-renders the final value so
 * there is no layout shift; reduced-motion users never see the count.
 */
export function AnimatedNumber({
  value,
  decimals = 0,
  prefix = "",
  suffix = "",
  className,
}: {
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(value);
  useIsoLayoutEffect(() => {
    if (reduced || Math.abs(value) < 2) {
      setShown(value);
      return;
    }
    const controls = animate(0, value, { duration: DUR.slow, ease: EASE_OUT, onUpdate: (v) => setShown(v) });
    return () => controls.stop();
  }, [value, reduced]);
  const fmt = new Intl.NumberFormat(undefined, { maximumFractionDigits: decimals, minimumFractionDigits: decimals });
  return (
    <span className={className}>
      <span aria-hidden>
        {prefix}
        {fmt.format(shown)}
        {suffix}
      </span>
      <span className="sr-only">
        {prefix}
        {fmt.format(value)}
        {suffix}
      </span>
    </span>
  );
}
