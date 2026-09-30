import { defineConfig, devices } from '@playwright/test';

// Parallel worktrees run e2e side by side: pick free ports via env. Never reuse a server already on the port,
// it may belong to another worktree or project.
const apiPort = Number(process.env.E2E_API_PORT ?? 3000);
const webPort = Number(process.env.E2E_WEB_PORT ?? 5173);
const apiUrl = `http://localhost:${apiPort}`;
const webUrl = `http://localhost:${webPort}`;

export default defineConfig({
  testDir: './e2e',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: { baseURL: webUrl, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'pnpm --dir ../api start',
      env: { PORT: String(apiPort) },
      url: `${apiUrl}/api/health`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `pnpm dev --port ${webPort}`,
      env: { API_URL: apiUrl },
      url: webUrl,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
