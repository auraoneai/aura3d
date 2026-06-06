import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  use: {
    baseURL: "http://127.0.0.1:5187",
    trace: "on-first-retry"
  },
  webServer: {
    command: "pnpm dev --host 127.0.0.1 --port 5187 --strictPort",
    url: "http://127.0.0.1:5187/playable/",
    reuseExistingServer: false,
    timeout: 120_000
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } }
  ]
});
