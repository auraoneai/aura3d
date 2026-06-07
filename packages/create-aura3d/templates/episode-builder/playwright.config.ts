import { defineConfig } from "@playwright/test";

export default defineConfig({
  webServer: {
    command: "npm run dev -- --port 4181",
    url: "http://127.0.0.1:4181",
    reuseExistingServer: !process.env.CI
  },
  use: {
    baseURL: "http://127.0.0.1:4181"
  }
});

