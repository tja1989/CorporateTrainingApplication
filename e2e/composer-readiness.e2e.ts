import { test, expect, type Browser, type BrowserContext, type TestInfo } from '@playwright/test';
import { createPerson, signIn, withDb, capture } from './support';

async function delayedComposer(browser: Browser, authenticated: BrowserContext, baseURL: string, info: TestInfo) {
  const context = await browser.newContext({
    storageState: await authenticated.storageState(), baseURL, ignoreHTTPSErrors: true,
    viewport: info.project.use.viewport, hasTouch: info.project.use.hasTouch,
  });
  context.setDefaultTimeout(10_000); context.setDefaultNavigationTimeout(30_000);
  let release = () => {};
  const scripts = new Promise<void>(resolve => { release = resolve; });
  await context.route(/\/_next\/static\/.*\.js(?:\?.*)?$/, async route => { await scripts; await route.continue(); });
  const page = await context.newPage(), errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  return { context, page, release, errors };
}

test('@core HR composer waits for hydration and history, preserves failed questions and recovers from unavailable history', async ({ page, browser, baseURL }, info) => {
  const learner = await createPerson('LEARNER'); await signIn(page, learner);
  const delayed = await delayedComposer(browser, page.context(), baseURL!, info);
  let releaseHistory = () => {};
  const historyGate = new Promise<void>(resolve => { releaseHistory = resolve; });
  let historyStarted = () => {};
  const historyRequest = new Promise<void>(resolve => { historyStarted = resolve; });
  let failHistory = false, failQuestion = true;
  await delayed.context.route('**/api/hr', async route => {
    if (route.request().method() === 'GET') {
      historyStarted(); await historyGate;
      if (failHistory) return route.fulfill({ status: 503, body: 'QA history unavailable' });
    } else if (failQuestion) return route.abort('failed');
    await route.continue();
  });
  const p = delayed.page, input = p.getByRole('textbox', { name: 'Ask the HR assistant', exact: true });
  try {
    await p.goto('/ask-hr', { waitUntil: 'commit' });
    await expect(input).toBeDisabled();
    await expect(p.getByRole('status').filter({ hasText: 'Loading conversation' })).toBeVisible();
    delayed.release(); await historyRequest;
    await expect(input).toBeDisabled();
    releaseHistory(); await expect(input).toBeEnabled();
    const question = 'What is the company relocation allowance?';
    await input.fill(question); await p.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(p.locator('main').getByRole('alert')).toContainText('Your question is kept below');
    await expect(input).toHaveValue(question);
    failQuestion = false;
    const response = p.waitForResponse(r => r.url().endsWith('/api/hr') && r.request().method() === 'POST');
    await p.getByRole('button', { name: 'Send', exact: true }).click(); expect((await response).status()).toBe(200);
    await expect(p.getByRole('button', { name: 'Talk to a person', exact: true })).toBeEnabled();
    await expect(input).toHaveValue('');
    await expect.poll(() => withDb(async db => (await db.query("SELECT count(*)::int n FROM hr_messages m JOIN hr_conversations c ON c.id=m.conversation_id WHERE c.user_id=$1 AND m.role='user' AND m.content=$2", [learner.id, question])).rows[0].n)).toBe(1);
    failHistory = true; await p.reload();
    await expect(p.locator('main').getByRole('alert')).toContainText('Conversation history could not load');
    await expect(input).toBeEnabled();
    const second = 'Please explain the policy on training support.';
    await input.fill(second); await p.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(p.getByRole('button', { name: 'Talk to a person', exact: true })).toBeEnabled();
    await expect.poll(() => withDb(async db => (await db.query("SELECT count(*)::int n FROM hr_messages m JOIN hr_conversations c ON c.id=m.conversation_id WHERE c.user_id=$1 AND m.role='user'", [learner.id])).rows[0].n)).toBe(2);
    failHistory = false; await p.reload();
    await expect(p.getByRole('region', { name: 'HR Assistant', exact: true })).toContainText(second);
    await expect(p.locator('main').getByRole('alert')).toHaveCount(0);
    expect(delayed.errors).toEqual([]); await capture(p, info, 'hr-composer-recovered');
  } finally { delayed.release(); releaseHistory(); await delayed.context.close(); }
});

test('@core Ask Reports composers wait for hydration and retain questions through failed and successful requests in both workspaces', async ({ page, browser, baseURL }, info) => {
  for (const role of ['MANAGER', 'ADMIN'] as const) {
    const person = await createPerson(role); await page.context().clearCookies(); await signIn(page, person);
    const delayed = await delayedComposer(browser, page.context(), baseURL!, info);
    const p = delayed.page, input = p.getByRole('textbox', { name: 'Ask reports', exact: true });
    let fail = true;
    await delayed.context.route('**/api/reports/ask', route => fail ? route.fulfill({ status: 503, body: 'QA report unavailable' }) : route.continue());
    try {
      await p.goto(role === 'ADMIN' ? '/admin/reports' : '/team/reports', { waitUntil: 'commit' });
      await expect(input).toBeDisabled();
      await expect(p.getByRole('status').filter({ hasText: 'Loading report assistant' })).toBeVisible();
      delayed.release(); await expect(input).toBeEnabled();
      const question = 'Show overdue training'; await input.fill(question);
      await p.getByRole('button', { name: 'Ask', exact: true }).click();
      await expect(p.locator('main').getByRole('alert')).toContainText('The report could not be interpreted');
      await expect(input).toHaveValue(question);
      fail = false;
      const response = p.waitForResponse(r => r.url().endsWith('/api/reports/ask') && r.request().method() === 'POST');
      await p.getByRole('button', { name: 'Ask', exact: true }).click(); expect((await response).status()).toBe(200);
      await expect(p.getByRole('region', { name: 'Ask Reports table', exact: true })).toBeVisible();
      await expect(input).toHaveValue(question); await expect(p.locator('main').getByRole('alert')).toHaveCount(0);
      expect(delayed.errors).toEqual([]); await capture(p, info, `${role.toLowerCase()}-composer-recovered`);
    } finally { delayed.release(); await delayed.context.close(); }
  }
});
