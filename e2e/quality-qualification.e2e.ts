import { randomUUID } from "node:crypto";
import { type Page, type TestInfo } from "@playwright/test";
import { test, expect } from "./native-zoom-test";
import AxeBuilder from "@axe-core/playwright";
import { createPerson, signIn, withDb, capture, expectNoPageOverflow, QA_PASSWORD } from "./support";
import { textCourse, smallQuiz, assessmentFixture, tutorFixture } from "./qualification-fixtures";

async function overflow(page:Page,info:TestInfo,label:string){
  const measured=await page.evaluate(()=>({viewport:innerWidth,content:document.documentElement.scrollWidth,outliers:[...document.querySelectorAll("body *")].filter(el=>{const r=el.getBoundingClientRect();return r.width&&r.height&&(r.right>innerWidth+1||r.left< -1)&&getComputedStyle(el).position!=="fixed";}).slice(-20).map(el=>({tag:el.tagName,text:(el.textContent??"").slice(0,80),class:el.className,rect:el.getBoundingClientRect().toJSON()}))}));
  await info.attach(`${label}-overflow`,{body:JSON.stringify(measured),contentType:"application/json"});
  expect.soft(measured.content,`${label} page overflow`).toBeLessThanOrEqual(measured.viewport+1);
}

async function inspect(page:Page,info:TestInfo,label:string){
  // Client navigation can commit the URL before streamed metadata settles.
  await expect(page).toHaveTitle(/welearn/);
  await expect.soft(page.locator("h1").first()).toBeVisible();
  await overflow(page,info,label);
  const axe=await new AxeBuilder({page}).withTags(["wcag2a","wcag2aa","wcag21aa","wcag22aa"]).analyze();
  await info.attach(`${label}-axe`,{body:JSON.stringify({url:page.url(),violations:axe.violations,incomplete:axe.incomplete.map(v=>({id:v.id,impact:v.impact}))}),contentType:"application/json"});
  expect.soft(axe.violations.filter(v=>["critical","serious"].includes(v.impact??"")),`${label}: ${JSON.stringify(axe.violations)}`).toEqual([]);
  const small=await page.locator("button,a,input,select,textarea,summary").evaluateAll(elements=>elements.flatMap(el=>{
    const r=el.getBoundingClientRect(),style=getComputedStyle(el);
    if(!r.width||!r.height||style.visibility==="hidden"||el.matches(":disabled")||el.closest("[inert]"))return[];
    // Inline links within prose have the WCAG inline-text exception. Checkbox/radio
    // target is its associated clickable label, not the visible glyph.
    if(el.tagName==="A"&&el.closest("p,.prose")&&style.display==="inline")return[];
    if(el.classList.contains("skip-link"))return[];
    const input=el as HTMLInputElement;
    const target=(input.type==="checkbox"||input.type==="radio")?input.labels?.[0]??el:el;
    const box=target.getBoundingClientRect();
    return box.width<43.5||box.height<43.5?[{tag:el.tagName,text:(el.getAttribute("aria-label")||el.textContent||input.name||"").trim().slice(0,90),width:box.width,height:box.height}]:[];
  }));
  await info.attach(`${label}-targets`,{body:JSON.stringify(small),contentType:"application/json"});
  expect.soft(small,`${label} product control targets`).toEqual([]);
  await capture(page,info,label);
  await page.evaluate(native=>{document.documentElement.dir="rtl";if(!native)document.documentElement.style.zoom="2";},info.project.name==="chromium-native-zoom");
  await overflow(page,info,label);await capture(page,info,`${label}-rtl-200percent`);
  await page.evaluate(()=>{document.documentElement.dir="ltr";document.documentElement.style.zoom="";});
  await page.keyboard.press("Control+Home");
  await page.evaluate(()=>{(document.activeElement as HTMLElement)?.blur();window.scrollTo(0,0);});
  await page.keyboard.press("Tab");
  const entry = await page.evaluate(() => ({ tag: document.activeElement?.tagName, documentHasFocus: document.hasFocus() }));
  // A real Tab can leave the document for browser chrome. Re-enter once only
  // for that observed state; BODY while the document has focus still fails.
  if (entry.tag === "BODY" && !entry.documentHasFocus) await page.keyboard.press("Tab");
  await info.attach(`${label}-focus-entry`, { body: JSON.stringify(entry), contentType: "application/json" });
  const focus=await page.evaluate(()=>{const el=document.activeElement as HTMLElement,r=el.getBoundingClientRect(),s=getComputedStyle(el);const hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return {tag:el.tagName,name:(el.getAttribute("aria-label")||el.textContent||"").slice(0,120),control:el.matches("a[href],button,input,select,textarea,summary,iframe,[tabindex]")&&el.tabIndex>=0&&!el.matches(":disabled"),documentHasFocus:document.hasFocus(),rect:r.toJSON(),viewport:{width:innerWidth,height:innerHeight},hit:hit?{tag:hit.tagName,text:hit.textContent?.slice(0,120),rect:hit.getBoundingClientRect().toJSON()}:null,visible:r.width>0&&r.height>0,unobscured:!!hit&&(el===hit||el.contains(hit)),outline:s.outlineStyle,boxShadow:s.boxShadow};});
  await info.attach(`${label}-focus`,{body:JSON.stringify(focus),contentType:"application/json"});
  expect.soft(focus.control && focus.documentHasFocus, `${label} keyboard enters an application control`).toBe(true);
  expect.soft(focus.visible,`${label} first keyboard focus visible`).toBe(true);
  expect.soft(focus.unobscured,`${label} keyboard focus covered: ${focus.name}`).toBe(true);
  expect.soft(focus.outline!=="none"||focus.boxShadow!=="none",`${label} first keyboard focus styled`).toBe(true);
  if(info.project.name==="chromium-native-zoom")await capture(page,info,`${label}-keyboard-focus`);
}

for(const theme of ["light","dark"] as const){
  test(`@template Active assessment, dialogs, media, voice and HR recovery meet quality gates in ${theme}`,async({page,context,baseURL},info)=>{
    test.setTimeout(240_000);await context.addCookies([{name:"ll_theme",value:theme,url:baseURL!}]);await page.emulateMedia({reducedMotion:"reduce"});
    const learner=await createPerson("LEARNER"),quiz=await assessmentFixture(),video=await tutorFixture(),pdf=await textCourse(learner.id);
    await withDb(db=>db.query("UPDATE lessons SET type='PDF',payload=$2 WHERE id=$1",[pdf.lesson,JSON.stringify({fileUrl:"/demo/fire-safety-guide.pdf"})]));
    await page.route("https://www.youtube.com/iframe_api",route=>route.fulfill({contentType:"application/javascript",body:`window.YT={Player:function(host,opts){this.seekTo=()=>{};this.getCurrentTime=()=>0;this.getPlayerState=()=>2;this.playVideo=()=>{};this.destroy=()=>{};setTimeout(()=>opts.events.onReady(),0)}};window.onYouTubeIframeAPIReady();`}));
    await signIn(page,learner);await page.goto(`/quiz/${quiz}`);await page.getByRole("button",{name:"Start assessment",exact:true}).click();
    await expect(page.getByRole("navigation",{name:"Question navigation",exact:true}).getByRole("button")).toHaveCount(7);
    await expect(page.getByRole("button",{name:"Submit assessment",exact:true})).toBeEnabled();
    await inspect(page,info,`${theme}-active-seven-questions`);
    await page.getByRole("button",{name:"Submit assessment",exact:true}).click();
    const dialog=page.getByRole("dialog",{name:"Submit with unanswered questions?",exact:true});await expect(dialog).toBeVisible();
    await inspect(page,info,`${theme}-assessment-dialog`);await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);await expect(page.getByRole("button",{name:"Submit assessment",exact:true})).toBeFocused();
    await page.getByRole("button",{name:"Submit assessment",exact:true}).click();await page.getByRole("button",{name:"Submit anyway",exact:true}).click();
    await expect(page.getByText("Final result: not passed",{exact:true})).toBeVisible();await inspect(page,info,`${theme}-assessment-result`);
    await page.goto(`/lesson/${pdf.lesson}`);await inspect(page,info,`${theme}-pdf-fallback`);
    await page.goto(`/lesson/${video.lessons[0]}`);
    for(const tab of ["Overview","Transcript","Tutor"]){
      await page.getByRole("tab",{name:tab,exact:true}).click();
      if(tab==="Transcript")await expect(page.getByRole("tabpanel",{name:"Transcript",exact:true}).getByRole("button",{name:/0:10.*Wash hands before serving food/})).toBeVisible();
      if(tab==="Tutor"&&(page.viewportSize()?.width??0)<=390){
        await expect(page.getByRole("button",{name:"Can you summarize this part in two sentences?",exact:true})).toBeVisible();
        const hit=await page.getByRole("button",{name:"Toggle retrieval scope",exact:true}).evaluate(el=>{const r=el.getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return !!hit&&(el===hit||el.contains(hit));});
        expect.soft(hit,"Empty Tutor scope must be tappable before any automatic scrolling").toBe(true);
      }
      await inspect(page,info,`${theme}-video-${tab}`);
    }
    // The keyboard sweep can move the roving tab back to Overview.
    await page.getByRole("tab",{name:"Tutor",exact:true}).click();
    const tutor=page.getByRole("region",{name:"Lesson Tutor",exact:true});
    await tutor.getByRole("textbox",{name:"Ask the tutor",exact:true}).fill("When should I wash hands?");
    await tutor.getByRole("button",{name:"Send",exact:true}).click();
    await expect(tutor.getByText(/Offline demo answer/)).toBeVisible();
    await expect(tutor.getByRole("button",{name:"Explain simpler",exact:true})).toBeEnabled();
    await page.getByRole("tab",{name:"Tutor",exact:true}).click();
    await page.keyboard.press("Tab");
    const scope=tutor.getByRole("button",{name:"Toggle retrieval scope",exact:true});
    await expect(scope).toBeFocused();
    const scopeHit=await scope.evaluate(el=>{const r=el.getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return {rect:r.toJSON(),hit:hit?.textContent,unobscured:!!hit&&(el===hit||el.contains(hit))};});
    await info.attach(`${theme}-active-tutor-scope-focus`,{body:JSON.stringify(scopeHit),contentType:"application/json"});
    expect.soft(scopeHit.unobscured,"Active Tutor scope keyboard focus must stay above its sticky composer").toBe(true);
    await page.keyboard.press("Tab");
    const citation=tutor.getByRole("button",{name:/0:10/}).first();
    await expect(citation).toBeFocused();
    const citationHit=await citation.evaluate(el=>{const r=el.getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return {rect:r.toJSON(),viewport:{width:innerWidth,height:innerHeight},hit:hit?.textContent,unobscured:!!hit&&(el===hit||el.contains(hit))};});
    await info.attach(`${theme}-active-tutor-citation-focus`,{body:JSON.stringify(citationHit),contentType:"application/json"});
    expect.soft(citationHit.unobscured,"Tutor citation keyboard focus must stay above its sticky composer").toBe(true);
    await capture(page,info,`${theme}-active-tutor-citation-focus`,{viewportOnly:true});
    await page.keyboard.press("Shift+Tab");await expect(scope).toBeFocused();
    await inspect(page,info,`${theme}-tutor-answer`);
    let release:()=>void=()=>{};const held=new Promise<void>(resolve=>{release=resolve;});
    await page.route("**/api/hr",async route=>{if(route.request().method()==="GET"){await held;await route.fulfill({status:503,body:"Unavailable"});}else await route.continue();});
    await page.goto("/ask-hr");await inspect(page,info,`${theme}-hr-loading`);release();
    await expect(page.locator("main").getByRole("alert")).toContainText("Conversation history could not load");await inspect(page,info,`${theme}-hr-error`);
    await page.unroute("**/api/hr");await page.reload();
    await page.getByRole("textbox",{name:"Ask the HR assistant",exact:true}).fill("How can I ask HR about annual leave?");await page.getByRole("button",{name:"Send",exact:true}).click();
    await expect(page.getByText(/Offline demo answer/).last()).toBeVisible();
    const hr = page.getByRole("region", { name: "HR Assistant", exact: true });
    await expect(hr.getByRole("status").filter({ hasText: "Responding…" })).toHaveCount(0);
    const helpful = hr.getByRole("button", { name: "Helpful", exact: true });
    await expect(helpful).toBeVisible();
    const hrCitations = hr.locator('a[href^="/policy/"]');
    await expect(hrCitations).toHaveCount(2);
    // Exercise the natural settled scroll position before generic inspection
    // changes it. The actual Tab sequence must clear the sticky composer.
    await hrCitations.first().focus();
    for (const [label, control] of [["citation", hrCitations.nth(1)], ["feedback", helpful]] as const) {
      await page.keyboard.press("Tab"); await expect(control).toBeFocused();
      const focused = await control.evaluate(el => {
        const r = el.getBoundingClientRect(), hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2), style = getComputedStyle(el);
        return { rect: r.toJSON(), viewport: { width: innerWidth, height: innerHeight }, inViewport: r.top >= 0 && r.bottom <= innerHeight, unobscured: !!hit && (el === hit || el.contains(hit)), hit: hit?.tagName, outline: style.outlineStyle, shadow: style.boxShadow };
      });
      await info.attach(`${theme}-hr-${label}-keyboard-focus`, { body: JSON.stringify(focused), contentType: "application/json" });
      expect.soft(focused.inViewport && focused.unobscured, `HR ${label} keyboard focus stays above its composer`).toBe(true);
      expect.soft(focused.outline !== "none" || focused.shadow !== "none", `HR ${label} keyboard focus is styled`).toBe(true);
    }
    await capture(page, info, `${theme}-hr-feedback-keyboard-focus`, { viewportOnly: true });
    await inspect(page,info,`${theme}-hr-answer`);
    await page.goto("/ask-hr/live");await page.getByRole("button",{name:"Start talking",exact:true}).click();
    await expect(page.getByRole("textbox",{name:"Type a message",exact:true})).toBeEnabled();await inspect(page,info,`${theme}-voice-active`);
    await page.getByRole("button",{name:"End conversation",exact:true}).click();await expect(page.getByRole("link",{name:"Continue in text",exact:true})).toBeVisible();await inspect(page,info,`${theme}-voice-ended`);
    // The shared-device password boundary is a distinct visible state, not the ordinary HR page.
    await page.goto("/login");await page.getByLabel("Employee ID",{exact:true}).fill(learner.employeeId);
    await page.getByLabel("Password",{exact:true}).fill(QA_PASSWORD);await page.getByLabel("This is a shared device").check();
    await page.getByRole("button",{name:"Sign in",exact:true}).click();await expect(page).toHaveURL(/\/home$/);
    await page.goto("/ask-hr");await expect(page.getByRole("heading",{name:"Your HR history is private",exact:true})).toBeVisible();
    await inspect(page,info,`${theme}-hr-password-boundary`);
    const password=page.getByLabel("Confirm your password"),verify=page.getByRole("button",{name:"Verify and open history",exact:true});
    await password.focus();await page.keyboard.press("Tab");await expect(verify).toBeFocused();
    await page.keyboard.press("Shift+Tab");await expect(password).toBeFocused();
    const passwordFocus=await password.evaluate(el=>{const r=el.getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2),style=getComputedStyle(el);return{rect:r.toJSON(),viewport:{width:innerWidth,height:innerHeight},unobscured:!!hit&&(el===hit||el.contains(hit)),outline:style.outlineStyle,shadow:style.boxShadow};});
    await info.attach(`${theme}-hr-password-keyboard-focus`,{body:JSON.stringify(passwordFocus),contentType:"application/json"});
    expect.soft(passwordFocus.unobscured,"HR password keyboard focus stays visible").toBe(true);
    expect.soft(passwordFocus.outline!=="none"||passwordFocus.shadow!=="none","HR password focus is styled").toBe(true);
    await capture(page,info,`${theme}-hr-password-keyboard-focus`,{viewportOnly:true});
    await password.fill("wrong-qa-password");await page.keyboard.press("Tab");await page.keyboard.press("Enter");
    await expect(page.getByRole("alert").filter({hasText:"Password is incorrect"})).toBeVisible();await inspect(page,info,`${theme}-hr-password-error`);
    await password.fill(QA_PASSWORD);await verify.click();await expect(password).toHaveCount(0);
    const other=await context.newPage();await signIn(other,learner);await other.close();await page.bringToFront();
    const sessionCheck=page.waitForResponse(response=>new URL(response.url()).pathname==="/api/hr/reauth");
    await page.evaluate(()=>window.dispatchEvent(new Event("focus")));await(await sessionCheck).finished();
    await expect(page.getByText("Checking this session…",{exact:true})).toHaveCount(0);await expect(password).toBeVisible();
    await inspect(page,info,`${theme}-hr-session-changed-boundary`);

  });
  test(`@template Learner templates, long multilingual content and system recovery meet quality gates in ${theme}`,async({page,context,baseURL},info)=>{
    test.setTimeout(240_000);await context.addCookies([{name:"ll_theme",value:theme,url:baseURL!}]);await page.emulateMedia({reducedMotion:"reduce"});
    const learner=await createPerson("LEARNER",{name:"QA محمد शर्मा അഞ്ജലി learner"}),f=await textCourse(learner.id),q=await smallQuiz();
    const path=randomUUID(),ticket=randomUUID(),policy=randomUUID(),oral=randomUUID();
    await withDb(async db=>{
      await db.query("INSERT INTO paths(id,title,description) VALUES($1,'QA quality path','Learn safely العربية हिंदी മലയാളം')",[path]);
      await db.query("INSERT INTO path_courses(id,path_id,course_id) VALUES($1,$2,$3)",[randomUUID(),path,f.course]);
      await db.query("INSERT INTO hr_conversations(id,user_id) VALUES($1,$2)",[ticket,learner.id]);
      await db.query("INSERT INTO hr_tickets(id,conversation_id,user_id,subject) VALUES($1,$1,$2,'QA multilingual help العربية हिंदी മലയാളം')",[ticket,learner.id]);
      await db.query("INSERT INTO hr_ticket_messages(id,ticket_id,author_id,body) VALUES($1,$2,$3,'Please help with the long multilingual question العربية हिंदी മലയാളം')",[randomUUID(),ticket,learner.id]);
      await db.query("INSERT INTO policy_docs(id,title,country,audience,language,version,effective_date,owner,body,status) VALUES($1,'QA quality policy','*','all','en',1,now(),'QA','# Procedure\nAccessible policy body العربية हिंदी മലയാളം','ACTIVE')",[policy]);
      await db.query("INSERT INTO lessons(id,module_id,type,title,payload,sort) VALUES($1,$2,'INTERVIEW','QA oral check',$3,1)",[oral,f.module,JSON.stringify({interview:{questionCount:1,maxMinutes:3,passPct:70}})]);
    });
    await signIn(page,learner);
    const routes=["/home","/learn?view=browse","/learn?view=paths",`/course/${f.course}`,`/lesson/${f.lesson}`,`/lesson/${oral}/interview`,`/path/${path}`,`/quiz/${q.quiz}`,"/drill","/ask-hr","/ask-hr/live",`/ask-hr/tickets/${ticket}`,`/policy/${policy}`,"/inbox","/profile","/privacy-notice","/qa-missing-quality-page"];
    for(let i=0;i<routes.length;i++){await page.goto(routes[i]);await inspect(page,info,`${theme}-learner-${i}`);}
  });
  test(`@template Workspace templates meet quality gates in ${theme}`,async({page,context,baseURL},info)=>{
    test.setTimeout(300_000);await context.addCookies([{name:"ll_theme",value:theme,url:baseURL!}]);await page.emulateMedia({reducedMotion:"reduce"});
    const admin=await createPerson("ADMIN"),manager=await createPerson("MANAGER"),learner=await createPerson("LEARNER",{managerId:manager.id}),f=await textCourse(learner.id),q=await smallQuiz();
    const ticket=randomUUID(),attempt=randomUUID(),policy=randomUUID();
    await withDb(async db=>{
      await db.query("INSERT INTO hr_conversations(id,user_id) VALUES($1,$2)",[ticket,learner.id]);
      await db.query("INSERT INTO hr_tickets(id,conversation_id,user_id,subject) VALUES($1,$1,$2,'QA quality HR request')",[ticket,learner.id]);
      await db.query("INSERT INTO policy_docs(id,title,country,audience,language,version,effective_date,owner,body,status) VALUES($1,$2,'*','all','en',1,now(),'QA','# Procedure\nRead the complete long policy title.','ACTIVE')",[policy,`QA ${"LongUnbrokenPolicyTitle".repeat(8)} العربية हिंदी മലയാളം`]);
      await db.query("INSERT INTO attempts(id,user_id,quiz_id,state,grading_state,served_items,integrity_mode) VALUES($1,$2,$3,'GRADED','FINAL','[]',true)",[attempt,learner.id,q.quiz]);
    });
    await signIn(page,admin);
    const routes=["/admin","/admin/courses",`/admin/courses/${f.course}`,`/admin/courses/${f.course}?view=settings`,"/admin/people","/admin/people?view=import","/admin/people?view=groups","/admin/people?view=rules","/admin/reviews?view=grades","/admin/reviews?view=drafts","/admin/reviews?view=oral",`/admin/corpus?doc=${policy}`,"/admin/corpus?view=publish","/admin/corpus?view=quality","/admin/tickets",`/admin/tickets/${ticket}`,"/admin/integrity",`/admin/integrity/${attempt}`,"/admin/reports","/admin/inbox"];
    for(let i=0;i<routes.length;i++){
      await page.goto(routes[i]);
      if(routes[i]==="/admin/people")await expect(page.locator("main details summary").first()).toBeVisible();
      await inspect(page,info,`${theme}-admin-${i}`);
      if(routes[i]==="/admin/people"){
        const summary=page.locator("main details summary").first();await summary.focus();await page.keyboard.press("Enter");
        await expect(page.getByLabel("Time multiplier (assessment accommodation)")).toBeVisible();
        await inspect(page,info,`${theme}-admin-person-editor`);
      }
    }
    await page.context().clearCookies();await context.addCookies([{name:"ll_theme",value:theme,url:baseURL!}]);await signIn(page,manager);
    for(const [i,url] of ["/team",`/team/${learner.id}`,"/team/reports","/team/inbox"].entries()){await page.goto(url);await inspect(page,info,`${theme}-manager-${i}`);}
    await page.goto(`/team/${learner.id}`);await page.getByRole("button",{name:"Issue password reset code",exact:true}).click();await inspect(page,info,`${theme}-manager-reset-code`);
    // Retained legacy display route is read-only. This synthetic code is not an
    // activation secret; actual reset issuance/consumption is tested separately.
    await page.goto(`/team/${learner.id}/reset-code?code=QA-DISPLAY-ONLY`);await inspect(page,info,`${theme}-legacy-reset-route`);
  });
  test(`@template Authentication templates meet quality gates in ${theme}`,async({page,context,baseURL},info)=>{
    test.setTimeout(120_000);await context.addCookies([{name:"ll_theme",value:theme,url:baseURL!}]);await page.emulateMedia({reducedMotion:"reduce"});
    await page.goto("/login");await inspect(page,info,`${theme}-login`);await page.goto("/activate");await inspect(page,info,`${theme}-activate`);
    for(const setup of [false,true]){
      const admin=await createPerson("ADMIN",{mfaSetup:setup});await page.context().clearCookies();await context.addCookies([{name:"ll_theme",value:theme,url:baseURL!}]);await page.goto("/login");
      await page.getByLabel("Employee ID",{exact:true}).fill(admin.employeeId);await page.getByLabel("Password",{exact:true}).fill(QA_PASSWORD);await page.getByRole("button",{name:"Sign in",exact:true}).click();
      await expect(page).toHaveURL(setup?/\/login\/mfa-setup$/:/\/login\/mfa$/);await inspect(page,info,`${theme}-${setup?"mfa-setup":"mfa"}`);
    }
  });
}
