import { Button, Field, Input, Select } from "./ui";
import { DataTable, WorkspaceLink, WorkspaceTabs } from "./workspace-ui";
import { REPORTS, COMPLIANCE_STATUSES, type ReportParams } from "@/lib/report-options";
import type { ReportId, ReportResult } from "@/lib/reports";
export function WorkspaceReports({ base, report, params, result }: { base: string; report: ReportId; params: ReportParams; result: ReportResult }) {
  const qs = new URLSearchParams(); for (const key of ["course", "store", "status", "days", "employee"] as const) if (params[key]) qs.set(key, params[key]!);
  const tail = qs.toString();
  return <section aria-label="Report results"><WorkspaceTabs label="Report" items={REPORTS.map(r => ({ label: r.label, href: `${base}?report=${r.id}${tail ? `&${tail}` : ""}`, active: r.id === report }))} />
    <form action={base} method="get" className="mb-6 rounded-card border border-border bg-surface p-4"><input type="hidden" name="report" value={report} /><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {report !== "engagement" ? <Field label="Course title"><Input name="course" defaultValue={params.course ?? ""} placeholder="All courses" /></Field> : null}
      <Field label="Store name"><Input name="store" defaultValue={params.store ?? ""} placeholder="All stores in scope" /></Field><Field label="Employee ID"><Input name="employee" defaultValue={params.employee ?? ""} placeholder="All employees in scope" /></Field>
      {report === "compliance" || report === "completion" ? <Field label="Compliance status"><Select name="status" defaultValue={params.status ?? ""}><option value="">All statuses</option>{COMPLIANCE_STATUSES.map(s => <option key={s} value={s}>{s.toLowerCase().replaceAll("_", " ")}</option>)}</Select></Field> : null}
      {report === "cert_expiry" || report === "engagement" ? <Field label={report === "cert_expiry" ? "Expiring within (days)" : "Activity in the last (days)"}><Input name="days" type="number" min={1} max={3650} defaultValue={params.days ?? (report === "cert_expiry" ? "90" : "30")} /></Field> : null}
    </div><div className="flex gap-2"><Button type="submit">Apply filters</Button><WorkspaceLink href={`${base}?report=${report}`}>Reset filters</WorkspaceLink></div></form>
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">{result.title}</h2><p className="text-sm text-muted">{result.rows.length} result{result.rows.length === 1 ? "" : "s"} · CSV uses these same filters</p></div><WorkspaceLink href={`/api/reports/${report}/csv?${tail}${base === "/team/reports" ? "&scope=team" : ""}`}>Export CSV</WorkspaceLink></div><DataTable title={result.title} columns={result.columns} rows={result.rows} />
  </section>;
}
