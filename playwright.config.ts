import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, defineConfig, devices } from '@playwright/test';

function resolveChromiumExecutablePath(): string | undefined {
  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) {
    return process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  }
  try {
    const defaultPath = chromium.executablePath();
    if (defaultPath && existsSync(defaultPath)) {
      return defaultPath;
    }
  } catch {
    // Fall back to cached ms-playwright Chromium binaries when offline.
  }

  const cacheRoot =
    process.platform === 'win32'
      ? join(process.env.LOCALAPPDATA ?? '', 'ms-playwright')
      : join(process.env.HOME ?? '', '.cache', 'ms-playwright');

  if (cacheRoot && existsSync(cacheRoot)) {
    const dirs = readdirSync(cacheRoot)
      .filter((d) => d.startsWith('chromium_headless_shell-') || d.startsWith('chromium-'))
      .sort()
      .reverse();
    for (const dir of dirs) {
      const candidates =
        process.platform === 'win32'
          ? [
              join(cacheRoot, dir, 'chrome-headless-shell-win64', 'chrome-headless-shell.exe'),
              join(cacheRoot, dir, 'chrome-win64', 'chrome.exe')
            ]
          : [
              join(cacheRoot, dir, 'chrome-headless-shell-linux64', 'chrome-headless-shell'),
              join(cacheRoot, dir, 'chrome-linux', 'chrome')
            ];
      const match = candidates.find((c) => existsSync(c));
      if (match) {
        return match;
      }
    }
  }

  if (process.platform === 'win32') {
    const systemChrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    if (existsSync(systemChrome)) {
      return systemChrome;
    }
  }

  return undefined;
}

const executablePath = resolveChromiumExecutablePath();

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: 'http://127.0.0.1:3000',
    trace: 'on-first-retry',
    viewport: { width: 1440, height: 900 }
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        ...(executablePath ? { launchOptions: { executablePath } } : {})
      }
    }
  ],
  webServer: [
    {
      command: 'pnpm exec tsx scripts/e2e-api-harness.ts',
      port: 4000,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000
    },
    {
      command: 'pnpm --filter @proofline/web start',
      port: 3000,
      reuseExistingServer: !process.env.CI,
      timeout: 90_000
    }
  ]
});

