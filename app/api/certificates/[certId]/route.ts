import { eq } from "drizzle-orm";
import { db, t } from "@/lib/db/client";
import { apiUser as currentUser } from "@/lib/auth/guard";
import { certificatePdf } from "@/lib/pdf";

export async function GET(_req: Request, { params }: { params: Promise<{ certId: string }> }) {
  const user = await currentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { certId } = await params;
  const [cert] = await db.select().from(t.certificates).where(eq(t.certificates.id, certId)).limit(1);
  if (!cert) return new Response("Not found", { status: 404 });
  const isOwner = cert.userId === user.id;
  const isAdmin = user.role === "ADMIN";
  const [holder] = await db.select().from(t.users).where(eq(t.users.id, cert.userId)).limit(1);
  const isManagerOf = user.role === "MANAGER" && holder?.managerId === user.id;
  if (!isOwner && !isAdmin && !isManagerOf) return new Response("Forbidden", { status: 403 });
  const [course] = await db.select().from(t.courses).where(eq(t.courses.id, cert.courseId)).limit(1);

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
      "Content-Disposition": `inline; filename="certificate-${cert.serial}.pdf"`,
    },
  });
}
