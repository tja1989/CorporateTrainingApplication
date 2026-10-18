import { eq } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { apiUser as currentUser } from "@/lib/auth/guard";
import { certificatePdf } from "@/lib/pdf";
import { trainingScope } from "@/lib/auth/scope";
import { hasPermission } from "@/lib/auth/permissions";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ certId: string }> },
) {
  const user = await currentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { certId } = await params;
  const [cert] = await db
    .select()
    .from(t.certificates)
    .where(eq(t.certificates.id, certId))
    .limit(1);
  if (!cert) return new Response("Not found", { status: 404 });
  const isOwner = cert.userId === user.id;
  const [holder] = await db
    .select()
    .from(t.users)
    .where(eq(t.users.id, cert.userId))
    .limit(1);
  if (!holder || holder.erasedAt)
    return new Response("Not found", { status: 404 });
  const scope = hasPermission(user.role, "reports.read")
    ? await trainingScope(user)
    : { userIds: [], courseIds: [] };
  const authorized =
    (scope.userIds === undefined || scope.userIds.includes(cert.userId)) &&
    (scope.courseIds === undefined || scope.courseIds.includes(cert.courseId));
  if (!isOwner && !authorized)
    return new Response("Forbidden", { status: 403 });
  const [course] = await db
    .select()
    .from(t.courses)
    .where(eq(t.courses.id, cert.courseId))
    .limit(1);

  const pdf = await certificatePdf({
    learnerName: holder?.name ?? "Employee",
    courseTitle: course?.title ?? "Course",
    completedAt: cert.issuedAt,
    expiresAt: cert.expiresAt,
    serial: cert.serial,
  });
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      // ?download=1 saves the file; otherwise the browser shows it.
      "Content-Disposition": `${new URL(req.url).searchParams.get("download") === "1" ? "attachment" : "inline"}; filename="certificate-${cert.serial}.pdf"`,
    },
  });
}
