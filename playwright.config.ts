import { defineConfig, devices } from '@playwright/test';

const WEB_URL = process.env.E2E_WEB_URL || 'http://localhost:5173';
const API_URL = process.env.E2E_API_URL || 'http://localhost:4000';

export const VIEWPORTS = {
  'mobile-360': { width: 360, height: 740 },
  'mobile-390': { width: 390, height: 844 },
  'mobile-430': { width: 430, height: 932 },
  desktop: { width: 1440, height: 900 },
} as const;

export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: './tests/e2e/support/global-setup.ts',
  outputDir: './test-results/output',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['json', { outputFile: 'test-results/results.json' }],
  ],
  use: {
    baseURL: WEB_URL,
    storageState: '.playwright/storage-state.json',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    locale: 'es-CL',
    timezoneId: 'America/Santiago',
  },
  projects: [
    {
      name: 'mobile-360',
      use: { ...devices['Desktop Chrome'], viewport: VIEWPORTS['mobile-360'], isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
    },
    {
      name: 'mobile-390',
      use: { ...devices['Desktop Chrome'], viewport: VIEWPORTS['mobile-390'], isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
    },
    {
      name: 'mobile-430',
      use: { ...devices['Desktop Chrome'], viewport: VIEWPORTS['mobile-430'], isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
    },
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: VIEWPORTS.desktop },
    },
  ],
  webServer: [
    {
      command: 'npm run dev:api',
      url: `${API_URL}/api/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
    {
      command: 'npm run dev:web',
      url: WEB_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
  ],
});
