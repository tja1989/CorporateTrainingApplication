/** Real local service/UI regressions. Database barriers control interleavings;
 * they never perform the completion action or copy progress into a new cycle. */
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { expect, type Browser, type BrowserContext } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createPerson, signIn, withDb } from '../e2e/support';
import { textCourse } from '../e2e/qualification-fixtures';
import { enrollUser } from '../lib/lms/rules';

type RecordStep = (step: string, data: unknown) => void;
const lockNamespace = 71321;

async function faultConnection() {
  if (!new URL(process.env.DATABASE_URL!).pathname.startsWith('/welearn_service_')) throw new Error('Concurrency barriers require a disposable service DB');
  const control = new Client({ connectionString: process.env.DATABASE_URL, application_name: 'qa-concurrency-control' });
  await control.connect();
  return control;
}

async function gate(control: Client, table: string, user: string) {
  const name = `qa_gate_${randomUUID().replaceAll('-', '')}`, key = Math.floor(Math.random() * 1_000_000_000);
  await control.query(`CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.user_id='${user}' THEN PERFORM pg_advisory_lock(${lockNamespace},${key}); PERFORM pg_advisory_unlock(${lockNamespace},${key}); END IF; RETURN NEW; END $$`);
  await control.query(`CREATE TRIGGER ${name} BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION ${name}()`);
  await control.query('SELECT pg_advisory_lock($1,$2)', [lockNamespace, key]);
  return {
    release: () => control.query('SELECT pg_advisory_unlock($1,$2)', [lockNamespace, key]),
    wait: () => expect.poll(async () => (await control.query("SELECT count(*)::int n FROM pg_locks WHERE locktype='advisory' AND classid=$1 AND objid=$2 AND NOT granted", [lockNamespace, key])).rows[0].n, { timeout: 15000 }).toBe(1),
    drop: async () => { await control.query(`DROP TRIGGER IF EXISTS ${name} ON ${table}`); await control.query(`DROP FUNCTION IF EXISTS ${name}()`); },
  };
}
async function contexts(browser: Browser, baseURL: string) {
  return browser.newContext({ baseURL, viewport: { width: 390, height: 844 } });
}

export async function runCompletionConcurrency(browser: Browser, baseURL: string, out: string, record: RecordStep, stopRuntime: () => Promise<void>) {
  const selected = process.env.QA_CONCURRENCY_CASE;
  if (!selected || selected === 'pool') await saturation();
  if (!selected || selected === 'rollback') await rollback();
  if (!selected || selected === 'heartbeat') await heartbeat();
  if (!selected || selected === 'receipt') await receiptBoundary();

  async function saturation() {
    const person = await createPerson('LEARNER'), f = await textCourse(person.id, { certificate: true });
    const context = await contexts(browser, baseURL), control = await faultConnection();
    await context.tracing.start({ screenshots: true, snapshots: true });
    const pages = [await context.newPage()], allContexts = [context]; await signIn(pages[0], person);
    const storageState = await context.storageState();
    // Separate browser network contexts avoid HTTP/1's six-socket origin limit.
    for (let i = 1; i < 10; i++) { const next = await browser.newContext({ baseURL, storageState, viewport: { width: 390, height: 844 } }); allContexts.push(next); pages.push(await next.newPage()); }
    await Promise.all(pages.map(page => page.goto(`/lesson/${f.lesson}`)));
    const barrier = await gate(control, 'completion_records', person.id);
    const clicks: Promise<unknown>[] = [];
    let passed = false;
    try {
      const click = (index: number) => pages[index].getByRole('button', { name: 'Mark complete', exact: true }).click({ timeout: 25000 }).then(() => expect(pages[index].getByText('Lesson complete', { exact: true })).toBeVisible({ timeout: 15000 }));
      clicks.push(click(0)); clicks[0].catch(() => {}); await barrier.wait();
      for (let i = 1; i < 10; i++) { const pending = click(i); pending.catch(() => {}); clicks.push(pending); }
      await expect.poll(async () => (await control.query("SELECT count(*)::int n FROM pg_locks l JOIN pg_stat_activity a ON a.pid=l.pid WHERE l.locktype='advisory' AND NOT l.granted AND a.datname=current_database()", [])).rows[0].n, { timeout: 15000 }).toBe(10);
      record('pool saturated with one completion and nine course-lock waiters', { person: person.id, course: f.course, poolLimit: 10 });
      await barrier.release();
      await expect.poll(async () => (await control.query('SELECT count(*)::int n FROM certificates WHERE user_id=$1', [person.id])).rows[0].n, { timeout: 8000 }).toBe(1);
      await Promise.all(clicks);
      const persisted = (await control.query("SELECT (SELECT count(*)::int FROM completion_records WHERE user_id=$1) completions,(SELECT count(*)::int FROM certificates WHERE user_id=$1) certificates,(SELECT count(*)::int FROM notifications WHERE user_id=$1 AND kind='course_completed') notifications,(SELECT count(*)::int FROM badges WHERE user_id=$1 AND badge='first_course') badges,(SELECT sum(amount)::int FROM points_ledger WHERE user_id=$1) points", [person.id])).rows[0];
      expect(persisted).toEqual({ completions: 1, certificates: 1, notifications: 1, badges: 1, points: 60 });
      await pages[0].screenshot({ path: `${out}/concurrency-complete.png`, fullPage: true });
      record('saturated pool completes once with atomic awards and notification', persisted); passed = true;
    } finally {
      await barrier.release();
      // Kill only this disposable service process on a red deadlock before
      // removing barriers; releasing one waiter alone can recreate saturation.
      if (!passed) await stopRuntime();
      await context.tracing.stop({ path: `${out}/concurrency-pool.zip` }); await Promise.all(allContexts.map(context => context.close())); await Promise.allSettled(clicks); await barrier.drop(); await control.end();
    }
  }

  async function rollback() {
    const person = await createPerson('LEARNER'), f = await textCourse(person.id, { certificate: true });
    const context = await contexts(browser, baseURL), control = await faultConnection(), page = await context.newPage();
    await context.tracing.start({ screenshots: true, snapshots: true });
    const name = `qa_rollback_${randomUUID().replaceAll('-', '')}`, email = `${person.employeeId.toLowerCase()}@example.invalid`;
    await control.query("UPDATE users SET email=$2 WHERE id=$1", [person.id, email]);
    try {
      await signIn(page, person); await page.goto(`/lesson/${f.lesson}`);
      // A deferred failure happens at COMMIT, after every helper was invoked.
      await control.query(`CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.user_id='${person.id}' THEN RAISE EXCEPTION 'QA forced completion rollback'; END IF; RETURN NEW; END $$`);
      await control.query(`CREATE CONSTRAINT TRIGGER ${name} AFTER INSERT ON completion_records DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ${name}()`);
      const response = page.waitForResponse(r => r.request().method() === 'POST' && r.url().includes(`/lesson/${f.lesson}`));
      await page.getByRole('button', { name: 'Mark complete', exact: true }).click(); await response;
      const persisted = (await control.query("SELECT (SELECT count(*)::int FROM completion_records WHERE user_id=$1) completions,(SELECT count(*)::int FROM certificates WHERE user_id=$1) certificates,(SELECT count(*)::int FROM notifications WHERE user_id=$1 AND kind='course_completed') notifications,(SELECT count(*)::int FROM badges WHERE user_id=$1) badges,(SELECT count(*)::int FROM points_ledger WHERE user_id=$1) points,(SELECT count(*)::int FROM lesson_progress WHERE user_id=$1 AND status='COMPLETED') lessons", [person.id])).rows[0];
      const prematureEmail = readFileSync(`${out}/server.log`, 'utf8').includes(email);
      record('forced rollback persistence', { ...persisted, prematureEmail });
      expect(prematureEmail).toBe(false);
      expect(persisted).toEqual({ completions: 0, certificates: 0, notifications: 0, badges: 0, points: 0, lessons: 0 });
      await control.query(`DROP TRIGGER ${name} ON completion_records`); await control.query(`DROP FUNCTION ${name}()`);
      await page.goto(`/lesson/${f.lesson}`); await page.getByRole('button', { name: 'Mark complete', exact: true }).click(); await expect(page.getByText('Lesson complete', { exact: true })).toBeVisible();
      await page.goto('/inbox'); await expect(page.getByText('Course completed 🎉', { exact: true })).toBeVisible();
      await expect.poll(() => readFileSync(`${out}/server.log`, 'utf8').split(email).length - 1).toBe(1);
      record('rollback recovery produces one real completion notification and one post-commit console email', { person: person.id, course: f.course });
    } finally {
      await context.tracing.stop({ path: `${out}/concurrency-rollback.zip` }); await context.close();
      await control.query(`DROP TRIGGER IF EXISTS ${name} ON completion_records`); await control.query(`DROP FUNCTION IF EXISTS ${name}()`); await control.end();
    }
  }

  async function heartbeat() {
    const person = await createPerson('LEARNER'), f = await textCourse(person.id, { certificate: true }), video = randomUUID();
    await withDb(async db => {
      await db.query("INSERT INTO videos(id,youtube_id,title,duration_sec,ingestion_status) VALUES($1,'QAheartbeat','QA short video',10,'READY')", [video]);
      await db.query("UPDATE lessons SET type='VIDEO',payload=$2 WHERE id=$1", [f.lesson, JSON.stringify({ videoId: video })]);
    });
    const context = await contexts(browser, baseURL), control = await faultConnection(), page = await context.newPage();
    await context.tracing.start({ screenshots: true, snapshots: true });
    await page.route('https://www.youtube.com/iframe_api', route => route.fulfill({ contentType: 'application/javascript', body: `window.YT={Player:function(host,opts){let playing=false,pos=0;const play=document.createElement('button'),pause=document.createElement('button');play.textContent='Play test video';pause.textContent='Pause test video';play.onclick=()=>playing=true;pause.onclick=()=>playing=false;host.append(play,pause);this.getPlayerState=()=>playing?1:2;this.getCurrentTime=()=>{const current=pos;pos=Math.min(9,pos+5);return current};this.seekTo=p=>pos=p;this.playVideo=()=>playing=true;this.destroy=()=>{};setTimeout(()=>opts.events.onReady(),0)}};window.onYouTubeIframeAPIReady();` }));
    let barrier: Awaited<ReturnType<typeof gate>> | undefined, renewal: Promise<number> | undefined;
    try {
      await signIn(page, person); await page.goto(`/lesson/${f.lesson}`); await page.getByRole('button', { name: 'Play test video', exact: true }).click();
      await expect(page.getByText('Lesson complete', { exact: true })).toBeVisible({ timeout: 20000 }); await page.getByRole('button', { name: 'Pause test video', exact: true }).click();
      const original = (await control.query('SELECT * FROM certificates WHERE user_id=$1', [person.id])).rows[0];
      barrier = await gate(control, 'lesson_progress', person.id);
      const response = page.waitForResponse(r => r.url().endsWith('/api/progress'), { timeout: 25000 });
      await page.getByRole('button', { name: 'Play test video', exact: true }).click(); await barrier.wait();
      renewal = enrollUser(person.id, { type: 'course', id: f.course }, 'recert', original.id, new Date(original.expires_at)); renewal.catch(() => {});
      // Old code commits renewal while heartbeat is paused. Fixed code waits on
      // the shared learning lock. Either observation proves the interleaving.
      await expect.poll(async () => {
        const r = (await control.query("SELECT (SELECT count(*)::int FROM enrollments WHERE user_id=$1 AND source='recert') renewed,(SELECT count(*)::int FROM pg_locks l JOIN pg_stat_activity a ON a.pid=l.pid WHERE l.locktype='advisory' AND NOT l.granted AND a.datname=current_database()) waiting", [person.id])).rows[0];
        return r.renewed === 1 || r.waiting >= 2;
      }, { timeout: 15000 }).toBe(true);
      await page.getByRole('button', { name: 'Pause test video', exact: true }).click(); await barrier.release(); await response; expect(await renewal).toBe(1);
      const afterReset = (await control.query('SELECT status,watched_buckets,last_position_sec FROM lesson_progress WHERE user_id=$1 AND lesson_id=$2', [person.id, f.lesson])).rows[0];
      await barrier.drop(); barrier = undefined;
      await page.reload(); const next = page.waitForResponse(r => r.url().endsWith('/api/progress'));
      await page.getByRole('button', { name: 'Play test video', exact: true }).click(); await next; await page.getByRole('button', { name: 'Pause test video', exact: true }).click();
      const afterNext = (await control.query('SELECT status,watched_buckets FROM lesson_progress WHERE user_id=$1 AND lesson_id=$2', [person.id, f.lesson])).rows[0];
      const certificates = (await control.query('SELECT * FROM certificates WHERE user_id=$1 ORDER BY issued_at', [person.id])).rows;
      record('interleaved real heartbeat and renewal', { person: person.id, course: f.course, afterReset, afterNext, certificates: certificates.length });
      expect(afterReset).toEqual({ status: 'NOT_STARTED', watched_buckets: [], last_position_sec: 0 });
      expect(afterNext.status).toBe('IN_PROGRESS'); expect(afterNext.watched_buckets).toHaveLength(1);
      expect(certificates).toHaveLength(1); expect(certificates[0]).toEqual(original);
      await page.screenshot({ path: `${out}/concurrency-renewal.png`, fullPage: true });
    } finally {
      if (barrier) { await barrier.release(); await barrier.drop(); }
      await renewal?.catch(() => {}); await context.tracing.stop({ path: `${out}/concurrency-heartbeat.zip` }); await context.close(); await control.end();
    }
  }
  async function receiptBoundary() {
    const person = await createPerson('LEARNER'), f = await textCourse(person.id, { certificate: true }), video = randomUUID();
    await withDb(async db => {
      await db.query("INSERT INTO videos(id,youtube_id,title,duration_sec,ingestion_status) VALUES($1,'QAsingle','QA one bucket video',4,'READY')", [video]);
      await db.query("UPDATE lessons SET type='VIDEO',payload=$2 WHERE id=$1", [f.lesson, JSON.stringify({ videoId: video })]);
    });
    const context = await contexts(browser, baseURL), control = await faultConnection(), page = await context.newPage();
    await context.tracing.start({ screenshots: true, snapshots: true });
    await page.route('https://www.youtube.com/iframe_api', route => route.fulfill({ contentType: 'application/javascript', body: `window.YT={Player:function(host,opts){let playing=false;const play=document.createElement('button'),pause=document.createElement('button');play.textContent='Play test video';pause.textContent='Pause test video';play.onclick=()=>playing=true;pause.onclick=()=>playing=false;host.append(play,pause);this.getPlayerState=()=>playing?1:2;this.getCurrentTime=()=>3;this.seekTo=()=>{};this.playVideo=()=>playing=true;this.destroy=()=>{};setTimeout(()=>opts.events.onReady(),0)}};window.onYouTubeIframeAPIReady();` }));
    let renewal: Promise<number> | undefined;
    try {
      await signIn(page, person); await page.goto(`/lesson/${f.lesson}`); await page.getByRole('button', { name: 'Play test video', exact: true }).click();
      await expect(page.getByText('Lesson complete', { exact: true })).toBeVisible({ timeout: 15000 }); await page.getByRole('button', { name: 'Pause test video', exact: true }).click();
      const original = (await control.query('SELECT * FROM certificates WHERE user_id=$1', [person.id])).rows[0];
      await control.query('BEGIN'); await control.query('LOCK TABLE lessons IN ACCESS EXCLUSIVE MODE');
      const waiting = async () => {
        // Statistics snapshots persist within this control transaction. Refresh
        // them so the barrier observes both newly blocked requests.
        await control.query('SELECT pg_stat_clear_snapshot()');
        return (await control.query("SELECT count(*)::int n FROM pg_stat_activity WHERE datname=current_database() AND wait_event='relation' AND pid<>pg_backend_pid()")).rows[0].n;
      };
      const response = page.waitForResponse(r => r.url().endsWith('/api/progress'), { timeout: 30000 });
      await page.getByRole('button', { name: 'Play test video', exact: true }).click();
      await expect.poll(waiting, { timeout: 15000 }).toBe(1);
      renewal = enrollUser(person.id, { type: 'course', id: f.course }, 'recert', original.id, new Date(original.expires_at)); renewal.catch(() => {});
      // Renewal holds the course lock while both lookups wait on this table.
      // Releasing it makes the older receipt reach the new cycle afterwards.
      try { await expect.poll(waiting, { timeout: 15000 }).toBe(2); } catch (error) { record('receipt barrier diagnostics', (await control.query("SELECT pid,application_name,state,wait_event_type,wait_event,query FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid()")).rows); throw error; }
      await page.getByRole('button', { name: 'Pause test video', exact: true }).click(); await control.query('COMMIT');
      const result = await response; expect(await renewal).toBe(1);
      const progress = (await control.query('SELECT status,watched_buckets FROM lesson_progress WHERE user_id=$1 AND lesson_id=$2', [person.id, f.lesson])).rows[0];
      const count = (await control.query('SELECT count(*)::int n FROM certificates WHERE user_id=$1', [person.id])).rows[0].n;
      record('one-bucket pre-renewal receipt cannot credit new cycle', { status: result.status(), progress, certificates: count, person: person.id, course: f.course });
      expect(result.status()).toBe(409); expect(progress).toEqual({ status: 'NOT_STARTED', watched_buckets: [] }); expect(count).toBe(1);
      await page.reload(); await page.getByRole('button', { name: 'Play test video', exact: true }).click(); await expect(page.getByText('Lesson complete', { exact: true })).toBeVisible({ timeout: 15000 });
      await page.getByRole('button', { name: 'Pause test video', exact: true }).click();
      expect((await control.query('SELECT count(*)::int n FROM certificates WHERE user_id=$1', [person.id])).rows[0].n).toBe(2);
      record('fresh one-bucket playback completes renewed cycle normally', { person: person.id, certificates: 2 });
    } finally {
      await control.query('ROLLBACK'); await renewal?.catch(() => {}); await context.tracing.stop({ path: `${out}/concurrency-receipt.zip` }); await context.close(); await control.end();
    }
  }

}
