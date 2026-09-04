import { test } from "@playwright/test";
import { startExampleDevServer } from "./example-dev-server";

test.setTimeout(120_000);

test("skyline boot diagnostics", async ({ page }) => {
  const server = await startExampleDevServer();
  const events: string[] = [];
  page.on("console", (m) => events.push(`console:${m.type()}:${m.text()}`));
  page.on("pageerror", (e) => events.push(`pageerror:${e.stack ?? e.message}`));
  page.on("requestfailed", (r) => events.push(`requestfailed:${r.url()}:${r.failure()?.errorText ?? "unknown"}`));
  try {
    await page.setViewportSize({ width: 1280, height: 800 });
    const response = await page.goto(`${server.origin}/apps/showcase-skyline-runner/`, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.waitForTimeout(10_000);
    const state = await page.evaluate(() => ({
      ready: document.body.getAttribute("data-aura3d-ready"),
      globals: Object.keys(window).filter((key) => key.includes("SKYLINE")),
      title: document.title,
      body: document.body.innerText.slice(0, 300)
    }));
    console.log(JSON.stringify({ status: response?.status(), state, events }, null, 2));
  } finally {
    await server.close();
  }
});
