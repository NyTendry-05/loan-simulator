import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const admin = JSON.parse(await readFile(new URL('../../.local/administrator.json', import.meta.url), 'utf8'));
const database = JSON.parse(await readFile(new URL('../../.local/database.json', import.meta.url), 'utf8'));
async function signIn(page, email, password) {
  await page.goto('/');
  await page.getByLabel('Email address', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.locator('#auth-submit').click();
  await expect(page.locator('#workspace')).toBeVisible();
}
test('desktop and mobile entry screens are usable', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Welcome back.' })).toBeVisible();
  await page.getByRole('button', { name: 'How to apply' }).click();
  await expect(page.getByRole('dialog', { name: 'Application guide' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.screenshot({ path: '../.local/portal-login.png', fullPage: true, animations: 'disabled' });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByLabel('Email address', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: '../.local/portal-mobile-login.png', fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByLabel('Full name')).toBeVisible();
  await expect(page.getByRole('group', { name: 'Account access' }).getByRole('button', { name: 'Create account', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
test('administrator, customer and officer complete a real loan workflow', async ({ page, browser }) => {
  const failures = [];
  page.on('pageerror', error => failures.push(error.message));
  const marker = randomUUID().replaceAll('-', '').slice(0, 12);
  const staffEmail = 'qa-officer-' + marker + '@test.invalid', customerEmail = 'qa-customer-' + marker + '@test.invalid';
  const password = 'Qa-' + randomUUID();
  const created = { users: [], product: null, loan: null };
  let customerContext, staffContext;
  try {
    await signIn(page, admin.email, admin.password);
    await expect(page.getByRole('heading', { name: 'Welcome, admin.' })).toBeVisible();
    await page.screenshot({ path: '../.local/portal-admin.png', fullPage: true, animations: 'disabled' });
    await page.getByRole('button', { name: 'Create product', exact: true }).click();
    const dialog = page.getByRole('dialog');
    for (const [label, value] of Object.entries({ 'Product name': 'QA review loan', 'Unique product code': 'QA_' + marker.toUpperCase(),
      'Currency code': 'USD', 'Currency decimal places': '2', 'Minimum loan amount': '100', 'Maximum loan amount': '10000',
      'Minimum term (months)': '1', 'Maximum term (months)': '36', 'Annual fixed interest (%)': '12', 'Maximum debt-to-income (%)': '40' })) {
      await dialog.getByLabel(label, { exact: true }).fill(value);
    }
    await dialog.getByLabel('Identity', { exact: true }).check();
    const productResponse = page.waitForResponse(response => response.url().endsWith('/api/v1/products') && response.request().method() === 'POST');
    await dialog.getByRole('button', { name: 'Create product', exact: true }).click();
    created.product = (await (await productResponse).json()).id;
    expect(created.product).toBeTruthy();
    await expect(dialog).not.toBeVisible();
    await page.getByRole('link', { name: 'Team access' }).click();
    await page.getByRole('button', { name: 'Add team member', exact: true }).click();
    await dialog.getByLabel('Display name').fill('QA Bank Officer');
    await dialog.getByLabel('Email address').fill(staffEmail);
    await dialog.getByLabel('Initial password').fill(password);
    const staffResponse = page.waitForResponse(response => response.url().endsWith('/api/v1/admin/users') && response.request().method() === 'POST');
    await dialog.getByRole('button', { name: 'Create account', exact: true }).click();
    created.users.push((await (await staffResponse).json()).id);
    await expect(dialog).not.toBeVisible();

    customerContext = await browser.newContext({ baseURL: process.env.PORTAL_TEST_URL ?? 'http://127.0.0.1:3000' });
    const customer = await customerContext.newPage();
    customer.on('pageerror', error => failures.push(error.message));
    await customer.goto('/');
    await customer.getByRole('button', { name: 'Create account', exact: true }).click();
    await customer.getByLabel('Full name').fill('QA Customer');
    await customer.getByLabel('Email address').fill(customerEmail);
    await customer.getByLabel('Password', { exact: true }).fill(password);
    const registration = customer.waitForResponse(response => response.url().endsWith('/auth/register'));
    await customer.locator('#auth-submit').click();
    created.users.push((await (await registration).json()).id);
    await expect(customer.locator('#workspace')).toBeVisible();
    await customer.getByRole('link', { name: 'Loan products', exact: true }).click();
    await customer.locator('.product-card').filter({ hasText: 'QA review loan' }).getByRole('button', { name: 'Start application' }).click();
    const customerDialog = customer.getByRole('dialog');
    await customerDialog.getByLabel('Loan amount (USD)', { exact: true }).fill('1200');
    await customerDialog.getByLabel('Repayment term (months)').fill('12');
    await customerDialog.getByLabel('Monthly income (USD)', { exact: true }).fill('2000');
    await customerDialog.getByLabel('Existing monthly debt (USD)').fill('100');
    await customerDialog.getByLabel('What will you use this loan for?').fill('Browser verification fixture');
    const application = customer.waitForResponse(response => response.url().endsWith('/api/v1/applications') && response.request().method() === 'POST');
    await customerDialog.getByRole('button', { name: 'Create draft' }).click();
    created.loan = (await (await application).json()).id;
    await expect(customer.getByRole('heading', { name: 'QA review loan', exact: true })).toBeVisible();
    await expect(customer.getByRole('button', { name: 'Submit application', exact: true })).toBeDisabled();
    await expect(customer.locator('[aria-current="step"]')).toContainText('Draft');
    await customer.getByRole('button', { name: 'Upload', exact: true }).click();
    await customerDialog.getByLabel('Choose a document').setInputFiles({ name: 'evidence.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.7\nQA evidence') });
    await customerDialog.getByRole('button', { name: 'Upload document' }).click();
    await expect(customerDialog).not.toBeVisible();
    await expect(customer.getByRole('link', { name: 'Download', exact: true })).toBeVisible();
    await expect(customer.getByRole('button', { name: 'Submit application', exact: true })).toBeEnabled();
    await customer.getByRole('button', { name: 'Submit application', exact: true }).click();
    await customerDialog.getByRole('button', { name: 'Submit application', exact: true }).click();
    await expect(customerDialog).not.toBeVisible();
    await expect(customer.locator('.badge.submitted')).toBeVisible();
    await customer.setViewportSize({ width: 390, height: 844 });
    expect(await customer.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await customer.screenshot({ path: '../.local/portal-mobile-application.png', fullPage: true, animations: 'disabled' });
    await customer.getByRole('button', { name: 'Menu' }).click();
    await expect(customer.getByRole('button', { name: 'Menu' })).toHaveAttribute('aria-expanded', 'true');
    await customer.getByRole('link', { name: 'My applications', exact: true }).click();
    await expect(customer.getByRole('button', { name: 'Menu' })).toHaveAttribute('aria-expanded', 'false');
    await customer.getByRole('row').filter({ hasText: 'QA review loan' }).getByRole('link', { name: 'View' }).click();
    await expect(customer.locator('.badge.submitted')).toBeVisible();

    staffContext = await browser.newContext({ baseURL: process.env.PORTAL_TEST_URL ?? 'http://127.0.0.1:3000' });
    const officer = await staffContext.newPage();
    officer.on('pageerror', error => failures.push(error.message));
    await signIn(officer, staffEmail, password);
    await officer.getByRole('row').filter({ hasText: 'QA review loan' }).getByRole('link', { name: 'View' }).click();
    await officer.getByRole('button', { name: 'Start review', exact: true }).click();
    await officer.getByRole('dialog').getByRole('button', { name: 'Start review', exact: true }).click();
    await expect(officer.getByRole('dialog')).not.toBeVisible();
    await officer.getByRole('button', { name: 'Review', exact: true }).click();
    await officer.getByRole('dialog').getByLabel('Review note').fill('QA evidence reviewed');
    await officer.getByRole('dialog').getByRole('button', { name: 'Save verification' }).click();
    await expect(officer.getByRole('dialog')).not.toBeVisible();
    await officer.getByRole('button', { name: 'Record decision', exact: true }).click();
    await officer.getByRole('dialog').getByLabel('Decision reason').fill('QA workflow completed');
    await officer.getByRole('dialog').getByRole('button', { name: 'Record decision', exact: true }).click();
    await expect(officer.getByRole('dialog')).not.toBeVisible();
    await expect(officer.locator('.badge.approved')).toBeVisible();
    await expect(officer.locator('[aria-current="step"]')).toContainText('Approved');
    await expect(officer.getByText('A bank review is still required.', { exact: false })).toHaveCount(0);
    await officer.screenshot({ path: '../.local/portal-officer-approved.png', fullPage: true, animations: 'disabled' });
    await customer.getByRole('button', { name: 'Refresh workspace' }).click();
    await expect(customer.locator('.badge.approved')).toBeVisible();
    await customer.reload();
    await expect(customer.locator('.badge.approved')).toBeVisible();
    await customer.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(customer.getByRole('heading', { name: 'Welcome back.' })).toBeVisible();
    expect(failures).toEqual([]);
  } finally {
    await customerContext?.close(); await staffContext?.close();
    const client = new pg.Client({ host: database.host, port: database.port, database: database.database, user: database.user, password: database.password });
    await client.connect();
    try {
      await client.query('BEGIN');
      if (created.loan) {
        await client.query('DELETE FROM loan_events WHERE application_id=$1', [created.loan]);
        await client.query('DELETE FROM loan_documents WHERE application_id=$1', [created.loan]);
        await client.query('DELETE FROM loan_applications WHERE id=$1', [created.loan]);
      }
      if (created.product) {
        await client.query('DELETE FROM product_required_documents WHERE product_id=$1', [created.product]);
        await client.query('DELETE FROM loan_products WHERE id=$1', [created.product]);
      }
      for (const id of created.users.filter(Boolean)) {
        await client.query('DELETE FROM portal_sessions WHERE user_id=$1', [id]);
        await client.query('DELETE FROM portal_users WHERE id=$1', [id]);
      }
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { await client.end(); }
  }
});
