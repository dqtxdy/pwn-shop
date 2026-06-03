import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // run sequentially to avoid state collisions since backend is stateful
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    // Stateful workflow tests run ONCE on desktop only (preserve in-memory backend state)
    {
      name: 'desktop-workflow',
      testMatch: '**/workflow.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 }
      },
    },
    // Responsive layout tests (read-only, no state mutations) run on all 3 viewports
    {
      name: 'desktop',
      testMatch: '**/responsive.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 }
      },
    },
    {
      name: 'tablet',
      testMatch: '**/responsive.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 768, height: 1024 }
      },
    },
    {
      name: 'mobile',
      testMatch: '**/responsive.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 }
      },
    },
  ],
  webServer: [
    {
      command: 'npm run dev:api --prefix ../..',
      port: 3000,
      reuseExistingServer: !process.env.CI,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: 'npm run dev:web --prefix ../..',
      port: 5173,
      reuseExistingServer: !process.env.CI,
      stdout: 'pipe',
      stderr: 'pipe',
    }
  ],
});
