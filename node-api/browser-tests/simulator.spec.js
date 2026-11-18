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
  await page.unroute(endpoint); await page.route(endpoint, route => route.fulfill({ status: 500, json: { detail: 'private upstream info' } }));
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
    annualInterestRate: '6', repaymentMonths: 1, termMonths: 1, currencyScale: 2, estimateOnly: true,
    schedule: [{ month: 1, payment: '1.00', principal: '1.00', interest: '0.00', balance: '0.00' }],
    assumptions: ['Synthetic half-even rounding fixture.'],
  } }));
  await page.goto(baseURL); await fillScenario(page, { amount: '1', rate: '6', term: '1' });
  await expect(page.locator('#payment-heading')).toHaveText('Estimated single payment');
  await expect(page.locator('#monthly-payment')).toHaveText('$1.00');
  await expect(page.locator('#total-repayment')).toHaveText('$1.00');
  await expect(page.locator('#calculation-status')).toContainText('$1.00 in one payment');
});

test('annual summary resets pagination, exports partial years and switches back to monthly', async ({ page }) => {
  await mockCalculator(page); await page.goto(baseURL);
  await expect(page.locator('#monthly-payment')).toHaveText('$500.95');
  await fillScenario(page, { amount: '2500', term: '25' });
  await page.getByRole('button', { name: 'Next 12 payments' }).click();
  await expect(page.locator('#schedule-page')).toHaveText('Payments 13–24 of 25');
  await page.getByLabel('Schedule view').selectOption('annual');
  await expect(page.locator('#schedule-page')).toHaveText('Years 1–3 of 3');
  await expect(page.locator('#schedule-rows tr')).toHaveCount(3);
  await expect(page.locator('#schedule-rows tr').first()).toHaveText('Year 1 (months 1–12)$1,200.00$1,200.00$0.00$1,300.00');
  await expect(page.locator('#schedule-rows tr').last()).toContainText('Year 3 (months 25–25)');
  await expect(page.locator('#schedule-frequency-note')).toContainText('not a calendar or tax year');
  await expect(page.getByRole('button', { name: 'Previous 12 years' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Next 12 years' })).toBeDisabled();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download CSV' }).click();
  const file = await downloaded;
  expect(file.suggestedFilename()).toBe('repayment-simulation-annual-USD.csv');
  const csv = await readFile(await file.path(), 'utf8');
  expect(csv.trim().split('\r\n')).toHaveLength(4);
  expect(csv).toContain('3,25,25,100.00,100.00,0.00,0.00\r\n');
  await page.getByLabel('Schedule view').selectOption('monthly');
  await expect(page.locator('#schedule-page')).toHaveText('Payments 1–12 of 25');
  await expect(page.locator('#schedule-frequency-note')).toBeHidden();
});

test('annual view handles maximum term, repeated switching and a new zero-decimal estimate', async ({ page }) => {
  await mockCalculator(page); await page.setViewportSize({ width: 320, height: 740 }); await page.goto(baseURL);
  await expect(page.locator('#monthly-payment')).toHaveText('$500.95');
  await fillScenario(page, { amount: '1200', term: '1200' });
  await page.getByLabel('Schedule view').selectOption('annual');
  await expect(page.locator('#schedule-page')).toHaveText('Years 1–12 of 100');
  for (let i = 0; i < 8; i++) await page.getByRole('button', { name: 'Next 12 years' }).click();
  await expect(page.locator('#schedule-page')).toHaveText('Years 97–100 of 100');
  await expect(page.getByRole('button', { name: 'Next 12 years' })).toBeDisabled();
  await page.getByRole('button', { name: 'Previous 12 years' }).click();
  await expect(page.locator('#schedule-page')).toHaveText('Years 85–96 of 100');
  await page.getByLabel('Schedule view').selectOption('monthly');
  await page.getByLabel('Schedule view').selectOption('annual');
  await expect(page.locator('#schedule-page')).toHaveText('Years 1–12 of 100');
  await page.getByLabel('Loan amount', { exact: true }).fill('2');
  await expect(page.locator('#repayment-schedule')).toBeHidden();
  await fillScenario(page, { amount: '2', term: '1200', currency: 'JPY' });
  await expect(page.locator('#schedule-view')).toHaveValue('annual');
  await expect(page.locator('#schedule-page')).toHaveText('Years 1–1 of 1');
  await expect(page.locator('#schedule-rows tr')).toHaveText('Year 1 (months 1–2)¥2¥2¥0¥0');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('inconsistent response ledger clears both views and allows a clean retry', async ({ page }) => {
  await mockCalculator(page); await page.goto(baseURL);
  await expect(page.locator('#monthly-payment')).toHaveText('$500.95');
  await page.getByLabel('Schedule view').selectOption('annual');
  await expect(page.locator('#schedule-page')).toHaveText('Years 1–5 of 5');
  await page.unroute(endpoint);
  await page.route(endpoint, route => {
    const response = result(route.request().postDataJSON());
    response.schedule[0].payment = '1.00';
    return route.fulfill({ status: 200, json: response });
  });
  await fillScenario(page);
  await expect(page.locator('#simulation-error')).toContainText('incomplete or inconsistent result');
  await expect(page.locator('#repayment-schedule')).toBeHidden();
  await expect(page.locator('#result-content')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Download CSV' })).toBeHidden();
  await expect(page.locator('#calculate')).toBeEnabled();
  await expect(page.locator('#sim-principal')).toHaveValue('1200');
  await page.unroute(endpoint); await mockCalculator(page);
  await page.getByRole('button', { name: 'Calculate repayments' }).click();
  await expect(page.locator('#schedule-page')).toHaveText('Years 1–1 of 1');
  await page.getByLabel('Schedule view').selectOption('monthly');
  await expect(page.locator('#schedule-page')).toHaveText('Payments 1–12 of 12');
});

test('mismatched response summaries are hidden, preserve inputs and allow a clean retry', async ({ page }) => {
  await mockCalculator(page); await page.goto(baseURL);
  await expect(page.locator('#monthly-payment')).toHaveText('$500.95');
  await page.getByLabel('Schedule view').selectOption('annual');
  for (const key of ['principal', 'annualInterestRate', 'monthlyPayment', 'finalPayment', 'totalInterest', 'totalRepayment']) {
    await page.unroute(endpoint);
    await page.route(endpoint, route => {
      const response = result(route.request().postDataJSON()); response[key] = '999';
      return route.fulfill({ status: 200, json: response });
    });
    await fillScenario(page);
    await expect(page.locator('#simulation-error')).toHaveText('The calculator returned an incomplete or inconsistent result. Please try again.');
    await expect(page.locator('#result-content')).toBeHidden();
    await expect(page.locator('#repayment-schedule')).toBeHidden();
    await expect(page.locator('#sim-principal')).toHaveValue('1200');
    await expect(page.locator('#calculate')).toBeEnabled();
    await expect(page.locator('#simulation-results')).toHaveAttribute('aria-busy', 'false');
  }
  await page.unroute(endpoint); await mockCalculator(page);
  await page.getByRole('button', { name: 'Calculate repayments' }).click();
  await expect(page.locator('#simulation-error')).toBeHidden();
  await expect(page.locator('#monthly-payment')).toHaveText('$100.00');
  await expect(page.locator('#schedule-page')).toHaveText('Years 1–1 of 1');
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download CSV' }).click();
  const file = await downloaded;
  expect(file.suggestedFilename()).toBe('repayment-simulation-annual-USD.csv');
  expect(await readFile(await file.path(), 'utf8')).toContain('1,1,12,1200.00,1200.00,0.00,0.00\r\n');
});

test('a single-payment headline uses the actual debit and resets on a new monthly estimate', async ({ page }) => {
  await page.route(endpoint, route => {
    const response = result(route.request().postDataJSON());
    if (response.repaymentMonths === 1) response.monthlyPayment = '999.00';
    return route.fulfill({ status: 200, json: response });
  });
  await page.goto(baseURL);
  await fillScenario(page, { amount: '1', term: '1' });
  await expect(page.locator('#payment-heading')).toHaveText('Estimated single payment');
  await expect(page.locator('#monthly-payment')).toHaveText('$1.00');
  await expect(page.locator('#total-repayment')).toHaveText('$1.00');
  await expect(page.locator('#estimate-context')).toContainText('1 payment ·');
  await expect(page.locator('#calculation-status')).toContainText('$1.00 in one payment;');
  await fillScenario(page);
  await expect(page.locator('#payment-heading')).toHaveText('Estimated monthly payment');
  await expect(page.locator('#monthly-payment')).toHaveText('$100.00');
  await expect(page.locator('#calculation-status')).toContainText('$100.00 per month;');
});

for (const phase of ['request', 'response body']) {
  test(`a timeout during the ${phase} preserves inputs and allows a clean retry`, async ({ page }) => {
    await mockCalculator(page);
    await page.goto(baseURL);
    await expect(page.locator('#monthly-payment')).toHaveText('$500.95');
    await page.getByLabel('Schedule view').selectOption('annual');
    await page.evaluate(phase => {
      const originalFetch = window.fetch;
      const originalTimeout = AbortSignal.timeout;
      const timeout = new AbortController();
      AbortSignal.timeout = () => timeout.signal;
      window.expireCalculation = () => timeout.abort(new DOMException('Timed out', 'TimeoutError'));
      window.restoreCalculator = () => {
        window.fetch = originalFetch;
        AbortSignal.timeout = originalTimeout;
      };
      window.fetch = async (url, options) => {
        const interrupted = () => new Promise((resolve, reject) => {
          options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
          window.calculationWaiting = true;
        });
        if (phase === 'request') return interrupted();
        return { ok: true, json: interrupted };
      };
    }, phase);
    await fillScenario(page);
    await expect.poll(() => page.evaluate(() => window.calculationWaiting)).toBe(true);
    await expect(page.locator('#calculate')).toBeDisabled();
    await page.evaluate(() => window.expireCalculation());
    await expect(page.locator('#simulation-error')).toHaveText('The calculator took too long to respond. Please try again.');
    await expect(page.locator('#result-content')).toBeHidden();
    await expect(page.locator('#repayment-schedule')).toBeHidden();
    await expect(page.locator('#calculate')).toBeEnabled();
    await expect(page.locator('#simulation-results')).toHaveAttribute('aria-busy', 'false');
    await expect(page.locator('#sim-principal')).toHaveValue('1200');
    await expect(page.locator('#sim-rate')).toHaveValue('0');
    await expect(page.locator('#sim-term')).toHaveValue('12');
    await page.evaluate(() => window.restoreCalculator());
    await page.getByRole('button', { name: 'Calculate repayments' }).click();
    await expect(page.locator('#simulation-error')).toBeHidden();
    await expect(page.locator('#monthly-payment')).toHaveText('$100.00');
    await expect(page.locator('#schedule-page')).toHaveText('Years 1–1 of 1');
  });
}

for (const width of [1440, 320]) {
  test(`first and last schedule pages handle long loans, view changes and early payoff at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await mockCalculator(page); await page.goto(baseURL);
    await expect(page.locator('#monthly-payment')).toHaveText('$500.95');
    await fillScenario(page, { amount: '1200', term: '1200' });
    const first = page.getByRole('button', { name: 'First schedule page' });
    const last = page.getByRole('button', { name: 'Last schedule page' });
    await expect(first).toBeDisabled();
    await expect(last).toBeEnabled();
    await last.click();
    await expect(page.locator('#schedule-page')).toHaveText('Payments 1189–1200 of 1200');
    await expect(page.locator('#schedule-rows tr').last()).toHaveText('1200$1.00$1.00$0.00$0.00');
    await expect(last).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Next 12 payments' })).toBeDisabled();
    await page.getByRole('button', { name: 'Previous 12 payments' }).click();
    await expect(last).toBeEnabled();
    await first.click();
    await expect(page.locator('#schedule-page')).toHaveText('Payments 1–12 of 1200');
    await expect(first).toBeDisabled();
    await page.getByLabel('Schedule view').selectOption('annual');
    await last.click();
    await expect(page.locator('#schedule-page')).toHaveText('Years 97–100 of 100');
    await expect(page.locator('#schedule-rows tr')).toHaveCount(4);
    await expect(last).toBeDisabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByLabel('Schedule view').selectOption('monthly');
    await expect(first).toBeDisabled();
    await expect(last).toBeEnabled();
    await fillScenario(page, { amount: '2500', term: '25' });
    await last.click();
    await expect(page.locator('#schedule-page')).toHaveText('Payments 25–25 of 25');
    await expect(page.locator('#schedule-rows tr')).toHaveCount(1);
    await fillScenario(page, { amount: '2', term: '1200', currency: 'JPY' });
    await expect(page.locator('#schedule-page')).toHaveText('Payments 1–2 of 2');
    await expect(first).toBeDisabled();
    await expect(last).toBeDisabled();
    await page.getByLabel('Schedule view').selectOption('annual');
    await expect(first).toBeDisabled();
    await expect(last).toBeDisabled();
  });
}

test('a sleeping demo retries HTML 502 responses and renders the original scenario', async ({ page }) => {
  await page.clock.install();
  let calls = 0;
  await page.route(endpoint, route => {
    calls++;
    return calls === 1 ? route.fulfill({ status: 502, contentType: 'text/html', body: '<html>upstream private error</html>' })
      : route.fulfill({ status: 200, json: result(route.request().postDataJSON()) });
  });
  await page.goto(baseURL);
  await expect(page.locator('#calculation-status')).toContainText('may be waking from sleep');
  await expect(page.locator('#simulation-error')).toBeHidden();
  await expect(page.locator('#calculate')).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Cancel calculation' })).toBeVisible();
  await page.clock.runFor(10000);
  await expect(page.locator('#monthly-payment')).toHaveText('$500.95');
  await expect(page.locator('#calculate')).toBeEnabled();
  await expect(page.locator('#cancel-calculation')).toBeHidden();
  await page.clock.runFor(60000);
  expect(calls).toBe(2);
});

for (const interruption of ['cancel', 'edit', 'leave page']) {
  test(`${interruption} stops a pending cold-start retry and permits a fresh estimate`, async ({ page }) => {
    await page.clock.install();
    let calls = 0;
    await page.route(endpoint, route => { calls++; return route.fulfill({ status: 503, body: 'unavailable' }); });
    await page.goto(baseURL);
    await expect(page.locator('#calculation-status')).toContainText('may be waking from sleep');
    if (interruption === 'cancel') await page.getByRole('button', { name: 'Cancel calculation' }).click();
    else if (interruption === 'edit') await page.getByLabel('Loan amount', { exact: true }).fill('1200');
    else {
      // BFCache preserves the document: model its leave/restore lifecycle without rerunning the module.
      await page.evaluate(() => {
        window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
        window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
      });
      await expect(page.locator('#result-state')).toHaveText('Calculation interrupted');
      await expect(page.locator('#calculation-status')).toContainText('stopped when you left');
    }
    await expect(page.locator('#calculate')).toBeEnabled();
    await expect(page.locator('#simulation-results')).toHaveAttribute('aria-busy', 'false');
    await expect(page.locator('#cancel-calculation')).toBeHidden();
    await page.clock.runFor(30000);
    expect(calls).toBe(1);
    await page.unroute(endpoint); await mockCalculator(page);
    await fillScenario(page);
    await expect(page.locator('#monthly-payment')).toHaveText('$100.00');
    await expect(page.locator('#simulation-error')).toBeHidden();
  });
}
