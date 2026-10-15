import type { ComponentProps, ReactNode } from "react";
import { buttonClass, cx, StatusChip } from "./ui";
import { isKnownStatus } from "@/lib/status";

/** Full document navigation keeps workspace lists, filters and history reliable. */
export function WorkspaceLink({ className, ...props }: ComponentProps<"a">) {
  return (
    <a className={cx(buttonClass("secondary"), className)} {...props} />
  );
}
export function WorkspaceTabs({
  items,
  label,
}: {
  items: { href: string; label: string; active: boolean }[];
  label: string;
}) {
  return (
    <nav
      aria-label={label}
      className="mb-6 flex flex-wrap gap-1 border-b border-border"
    >
      {items.map((item) => (
        <a
          key={item.href}
          href={item.href}
          aria-current={item.active ? "page" : undefined}
          className={cx(
            "touch-target px-4 py-3 text-sm font-medium border-b-2",
            item.active
              ? "border-primary text-primary"
              : "border-transparent text-muted hover:bg-surface-2",
          )}
        >
          {item.label}
        </a>
      ))}
    </nav>
  );
}
export function WorkspaceSection({
  title,
  description,
  children,
  id,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  id?: string;
}) {
  return (
    <section
      id={id}
      aria-label={title}
      className="min-w-0 rounded-card border border-border bg-surface p-4 sm:p-6"
    >
      <h2 className="mb-2 text-lg font-semibold">{title}</h2>
      {description ? (
        <p className="mb-4 text-sm text-muted">{description}</p>
      ) : null}
      {children}
    </section>
  );
}
export function DataTable({
  title,
  columns,
  rows,
}: {
  title: string;
  columns: string[];
  rows: Array<Array<string | number>>;
}) {
  return (
    <div
      role="region"
      aria-label={`${title} table`}
      tabIndex={0}
      className="max-w-full overflow-x-auto rounded-card border border-border bg-surface"
    >
      <table className="w-full text-sm [overflow-wrap:normal]">
        <caption className="sr-only">{title}</caption>
        <thead className="bg-surface-2">
          <tr>
            {columns.map((c) => (
              <th
                key={c}
                className="whitespace-nowrap px-4 py-3 text-start font-semibold"
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((row, i) => (
              <tr key={i} className="border-t border-border hover:bg-surface-2">
                {row.map((cell, j) => (
                  <td key={j} className="px-4 py-3">
                    {isKnownStatus(cell) ? <StatusChip status={cell} /> : cell}
                  </td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td
                colSpan={columns.length}
                className="px-4 py-8 text-center text-muted"
              >
                No rows match these filters.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
