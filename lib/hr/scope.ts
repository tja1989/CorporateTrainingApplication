import { eq } from "drizzle-orm";
import { db, t } from "@/lib/db/client";

/** Resolves the country code for a store by walking org_units up to the country (default AE). */
export async function userCountry(storeId: string | null): Promise<string> {
  if (!storeId) return "AE";
  let cursor: string | null = storeId;
  for (let i = 0; i < 5 && cursor; i++) {
    const [unit] = await db.select().from(t.orgUnits).where(eq(t.orgUnits.id, cursor)).limit(1);
    if (!unit) break;
    if (unit.type === "country") return unit.name === "United Arab Emirates" ? "AE" : unit.name;
    cursor = unit.parentId;
  }
  return "AE";
}

/** Hard retrieval scope for the HR assistant (spec FR-8.5): country + audience. */
export async function hrScopeFor(user: { storeId: string | null; role: string }): Promise<{ country: string; audience: "all" | "managers" }> {
  return { country: await userCountry(user.storeId), audience: user.role === "LEARNER" ? "all" : "managers" };
}
