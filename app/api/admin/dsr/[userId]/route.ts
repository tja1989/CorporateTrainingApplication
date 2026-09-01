import { requireRole } from "@/lib/auth/guard";
import { exportUserData, eraseUser } from "@/lib/dsr";

/** DSR endpoints (spec FR-13.4): GET = full export JSON; DELETE = erase/anonymize. */
export async function GET(_req: Request, { params }: { params: Promise<{ userId: string }> }) {
  await requireRole("ADMIN");
  const { userId } = await params;
  const data = await exportUserData(userId);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="dsr-export-${userId.slice(0, 8)}.json"`,
    },
  });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ userId: string }> }) {
  await requireRole("ADMIN");
  const { userId } = await params;
  await eraseUser(userId);
  return Response.json({ ok: true });
}
