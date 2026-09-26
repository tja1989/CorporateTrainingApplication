import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import * as schema from "../lib/db/schema";

const state = vi.hoisted(() => ({
  actor: { id: "manager", role: "MANAGER" } as { id: string; role: string } | null,
  target: { id: "member", managerId: "manager", erasedAt: null } as Record<string, unknown>,
  writes: [] as unknown[],
}));
vi.mock("@/lib/auth/guard", () => ({ requireRole: async (...roles: string[]) => {
  if (!state.actor || !roles.includes(state.actor.role)) throw new Error("Forbidden");
  return state.actor;
} }));
vi.mock("@/lib/auth/session", () => ({ readSession: async () => null, createSession: async () => {}, destroySession: async () => {} }));
vi.mock("@/lib/ai/gateway", () => ({ aiAvailable: () => false, structuredCall: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(path); } }));
vi.mock("@/lib/db/client", async () => {
  const t = await import("../lib/db/schema");
  const dialect = new PgDialect();
  const db = {
    select: () => ({ from: (table: unknown) => {
      const all = table === t.users ? [{ ...state.target, name: "Private learner", employeeId: "PRIVATE", role: "LEARNER" }] : [];
      const query = (rows: unknown[]): any => ({
        then: (resolve: (rows: unknown[]) => unknown) => Promise.resolve(rows).then(resolve),
        where: (where: any) => query(where && /\bfalse\b/i.test(dialect.sqlToQuery(where).sql) ? [] : rows),
        groupBy: () => query(rows), limit: async () => rows,
      });
      return query(all);
    } }),
    update: () => ({ set: (value: unknown) => ({ where: async () => { state.writes.push(value); } }) }),
    insert: () => ({ values: async (value: unknown) => { state.writes.push(value); } }),
    transaction: async (fn: (tx: unknown) => unknown) => fn(db),
  };
  return { t, db };
});
import { issueResetCode } from "../lib/auth/login";
import { runReport, type ReportId } from "../lib/reports";

beforeEach(() => {
  state.actor = { id: "manager", role: "MANAGER" };
  state.target = { id: "member", managerId: "manager", erasedAt: null };
  state.writes = [];
});

describe("reset action authorization at the remote entry point", () => {
  it("rejects an unauthenticated caller before changing an account", async () => {
    state.actor = null;
    await expect(issueResetCode("member", "admin")).rejects.toThrow();
    expect(state.writes).toEqual([]);
  });
  it("rejects a learner even when an administrator issuer ID is supplied", async () => {
    state.actor = { id: "learner", role: "LEARNER" };
    await expect(issueResetCode("member", "admin")).rejects.toThrow();
    expect(state.writes).toEqual([]);
  });
  it("rejects another manager's employee", async () => {
    state.target.managerId = "someone-else";
    await expect(issueResetCode("member", "manager")).rejects.toThrow();
    expect(state.writes).toEqual([]);
  });
  it("records the authenticated issuer rather than a caller-supplied ID", async () => {
    await issueResetCode("member", "forged-issuer");
    expect(state.writes).toContainEqual(expect.objectContaining({ userId: "manager", kind: "reset_code_issued" }));
  });
});

describe("explicit report scope", () => {
  for (const report of ["completion", "compliance", "transcript", "cert_expiry", "engagement", "quiz_results"] as ReportId[]) {
    it(`${report}: an empty team has zero rows`, async () => {
      expect((await runReport(report, { userIds: [] })).rows).toEqual([]);
    });
  }
  it("leaves an authorized administrator's undefined scope unrestricted", async () => {
    expect((await runReport("engagement", {})).rows).toHaveLength(1);
  });
});
