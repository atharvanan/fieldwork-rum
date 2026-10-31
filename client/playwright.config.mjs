import { defineConfig } from '@playwright/test';

// needs the api (:4000) and dashboard (:3000) running, with seed data.
// set CHROMIUM_PATH to use a Chromium you already have
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  workers: 1, // they share one database
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    launchOptions: process.env.CHROMIUM_PATH
      ? { executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox', '--disable-gpu'] }
      : {},
  },
});
