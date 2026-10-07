import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  use: {
    baseURL: "http://127.0.0.1:4194"
  },
  webServer: {
    command: "npm exec vite -- --host 127.0.0.1 --port 4194 --strictPort",
    url: "http://127.0.0.1:4194",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  }
});
