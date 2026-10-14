import type { ReportFilters, ReportId } from "./reports";
import { canonicalRole, needsMfa } from "./auth/roles";
export const REPORTS: { id: ReportId; label: string }[] = [
  { id: "completion", label: "Course completion" }, { id: "compliance", label: "Compliance matrix" },
  { id: "transcript", label: "Learner transcripts" }, { id: "cert_expiry", label: "Certificate expiry" },
  { id: "engagement", label: "Engagement" }, { id: "quiz_results", label: "Quiz results" },
];
export type ReportParams = { report?: string; course?: string; store?: string; status?: string; days?: string; employee?: string; page?: string };
export const COMPLIANCE_STATUSES = ["ON_TRACK", "DUE_SOON", "OVERDUE", "COMPLETED", "COMPLETED_EXPIRING", "EXPIRED"];
export function reportFilters(params: ReportParams): ReportFilters {
  const days = Number(params.days);
  return { courseTitle: params.course?.trim() || undefined, storeName: params.store?.trim() || undefined, employeeId: params.employee?.trim() || undefined,
    complianceStatus: COMPLIANCE_STATUSES.includes(params.status ?? "") ? params.status : undefined,
    daysWindow: Number.isInteger(days) && days >= 1 && days <= 3650 ? days : undefined };
}

/** API access must honor the same MFA and consent gates as report pages. */
export function canReadReports(user: { role: string; privacyNoticeVersion: number; totpSecret: string | null; session: { mfa: boolean } }): boolean {
  const role = canonicalRole(user.role);
  return !!role && ["ADMIN", "DEPARTMENT_HEAD", "HR_HEAD"].includes(role) && user.privacyNoticeVersion >= 1 && (!needsMfa(role) || (!!user.totpSecret && user.session.mfa));
}
