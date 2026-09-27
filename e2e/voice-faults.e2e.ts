import { test, expect, type Page, type WebSocketRoute } from "@playwright/test";
import { createPerson, signIn, withDb } from "./support";

const pageErrors = new WeakMap<Page, string[]>();
test.afterEach(async ({ page }, info) => {
  await info.attach("audio-diagnostics", { body: JSON.stringify(await page.evaluate(() => ({
    audio: (window as unknown as { qaAudio: unknown }).qaAudio ?? null,
    calls: (window as unknown as { qaMicCalls: number }).qaMicCalls,
    accesses: (window as unknown as { qaMicAccesses: number }).qaMicAccesses,
    fn: navigator.mediaDevices.getUserMedia.toString(),
  }))), contentType: "application/json" });
  expect(pageErrors.get(page) ?? [], "Configured transport fixture must hydrate without page errors").toEqual([]);
});

/** Only the SSR configuration flag and provider/platform transport are injected.
 * Consent, session creation, client hook, event APIs and transcript storage remain real.
 * These contract tests do not qualify a live provider or physical microphone. */
async function configured(page: Page) {
  const errors: string[] = []; pageErrors.set(page, errors); page.on("pageerror", error => errors.push(error.message));
  await page.route("**/ask-hr/live", async route=>{
    if (route.request().resourceType() !== "document" || !route.request().isNavigationRequest()) { await route.continue(); return; }
    const response=await route.fetch();
    const original=await response.text();
    // Update both HTML and Flight props so the configuration fixture does not
    // introduce a React hydration mismatch unrelated to the transport fault.
    const body=original.replaceAll('\\"configured\\":false','\\"configured\\":true')
      .replace(/<p class="mb-3 text-xs text-muted">Offline demo mode[^<]*<\/p>/, "")
      .replace(/(<button[^>]*>Start talking<\/button>)/, button => button + button
        .replace("bg-primary text-primary-fg hover:bg-primary-hover", "bg-surface border border-border text-foreground hover:border-foreground hover:bg-surface-2")
        .replace("Start talking", "Start with typing"));
    expect(body).not.toBe(original);
    await route.fulfill({response,body});
  });
}
async function pendingMicrophone(page: Page) {
  await page.evaluate(()=>{
    const w=window as unknown as {qaMicCalls:number;qaStops:number;qaReleaseMic:()=>void;qaMicAccesses:number};
    w.qaMicCalls=0;w.qaStops=0;w.qaMicAccesses=0;
    const log:unknown[]=[];(window as unknown as {qaAudio:unknown[]}).qaAudio=log;
    const resume=AudioContext.prototype.resume,close=AudioContext.prototype.close;
    AudioContext.prototype.resume=function(){const stack=new Error().stack;log.push({event:"resume",state:this.state,stack});return resume.call(this).catch(error=>{log.push({event:"resume-error",state:this.state,message:error.message,stack});throw error;});};
    AudioContext.prototype.close=function(){log.push({event:"close",state:this.state,stack:new Error().stack});return close.call(this);};
    // WebKit may refresh navigator.mediaDevices between evaluation and the gesture.
    // Pin the explicit platform fixture so the action cannot fall through to a real prompt.
    const mediaDevices=navigator.mediaDevices;
    Object.defineProperty(navigator,"mediaDevices",{configurable:true,value:mediaDevices});
    Object.defineProperty(mediaDevices,"getUserMedia",{configurable:true,get:()=>{w.qaMicAccesses++;return ()=>{
      w.qaMicCalls++;
      return new Promise<MediaStream>(resolve=>{w.qaReleaseMic=()=>{
        const ctx=new AudioContext(),dest=ctx.createMediaStreamDestination();
        const track=dest.stream.getAudioTracks()[0],stop=track.stop.bind(track);
        track.stop=()=>{w.qaStops++;stop();void ctx.close();};
        resolve(dest.stream);
      };});
    };}});
  });
}

test("@core Configured voice microphone denial recovers through typed fallback and persists the conversation", async ({page})=>{
  const learner=await createPerson("LEARNER");
  await page.addInitScript(()=>{
    Object.defineProperty(navigator.mediaDevices,"getUserMedia",{configurable:true,value:()=>Promise.reject(new DOMException("QA microphone denied","NotAllowedError"))});
  });
  await signIn(page,learner);await page.waitForLoadState("networkidle");await configured(page);await page.goto("/ask-hr/live");
  await expect(page.getByRole("button",{name:"Start with typing",exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Start talking",exact:true}).click();
  await expect(page.getByText(/Microphone unavailable or skipped/)).toBeVisible();
  await page.getByRole("textbox",{name:"Type a message",exact:true}).fill("QA denied microphone typed continuation");
  await page.getByRole("button",{name:"Send",exact:true}).click();
  await expect(page.getByText("QA denied microphone typed continuation",{exact:true})).toBeVisible();
  await page.getByRole("button",{name:"End conversation",exact:true}).click();
  await page.getByRole("link",{name:"Continue in text",exact:true}).click();
  await expect(page).toHaveURL(/\/ask-hr$/);
  await expect(page.getByText("QA denied microphone typed continuation",{exact:true})).toBeVisible();
  await page.reload();await expect(page.getByText("QA denied microphone typed continuation",{exact:true})).toBeVisible();
  expect(await withDb(async db=>(await db.query("SELECT count(*)::int n FROM hr_messages m JOIN hr_conversations c ON c.id=m.conversation_id WHERE c.user_id=$1 AND m.content=$2",[learner.id,"QA denied microphone typed continuation"])).rows[0].n)).toBe(1);
});

test("@core Ending a pending microphone request prevents session creation and stops a late stream", async ({page})=>{
  const learner=await createPerson("LEARNER");
  let sessions=0;page.on("request",r=>{if(r.url().endsWith("/api/live/hr/session"))sessions++;});
  await signIn(page,learner);await page.waitForLoadState("networkidle");await configured(page);await page.goto("/ask-hr/live");
  await pendingMicrophone(page);
  expect(await page.evaluate(()=>navigator.mediaDevices.getUserMedia.toString())).toContain("qaMicCalls");
  await page.getByRole("button",{name:"Start talking",exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>(window as unknown as {qaMicCalls:number}).qaMicCalls)).toBe(1);
  await page.getByRole("button",{name:"End conversation",exact:true}).click();
  await expect(page.getByRole("button",{name:"Talk again",exact:true})).toBeVisible();
  await page.evaluate(()=>(window as unknown as {qaReleaseMic:()=>void}).qaReleaseMic());
  await expect.poll(()=>page.evaluate(()=>(window as unknown as {qaStops:number}).qaStops)).toBe(1);
  expect(sessions).toBe(0);
});

test("@core Configured voice reconnects with the same session, preserves typed turns and ends its provider connection", async ({page})=>{
  const learner=await createPerson("LEARNER");
  let connections=0,closed=0;let first:WebSocketRoute|undefined;const resumeBodies:unknown[]=[];
  await page.route("**/api/live/hr/session",async route=>{
    const body=route.request().postDataJSON();resumeBodies.push(body);
    const response=await route.fetch();const data=await response.json();
    await route.fulfill({response,json:{...data,mock:false,token:"qa-local-transport-only",model:"gemini-2.5-flash-native-audio-latest",warning:null}});
  });
  await page.routeWebSocket(/generativelanguage\.googleapis\.com/,ws=>{
    connections++;first??=ws;ws.onClose(()=>closed++);
    ws.onMessage(message=>{
      const data=JSON.parse(String(message));
      if(data.setup) ws.send(JSON.stringify({setupComplete:{}}));
      if(data.clientContent){
        ws.send(JSON.stringify({sessionResumptionUpdate:{resumable:true,newHandle:"qa-resume-handle"}}));
        ws.send(JSON.stringify({serverContent:{outputTranscription:{text:"QA transport response."},turnComplete:true}}));
      }
    });
  });
  await signIn(page,learner);await page.waitForLoadState("networkidle");await configured(page);await page.goto("/ask-hr/live");
  await page.getByRole("button",{name:"Start with typing",exact:true}).click();
  await expect(page.getByRole("textbox",{name:"Type a message",exact:true})).toBeEnabled();
  await expect(page.getByText("QA transport response.",{exact:true})).toBeVisible();
  await page.getByRole("textbox",{name:"Type a message",exact:true}).fill("QA reconnect retained question");
  await page.getByRole("button",{name:"Send",exact:true}).click();
  await expect(page.getByText("QA reconnect retained question",{exact:true})).toBeVisible();
  first!.close({code:1011,reason:"QA provider interruption"});
  await expect.poll(()=>connections).toBe(2);
  await expect(page.getByRole("textbox",{name:"Type a message",exact:true})).toBeEnabled();
  expect(resumeBodies[1]).toMatchObject({resumeHandle:"qa-resume-handle"});
  await page.getByRole("button",{name:"End conversation",exact:true}).click();
  await expect(page.getByRole("button",{name:"Talk again",exact:true})).toBeVisible();
  await expect.poll(()=>closed).toBeGreaterThanOrEqual(1);
  await page.getByRole("link",{name:"Continue in text",exact:true}).click();
  await expect(page).toHaveURL(/\/ask-hr$/);
  await expect(page.getByText("QA reconnect retained question",{exact:true})).toBeVisible();
  await page.reload();await expect(page.getByText("QA reconnect retained question",{exact:true})).toBeVisible();
  expect(await withDb(async db=>(await db.query("SELECT count(*)::int n FROM hr_conversations WHERE user_id=$1",[learner.id])).rows[0].n)).toBe(1);
});


test("@core Offline voice return to text opens the saved conversation before refresh",async({page})=>{
  const learner=await createPerson("LEARNER");await signIn(page,learner);await page.goto("/ask-hr/live");
  await page.getByRole("button",{name:"Start talking",exact:true}).click();
  await page.getByRole("textbox",{name:"Type a message",exact:true}).fill("QA ordinary voice return");await page.getByRole("button",{name:"Send",exact:true}).click();
  await expect(page.getByText("QA ordinary voice return",{exact:true})).toBeVisible();
  await page.getByRole("button",{name:"End conversation",exact:true}).click();
  await page.getByRole("link",{name:"Continue in text",exact:true}).click();await expect(page).toHaveURL(/\/ask-hr$/);
  await page.reload();await expect(page.getByText("QA ordinary voice return",{exact:true})).toBeVisible();
});
