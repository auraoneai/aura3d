import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  use: { baseURL: "http://127.0.0.1:4194", headless: true },
  webServer: {
    command: "pnpm --filter @aura3d/showcase-neon-swarm dev --host 127.0.0.1 --port 4194",
    url: "http://127.0.0.1:4194",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000
  }
});
