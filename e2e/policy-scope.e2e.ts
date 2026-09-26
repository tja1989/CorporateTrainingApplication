import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { createPerson, signIn, withDb } from "./support";

test("@core HR retrieval enforces country, audience, effective dates and abstention; manager-only policy denies learner deep links", async ({ page }, info) => {
  const learner = await createPerson("LEARNER"), manager = await createPerson("MANAGER"), token = `qascope${randomUUID().replaceAll("-", "")}`;
  const country = randomUUID(), store = randomUUID();
  const docs = ["allowed", "manager", "foreign", "future"].map(kind => ({ id: randomUUID(), kind, title: `QA ${kind} ${token}` }));
  await withDb(async db => {
    await db.query("INSERT INTO org_units(id,type,name) VALUES($1,'country',$2)", [country, token]);
    await db.query("INSERT INTO org_units(id,type,name,parent_id) VALUES($1,'store','QA scope store',$2)", [store, country]);
    await db.query("UPDATE users SET store_id=$2 WHERE id=ANY($1)", [[learner.id, manager.id], store]);
    for (const doc of docs) {
      const content = `${token} ${doc.kind} procedure: ask the designated supervisor for written approval.`;
      await db.query("INSERT INTO policy_docs(id,title,country,audience,language,effective_date,body) VALUES($1,$2,$3,$4,'en',$5,$6)", [doc.id, doc.title, doc.kind === "foreign" ? "other-country" : token, doc.kind === "manager" ? "managers" : "all", new Date(Date.now() + (doc.kind === "future" ? 86400000 : -86400000)), `# Procedure\n\n${content}`]);
      await db.query("INSERT INTO policy_chunks(id,doc_id,section_path,text,parent_text) VALUES($1,$2,'Procedure',$3,$3)", [randomUUID(), doc.id, content]);
    }
  });
  const ask = async () => {
    await page.goto("/ask-hr"); await page.getByRole("textbox", { name: "Ask the HR assistant", exact: true }).fill(token);
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(page.getByText(/Offline demo answer/).last()).toBeVisible();
  };
  await signIn(page, learner); await ask();
  await page.route("**/api/hr/feedback", route => route.abort("failed"));
  await page.getByRole("button", { name: "Helpful", exact: true }).click();
  await expect(page.getByText("Feedback could not be saved. Please try again.", { exact: true })).toBeVisible();
  await page.unroute("**/api/hr/feedback"); await page.getByRole("button", { name: "Helpful", exact: true }).click();
  await expect(page.getByText("Feedback recorded. Thank you.", { exact: true })).toBeVisible();
  await expect.poll(() => withDb(async db => (await db.query("SELECT m.feedback FROM hr_messages m JOIN hr_conversations c ON c.id=m.conversation_id WHERE c.user_id=$1 AND m.role='assistant' ORDER BY m.created_at DESC LIMIT 1", [learner.id])).rows[0].feedback)).toBe("up");
  await page.getByRole("button", { name: "Not helpful", exact: true }).click();
  await expect.poll(() => withDb(async db => (await db.query("SELECT m.feedback FROM hr_messages m JOIN hr_conversations c ON c.id=m.conversation_id WHERE c.user_id=$1 AND m.role='assistant' ORDER BY m.created_at DESC LIMIT 1", [learner.id])).rows[0].feedback)).toBe("down");
  await expect(page.locator(`a[href^='/policy/${docs[0].id}']`)).toBeVisible();
  for (const doc of docs.slice(1)) await expect(page.locator(`a[href^='/policy/${doc.id}']`)).toHaveCount(0);
  await page.locator(`a[href^='/policy/${docs[0].id}']`).click();
  await expect(page.getByRole("heading", { name: "Procedure", exact: true })).toBeVisible();
  await page.goto(`/policy/${docs[1].id}`); await expect(page.getByRole("heading", { name: /not found/i })).toBeVisible();
  await page.context().clearCookies(); await signIn(page, manager); await ask();
  await expect(page.locator(`a[href^='/policy/${docs[1].id}']`)).toBeVisible();
  for (const doc of docs.slice(2)) await expect(page.locator(`a[href^='/policy/${doc.id}']`)).toHaveCount(0);
  await page.locator(`a[href^='/policy/${docs[1].id}']`).click(); await expect(page.getByRole("heading", { name: docs[1].title, exact: true })).toBeVisible();
  // An empty country has no allowed snippets at all, so a normal UI query must abstain.
  const emptyCountry = randomUUID(), emptyStore = randomUUID(), empty = await createPerson("LEARNER");
  await withDb(async db => { await db.query("INSERT INTO org_units(id,type,name) VALUES($1,'country',$2)", [emptyCountry, `empty${token}`]); await db.query("INSERT INTO org_units(id,type,name,parent_id) VALUES($1,'store','QA empty scope',$2)", [emptyStore, emptyCountry]); await db.query("UPDATE users SET store_id=$2 WHERE id=$1", [empty.id, emptyStore]); });
  await page.context().clearCookies(); await signIn(page, empty); await page.goto("/ask-hr");
  await page.getByRole("textbox", { name: "Ask the HR assistant", exact: true }).fill("What is the company relocation allowance?");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByText(/couldn't find|could not find|don't have enough|not.*policy/i).last()).toBeVisible();
  await expect(page.locator("main a[href^='/policy/']")).toHaveCount(0);
  await info.attach("scope-prerequisites", { body: JSON.stringify({ learner: learner.id, manager: manager.id, empty: empty.id, docs }), contentType: "application/json" });
});
