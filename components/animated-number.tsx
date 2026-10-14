/** Compatibility export: stable figures render their actual value immediately. */
export function AnimatedNumber({ value, decimals = 0, prefix = "", suffix = "", className }: { value: number; decimals?: number; prefix?: string; suffix?: string; className?: string }) {
  const format = new Intl.NumberFormat("en", { maximumFractionDigits: decimals, minimumFractionDigits: decimals });
  return <span className={className}>{prefix}{format.format(value)}{suffix}</span>;
}
