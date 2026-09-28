import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './browser-tests',
  timeout: 90000,
  workers: 1,
  retries: 0,
  reporter: 'list',
  outputDir: '../.local/browser-results',
  use: { baseURL: process.env.PORTAL_TEST_URL ?? 'http://127.0.0.1:3000', viewport: { width: 1440, height: 1000 }, trace: 'retain-on-failure' },
});
