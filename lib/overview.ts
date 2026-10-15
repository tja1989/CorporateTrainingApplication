/** Summary figures that open each role's workspace. Colour only where attention is needed. */
export type OverviewRole = "INSTRUCTOR" | "DEPARTMENT_HEAD" | "HR_HEAD";
export type OverviewFigure = { label: string; value: number; href: string; tone: "default" | "warning" | "destructive" };
type Course = { status: string; approvalState: string };

export function overviewFigures(role: OverviewRole, base: string, courses: Course[], team: { overdue: number; dueSoon: number } = { overdue: 0, dueSoon: 0 }): OverviewFigure[] {
  const count = (test: (c: Course) => boolean) => courses.filter(test).length;
  const drafts = count((c) => c.status === "DRAFT" && c.approvalState === "DRAFT");
  const submitted = count((c) => c.approvalState === "SUBMITTED");
  const published = count((c) => c.status === "PUBLISHED");
  const figure = (label: string, value: number, href: string, attention?: "warning" | "destructive"): OverviewFigure =>
    ({ label, value, href, tone: attention && value > 0 ? attention : "default" });
  if (role === "INSTRUCTOR")
    return [
      figure("Drafts", drafts, `${base}/courses?status=DRAFT`),
      figure("Awaiting approval", submitted, `${base}/courses`),
      figure("Changes requested", count((c) => c.approvalState === "REJECTED"), `${base}/courses`, "warning"),
      figure("Published", published, `${base}/courses?status=PUBLISHED`),
    ];
  if (role === "DEPARTMENT_HEAD")
    return [
      figure("Awaiting your review", count((c) => c.approvalState === "SUBMITTED" && c.status === "DRAFT"), `${base}/approvals`, "warning"),
      figure("Published courses", published, `${base}/courses?status=PUBLISHED`),
      figure("Overdue training", team.overdue, "/team?filter=OVERDUE", "destructive"),
      figure("Due soon", team.dueSoon, "/team?filter=DUE_SOON", "warning"),
    ];
  return [
    figure("Ready to publish", count((c) => c.approvalState === "APPROVED" && c.status === "DRAFT"), `${base}/courses`, "warning"),
    figure("Awaiting department review", submitted, `${base}/courses`),
    figure("Published", published, `${base}/courses?status=PUBLISHED`),
    figure("Drafts", drafts, `${base}/courses?status=DRAFT`),
  ];
}
