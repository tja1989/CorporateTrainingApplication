import { loadEnv } from "../lib/env";
loadEnv();
import { chromium } from "@playwright/test";
import { Client } from "pg";
import { mkdirSync, writeFileSync } from "node:fs";
import { totpCode } from "../lib/auth/totp";

/** Local before/after evidence capture. Never mutates database records directly. */
async function main() {
  const base = process.env.QA_BASE ?? "http://localhost:3100";
  const url = new URL(process.env.DATABASE_URL!);
  if (!["localhost", "127.0.0.1"].includes(url.hostname) || !url.pathname.startsWith("/welearn_")) throw new Error("QA capture requires an isolated local welearn database");
  if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname)) throw new Error("QA capture requires a local app");
  const out = process.env.QA_OUT ?? ".artifacts/baseline/screens";
  mkdirSync(out, { recursive: true });
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const course = (await db.query("SELECT id FROM courses WHERE title = 'Food Safety Essentials' LIMIT 1")).rows[0].id;
  const lesson = (await db.query("SELECT l.id FROM lessons l JOIN modules m ON m.id=l.module_id WHERE m.course_id=$1 AND l.type='VIDEO' LIMIT 1", [course])).rows[0].id;
  const browser = await chromium.launch();
  const results: object[] = [];
  for (const viewport of [{width:1440,height:900},{width:390,height:844}]) {
    for (const persona of [
      {id:"AE10023",role:"learner",routes:["/home","/learn",`/course/${course}`,`/lesson/${lesson}`,"/ask-hr","/profile"]},
      {id:"AE20001",role:"manager",routes:["/team","/team/reports"]},
      {id:"AE90001",role:"admin",routes:["/admin",`/admin/courses/${course}`,"/admin/people","/admin/reports"]},
    ]) {
      const ctx=await browser.newContext({viewport,reducedMotion:"reduce"});
      const page=await ctx.newPage();
      await page.goto(`${base}/login`);
      if(persona.role==="learner") await page.screenshot({path:`${out}/login-${viewport.width}.png`,fullPage:true,animations:"disabled"});
      await page.locator('input[name="employeeId"]').fill(persona.id);
      await page.locator('input[name="password"]').fill("demo1234");
      await page.getByRole("button",{name:"Sign in",exact:true}).click();
      await page.waitForURL(u=>u.pathname!=="/login");
      for(let i=0;i<5;i++) {
        const path=new URL(page.url()).pathname;
        if(path==="/privacy-notice") {
          await page.locator('button[type="submit"]').click();
          await page.waitForURL(u=>u.pathname!==path);
        } else if(path==="/login/mfa-setup") {
          const secret=(await page.getByLabel("TOTP secret").textContent())?.trim();
          if(!secret) throw new Error("Missing TOTP setup secret");
          await page.locator('input[name="code"]').fill(totpCode(secret));
          await page.locator('button[type="submit"]').click();
          await page.waitForURL(u=>u.pathname!==path);
        } else if(path==="/login/mfa") {
          const secret=(await db.query("SELECT totp_secret FROM users WHERE employee_id=$1",[persona.id])).rows[0].totp_secret;
          await page.locator('input[name="code"]').fill(totpCode(secret));
          await page.locator('button[type="submit"]').click();
          await page.waitForURL(u=>u.pathname!==path);
        } else break;
      }
      for(const route of persona.routes) {
        await page.goto(`${base}${route}`);
        if(route === '/ask-hr') await page.getByLabel('Ask the HR assistant').waitFor();
        else await page.locator('h1:visible,h2:visible').first().waitFor();
        await page.evaluate(()=>document.fonts.ready);
        const name=`${persona.role}-${route.split('/').slice(1,3).map(p=>/^[a-f0-9-]{30,}$/.test(p)?'detail':p).join('-')}-${viewport.width}`;
        await page.screenshot({path:`${out}/${name}.png`,fullPage:true,animations:"disabled"});
        const actualPath=new URL(page.url()).pathname;
        console.log(`Captured ${name} at ${actualPath}`);
        results.push({role:persona.role,route,viewport,actualPath,heading:await page.locator('h1:visible,h2:visible').allTextContents(),screenshot:`${name}.png`,overflow:await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth)});
      }
      writeFileSync(`${out}/manifest.json`,JSON.stringify(results,null,2));
      await ctx.close();
    }
  }
  await browser.close();await db.end();
  writeFileSync(`${out}/manifest.json`,JSON.stringify(results,null,2));
  console.log(`Captured ${results.length} representative route screenshots plus login at ${out}`);
}
main().catch(e=>{console.error(e);process.exit(1);});
