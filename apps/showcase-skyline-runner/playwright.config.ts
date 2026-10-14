import { defineConfig } from "@playwright/test";

// App-local Playwright config modeled on showcase-mech-hangar.
// Boots this app's vite dev server (vite.config.ts pins port 5188).
export default defineConfig({
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:5188",
    reuseExistingServer: !process.env.CI
  },
  use: {
    baseURL: "http://127.0.0.1:5188"
  }
});
