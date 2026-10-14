import { defineConfig } from "@playwright/test";

const port = Number(process.env.AURA3D_PORT ?? 5188);
const baseURL = process.env.AURA3D_BASE_URL ?? `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./tests",
  timeout: 45_000,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL,
    viewport: { width: 1280, height: 720 },
    headless: true,
  },
  webServer: process.env.AURA3D_BASE_URL
    ? undefined
    : {
        command: `pnpm run dev -- --host 127.0.0.1 --port ${port} --strictPort`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
      },
});
