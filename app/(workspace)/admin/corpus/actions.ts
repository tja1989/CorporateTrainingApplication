"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/guard";
import { publishPolicyVersion } from "@/lib/hr/ingest";

export async function publishPolicyAction(form: FormData): Promise<void> {
  await requireRole("ADMIN");
  const title = String(form.get("title") ?? "").trim();
  const body = String(form.get("body") ?? "").trim();
  if (!title || !body) return;
  await publishPolicyVersion({
    title,
    country: String(form.get("country") ?? "AE").trim().toUpperCase(),
    audience: form.get("audience") === "managers" ? "managers" : "all",
    language: "en",
    owner: String(form.get("owner") ?? "").trim(),
    effectiveDate: new Date(String(form.get("effectiveDate") ?? new Date().toISOString())),
    body,
  });
  revalidatePath("/admin/corpus");
}
