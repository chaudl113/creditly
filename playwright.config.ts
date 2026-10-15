import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3101";

/**
 * Runs against whatever already serves :3101 (`docker compose up` or
 * `npm run dev`); starts the dev server only if nothing is there.
 * Traces, videos and failure screenshots are off to keep test-results tiny.
 */
export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  outputDir: "test-results",
  timeout: 60_000,
  use: {
    baseURL,
    trace: "off",
    video: "off",
    screenshot: "off",
    ...devices["Desktop Chrome"],
  },
  projects: [
    { name: "e2e", testMatch: /journey\.spec\.ts/ },
    { name: "screenshots", testMatch: /screenshots\.spec\.ts/ },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: "npm run dev", url: baseURL, reuseExistingServer: true, timeout: 120_000 },
});
