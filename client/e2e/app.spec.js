import { test, expect } from '@playwright/test';

const unique = () => `${Date.now()}${Math.floor(Math.random() * 1000)}`;
const PASSWORD = 'Passw0rd!x';

// Fail a test if the page logs a JavaScript error. Network errors for expected 4xx responses are ignored.
function watchConsole(page) {
  const problems = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/status of 4\d\d/.test(m.text())) problems.push(`console: ${m.text()}`);
  });
  return problems;
}

async function register(page, name = 'Test Person') {
  const email = `user${unique()}@example.com`;
  await page.goto('/register');
  await page.getByLabel('Name').fill(name);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  return email;
}

async function addSite(page, name = 'My Shop') {
  await page.getByLabel('Name').fill(name);
  await page.getByRole('button', { name: 'Add site' }).click();
  await page.getByRole('link', { name: new RegExp(name) }).click();
  await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible();
}

test.describe('public pages and route protection', () => {
  test('landing page explains the product and links to sign up', async ({ page }) => {
    const problems = watchConsole(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('See your site the way your visitors do');
    await expect(page.getByRole('img', { name: /Main content visible/ })).toBeVisible();
    await page.getByRole('link', { name: 'Create an account' }).first().click();
    await expect(page).toHaveURL(/\/register$/);
    expect(problems).toEqual([]);
  });

  test('signed-out visitors are sent to the login page', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login$/);
    await page.goto('/dashboard/64b64b64b64b64b64b64b64b');
    await expect(page).toHaveURL(/\/login$/);
  });
});

test.describe('accounts', () => {
  test('wrong password shows a clear error and stays on the page', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill('demo@fieldwork.dev');
    await page.getByLabel('Password').fill('definitely-wrong');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.locator('p[role="alert"]')).toHaveText('Email or password is incorrect');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('duplicate email on sign-up is explained', async ({ page }) => {
    const email = await register(page);
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto('/register');
    await page.getByLabel('Name').fill('Someone');
    await page.getByLabel('Email').fill(email.toUpperCase());
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.locator('p[role="alert"]')).toContainText('already exists');
  });

  test('the browser blocks a too-short password before anything is sent', async ({ page }) => {
    await page.goto('/register');
    await page.getByLabel('Name').fill('A');
    await page.getByLabel('Email').fill(`short${unique()}@example.com`);
    await page.getByLabel('Password').fill('short');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page).toHaveURL(/\/register$/);
  });

  test('sign out ends the session', async ({ page }) => {
    await register(page);
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('an expired access token is renewed silently', async ({ page, context }) => {
    await register(page, 'Renewal Person');
    await context.clearCookies({ name: 'rum_access' });
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Your sites' })).toBeVisible();
    await expect(page.getByText('Renewal Person', { exact: true })).toBeVisible();
  });

  test('when the whole session is gone, the user lands on the login page without a redirect loop', async ({ page, context }) => {
    await register(page);
    await context.clearCookies({ name: 'rum_access' });
    await context.clearCookies({ name: 'rum_refresh' });
    await page.reload();
    await expect(page).toHaveURL(/\/login$/, { timeout: 15_000 });
    await page.waitForTimeout(500);
    await expect(page).toHaveURL(/\/login$/);
  });
});

test.describe('sites', () => {
  test('a new account can add a site, see the install snippet and delete the site', async ({ page }) => {
    const problems = watchConsole(page);
    await register(page);
    await expect(page.getByText('No sites yet')).toBeVisible();
    await addSite(page, 'Bike Shop');
    await expect(page.getByRole('heading', { name: 'No data in this range yet' })).toBeVisible();
    await expect(page.locator('pre').first()).toContainText('data-key="rum_');

    page.once('dialog', (d) => d.accept());
    await page.getByRole('button', { name: 'Delete site' }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByText('No sites yet')).toBeVisible();
    expect(problems).toEqual([]);
  });

  test('rotating the key shows a new key', async ({ page }) => {
    await register(page);
    await addSite(page, 'Rotating');
    const before = await page.locator('code').first().textContent();
    page.once('dialog', (d) => d.accept());
    await page.getByRole('button', { name: 'Replace key' }).click();
    await expect(page.locator('code').first()).not.toHaveText(before);
  });

  test('saving the alert threshold gives feedback', async ({ page }) => {
    await register(page);
    await addSite(page, 'Alerts');
    await page.getByLabel(/Alert when errors/).fill('7');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('button', { name: 'Saved' })).toBeVisible();
    await page.reload();
    await expect(page.getByLabel(/Alert when errors/)).toHaveValue('7');
  });

  test("another user cannot open someone else's site", async ({ page, browser }) => {
    await register(page);
    await addSite(page, 'Private');
    const url = page.url();
    const other = await browser.newContext();
    const p2 = await other.newPage();
    await register(p2, 'Intruder');
    await p2.goto(url);
    await expect(p2.locator('p[role="alert"]')).toHaveText('Site not found');
    await other.close();
  });
});

test.describe('the SDK in a real browser, end to end', () => {
  test('events from the demo page show up on the dashboard', async ({ page, context }) => {
    const problems = watchConsole(page);
    await register(page, 'SDK Tester');
    await addSite(page, 'SDK Site');
    const key = (await page.locator('code').first().textContent()).trim();
    const siteUrl = page.url();

    const demo = await context.newPage();
    const demoProblems = [];
    demo.on('pageerror', (e) => demoProblems.push(e.message)); // the demo throws on purpose
    await demo.goto(`/demo.html?key=${key}`);
    await expect(demo.locator('#log')).toContainText('Fieldwork is running');
    await demo.getByRole('button', { name: 'Throw an error' }).click();
    await demo.getByRole('button', { name: 'Reject a promise' }).click();
    await demo.getByRole('button', { name: 'Cause a layout shift' }).click();
    await demo.waitForTimeout(1500);
    await demo.getByRole('button', { name: /Slow click/ }).click();
    await demo.getByRole('button', { name: 'Change route' }).click();
    await demo.waitForTimeout(500);
    await demo.goto('about:blank'); // leaving the page makes the SDK send LCP, CLS and INP
    await demo.close();
    expect(demoProblems.length).toBeGreaterThanOrEqual(1);

    await page.waitForTimeout(3500); // the API writes its buffer every 2 seconds
    await page.goto(siteUrl);
    await expect(page.getByText(/visitors? viewed \d+ pages? and hit 2 errors/)).toBeVisible();
    await expect(page.getByText(/Cannot read properties of null/).first()).toBeVisible();
    await expect(page.getByText('Demo promise rejection', { exact: true })).toBeVisible();
    // Verify Chromium performance observer entries are populated in dashboard gauges
    const gauges = page.locator('button[aria-pressed] [role="img"]');
    await expect(gauges).toHaveCount(5);
    for (const name of ['Main content visible', 'Layout stability', 'Response to taps and clicks', 'First paint', 'Server response']) {
      await expect(page.getByRole('img', { name: new RegExp(`^${name}: [^n]`) })).toBeVisible();
    }
    expect(problems).toEqual([]);
  });
});

test.describe('dashboard with seeded data (run npm run seed in /server first)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill('demo@fieldwork.dev');
    await page.getByLabel('Password').fill('Demo@12345');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.getByRole('link', { name: /Demo Store/ }).click();
    await expect(page.getByRole('heading', { name: 'Core measurements' })).toBeVisible();
  });

  test('shows all five measurements, a chart, a comparison and errors without console errors', async ({ page }) => {
    const problems = watchConsole(page);
    await page.reload();
    await expect(page.locator('button[aria-pressed] [role="img"]')).toHaveCount(5);
    await expect(page.locator('.recharts-line-curve')).toBeVisible();
    await expect(page.getByRole('heading', { name: /is slowest/ })).toBeVisible();
    await expect(page.getByText(/times$/).first()).toBeVisible();
    expect(problems).toEqual([]);
  });

  test('the seeded slowdown is visible when grouping by release', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Release' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText('1.4.0')).toBeVisible();
    await expect(page.getByText('1.5.0')).toBeVisible();
  });

  test('selecting another measurement updates the chart and comparison headings', async ({ page }) => {
    await page.getByRole('button', { name: /Layout stability/ }).click();
    await expect(page.getByRole('heading', { name: 'Layout stability over time' })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Where layout stability is slowest/ })).toBeVisible();
  });

  test('changing the time range reloads the numbers', async ({ page }) => {
    const summary = page.getByText(/visitors viewed/);
    const week = await summary.textContent();
    await page.getByRole('button', { name: '1 hour' }).click();
    await expect(summary).not.toHaveText(week); // far fewer visitors in the last hour than in the last week
    await page.getByRole('button', { name: '7 days' }).click();
    await expect(summary).toHaveText(week);
  });

  test('every comparison grouping loads', async ({ page }) => {
    for (const label of ['Browser', 'System', 'Device', 'Page', 'Release']) {
      await page.getByRole('button', { name: label, exact: true }).click();
      await expect(page.getByText(/samples$/).first()).toBeVisible();
    }
  });

  test('an error expands to show its stack trace', async ({ page }) => {
    await page.locator('details summary').first().click();
    await expect(page.locator('details[open] pre')).toContainText('at ');
  });

  test('the latest alert is shown', async ({ page }) => {
    await expect(page.getByRole('status')).toContainText('Error alert');
  });
});

test.describe('responsive layout', () => {
  test('no sideways scrolling on a phone-sized screen', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    for (const path of ['/', '/login', '/register']) {
      await page.goto(path);
      const overflow = await page.evaluate(() => Math.round(document.documentElement.scrollWidth - window.innerWidth));
      expect(overflow, path).toBeLessThanOrEqual(0);
    }
    await page.goto('/login');
    await page.getByLabel('Email').fill('demo@fieldwork.dev');
    await page.getByLabel('Password').fill('Demo@12345');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.getByRole('link', { name: /Demo Store/ }).click();
    await expect(page.getByRole('heading', { name: 'Core measurements' })).toBeVisible();
    await page.waitForTimeout(800);
    const overflow = await page.evaluate(() => Math.round(document.documentElement.scrollWidth - window.innerWidth));
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
