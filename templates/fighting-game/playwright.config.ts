import { defineConfig } from "@playwright/test";

export default defineConfig({
  webServer: {
    command: "npm run dev -- --port 5186",
    url: "http://127.0.0.1:5186",
    reuseExistingServer: false
  },
  use: {
    baseURL: "http://127.0.0.1:5186"
  }
});
