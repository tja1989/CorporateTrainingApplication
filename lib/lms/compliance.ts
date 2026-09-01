import type { ComplianceStatus } from "@/lib/db/schema";

export const DUE_SOON_DAYS = 7;
export const CERT_EXPIRING_DAYS = 30;

export type ComplianceInput = {
  status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "WITHDRAWN";
  dueAt: Date | null;
  certificateExpiresAt: Date | null;
  /** True when a recert enrollment exists and is itself complete. */
  recertCompleted?: boolean;
  now?: Date;
};

/**
 * Closed compliance-status machine, precedence top-down (spec FR-3.3):
 * OVERDUE → DUE_SOON → ON_TRACK → EXPIRED → COMPLETED_EXPIRING → COMPLETED → WITHDRAWN
 */
export function computeComplianceStatus(input: ComplianceInput): ComplianceStatus {
  const now = input.now ?? new Date();
  if (input.status === "WITHDRAWN") return "WITHDRAWN";

  if (input.status !== "COMPLETED") {
    if (input.dueAt && input.dueAt < now) return "OVERDUE";
    if (input.dueAt && input.dueAt.getTime() - now.getTime() <= DUE_SOON_DAYS * 24 * 3600_000) return "DUE_SOON";
    return "ON_TRACK";
  }

  // COMPLETED — certificate lifecycle applies
  if (input.certificateExpiresAt) {
    if (input.certificateExpiresAt < now && !input.recertCompleted) return "EXPIRED";
    if (
      input.certificateExpiresAt >= now &&
      input.certificateExpiresAt.getTime() - now.getTime() <= CERT_EXPIRING_DAYS * 24 * 3600_000
    ) {
      return "COMPLETED_EXPIRING";
    }
  }
  return "COMPLETED";
}
