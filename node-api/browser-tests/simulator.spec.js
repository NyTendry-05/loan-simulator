import { test, expect } from '@playwright/test';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { readFile, mkdir } from 'node:fs/promises';

let server, baseURL;
const endpoint = '**/api/v1/simulations/repayment';
// An independent API fixture for interface tests. Actual financial correctness is verified in Java tests.
function result(body) {
  const principal = Number(body.principal), scale = body.currencyScale, factor = 10 ** scale;
  const rate = Number(body.annualInterestRate) / 1200;
  const payment = Math.ceil((rate === 0 ? principal / body.termMonths : principal * rate / (1 - (1 + rate) ** -body.termMonths)) * factor) / factor;
  const decimal = number => number.toFixed(scale);
  let balance = principal, total = 0;
  const schedule = [];
  for (let month = 1; month <= body.termMonths && balance > 0; month++) {
    const interest = Math.round(balance * rate * factor) / factor;
    const due = month === body.termMonths ? balance + interest : Math.min(payment, balance + interest);
    const paidPrincipal = Math.round((due - interest) * factor) / factor;
    balance = Math.max(0, Math.round((balance - paidPrincipal) * factor) / factor); total += due;
    schedule.push({ month, payment: decimal(due), principal: decimal(paidPrincipal), interest: decimal(interest), balance: decimal(balance) });
  }
  return { ...body, principal: decimal(principal), monthlyPayment: decimal(payment), finalPayment: schedule.at(-1).payment,
    totalInterest: decimal(total - principal), totalRepayment: decimal(total), repaymentMonths: schedule.length,
    schedule, assumptions: ['Fixed nominal interest, monthly payments, no fees.', 'Final payment is adjusted to clear the balance.'], estimateOnly: true };
}
async function mockCalculator(page) {
  await page.route(endpoint, route => route.fulfill({ status: 200, json: result(route.request().postDataJSON()) }));
}
async function fillScenario(page, { amount = '1200', rate = '0', term = '12', currency = 'USD' } = {}) {
  await page.getByLabel('Display currency').selectOption(currency);
  await page.getByLabel('Loan amount', { exact: true }).fill(amount);
  await page.getByLabel('Annual interest rate', { exact: true }).fill(rate);
  await page.getByLabel('Repayment term', { exact: true }).fill(term);
  await page.getByRole('button', { name: 'Calculate repayments' }).click();
}
test.beforeAll(async () => {
  const app = createApp(loadConfig({ LOAN_SERVICE_URL: 'http://127.0.0.1:1' }), async () => Response.json({ detail: 'Please sign in' }, { status: 401 }));
  server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
  baseURL = 'http://127.0.0.1:' + server.address().port;
  await mkdir('../.local', { recursive: true });
});
test.afterAll(async () => { await new Promise(resolve => server?.close(resolve)); });

test('public desktop estimate, full schedule, CSV, and portal navigation', async ({ page }) => {
  const errors = [], requests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => requests.push(request.url()));
  await mockCalculator(page); await page.goto(baseURL);
  await expect(page.getByRole('heading', { name: 'Plan with numbers. Borrow with clarity.' })).toBeVisible();
  await expect(page.locator('#monthly-payment')).toHaveText('$500.95');
  await expect(page.locator('#calculation-status')).toContainText('Estimate ready');
  await expect(page.locator('#schedule-page')).toHaveText('Payments 1–12 of 60');
  await expect(page.getByRole('button', { name: 'Previous 12 payments' })).toBeDisabled();
  await page.getByRole('button', { name: 'Next 12 payments' }).click();
  await expect(page.locator('#schedule-page')).toHaveText('Payments 13–24 of 60');
  await page.getByRole('button', { name: 'Previous 12 payments' }).click();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download CSV' }).click();
  const file = await downloaded;
  expect(file.suggestedFilename()).toBe('repayment-simulation-USD.csv');
  const csv = await readFile(await file.path(), 'utf8');
  expect(csv.trim().split('\r\n')).toHaveLength(61); expect(csv).toContain('Payment (USD)');
  expect(csv.trim().split('\r\n').at(-1)).toMatch(/,0.00$/);
  await page.screenshot({ path: '../.local/simulator-desktop.png', fullPage: true, animations: 'disabled' });
  expect(requests.some(url => url.includes('/auth/'))).toBe(false);
  await page.getByRole('link', { name: 'Explore demo portal' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back.' })).toBeVisible();
  await expect(page.getByText('Demonstration portal.', { exact: true })).toBeVisible();
  await page.goBack(); await expect(page.locator('#monthly-payment')).toHaveText('$500.95');
  expect(errors).toEqual([]);
});

test('zero interest, one-payment term, JPY, reset, and mobile overflow', async ({ page }) => {
  await mockCalculator(page); await page.setViewportSize({ width: 390, height: 844 }); await page.goto(baseURL);
  await expect(page.locator('#monthly-payment')).toHaveText('$500.95');
  await fillScenario(page);
  await expect(page.locator('#monthly-payment')).toHaveText('$100.00');
  await expect(page.locator('#total-interest')).toHaveText('$0.00');
  await expect(page.locator('#next-schedule')).toBeDisabled();
  await fillScenario(page, { amount: '1200', term: '1', currency: 'JPY' });
  await expect(page.locator('#monthly-payment')).toHaveText('¥1,200');
  await expect(page.locator('#schedule-page')).toHaveText('Payments 1–1 of 1');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Reset example' }).click();
  await expect(page.locator('#monthly-payment')).toHaveText('$500.95');
  await page.screenshot({ path: '../.local/simulator-mobile.png', fullPage: true, animations: 'disabled' });
  await page.setViewportSize({ width: 320, height: 740 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('validates all inputs and preserves values through service error and retry', async ({ page }) => {
  await mockCalculator(page); await page.goto(baseURL);
  await expect(page.locator('#monthly-payment')).toHaveText('$500.95');
  await fillScenario(page, { amount: '-1', rate: '101', term: '0' });
  await expect(page.locator('#sim-principal')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#sim-rate')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#sim-term')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#sim-principal')).toBeFocused();
  await expect(page.locator('#simulation-error')).toContainText('Check the highlighted fields');
  await page.unroute(endpoint); await page.route(endpoint, route => route.fulfill({ status: 503, json: { detail: 'private upstream info' } }));
  await fillScenario(page);
  await expect(page.locator('#simulation-error')).toContainText('temporarily unavailable');
  await expect(page.locator('#sim-principal')).toHaveValue('1200');
  await expect(page.locator('#repayment-schedule')).not.toBeVisible();
  await expect(page.locator('#calculate')).toBeEnabled();
  await page.unroute(endpoint); await mockCalculator(page);
  await page.getByRole('button', { name: 'Calculate repayments' }).click();
  await expect(page.locator('#monthly-payment')).toHaveText('$100.00');
  await page.getByLabel('Loan amount', { exact: true }).fill('1200.5');
  await page.getByLabel('Display currency').selectOption('JPY');
  await page.getByRole('button', { name: 'Calculate repayments' }).click();
  await expect(page.locator('#principal-error')).toContainText('whole amount');
});

test('a delayed old estimate cannot overwrite edited inputs or a newer result', async ({ page }) => {
  let releaseFirst, started;
  const oldRequest = new Promise(resolve => { releaseFirst = resolve; });
  const received = new Promise(resolve => { started = resolve; });
  let first = true;
  await page.route(endpoint, async route => {
    if (first) { first = false; started(); await oldRequest; }
    await route.fulfill({ status: 200, json: result(route.request().postDataJSON()) }).catch(() => {});
  });
  await page.goto(baseURL); await received;
  await expect(page.locator('#calculate')).toBeDisabled();
  await fillScenario(page);
  await expect(page.locator('#monthly-payment')).toHaveText('$100.00');
  releaseFirst();
  await expect(page.locator('#monthly-payment')).toHaveText('$100.00');
  await expect(page.locator('#sim-principal')).toHaveValue('1200');
  await expect(page.locator('#schedule-page')).toHaveText('Payments 1–12 of 12');
});

test('single-payment estimate shows its actual instalment consistently', async ({ page }) => {
  await page.route(endpoint, route => route.fulfill({ status: 200, json: {
    principal: '1.00', monthlyPayment: '1.01', finalPayment: '1.00', totalInterest: '0.00', totalRepayment: '1.00',
    repaymentMonths: 1, termMonths: 1, currencyScale: 2, estimateOnly: true,
    schedule: [{ month: 1, payment: '1.00', principal: '1.00', interest: '0.00', balance: '0.00' }],
    assumptions: ['Synthetic half-even rounding fixture.'],
  } }));
  await page.goto(baseURL); await fillScenario(page, { amount: '1', rate: '6', term: '1' });
  await expect(page.locator('#payment-heading')).toHaveText('Estimated single payment');
  await expect(page.locator('#monthly-payment')).toHaveText('$1.00');
  await expect(page.locator('#total-repayment')).toHaveText('$1.00');
  await expect(page.locator('#calculation-status')).toContainText('$1.00 in one payment');
});
