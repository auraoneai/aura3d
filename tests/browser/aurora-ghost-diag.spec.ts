import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

test("diagnose ghost seeding", async ({ page }) => {
  test.setTimeout(90_000);
  const server = await startExampleDevServer();
  try {
    await page.addInitScript(() => {
      const dt = 1 / 60;
      const payload = {
        kind: "aura-game-input-replay-export",
        schemaVersion: "aura-game-input-replay/v1",
        exportedAt: new Date().toISOString(),
        trajectoryHash: "seeded0000",
        siteId: 1,
        grade: "soft",
        score: 900,
        replay: {
          kind: "aura-game-input-replay",
          label: "seeded",
          fps: 60,
          seed: 24301,
          frameCount: 25,
          duration: 25 * dt,
          checksum: "computed-by-engine",
          events: [
            { frame: 5, time: 5 * dt, type: "press", binding: "KeyW" },
            { frame: 25, time: 25 * dt, type: "release", binding: "KeyW" }
          ]
        }
      };
      window.localStorage.setItem("aurora-lander-best-run/1", JSON.stringify(payload));
      (window as unknown as { __SEEDED_AT__?: string }).__SEEDED_AT__ = new Date().toISOString();
    });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    await page.goto(`${server.origin}/apps/showcase-aurora-lander/`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => (window as unknown as { __AURORA_LANDER_EVIDENCE__?: { mounted?: boolean } }).__AURORA_LANDER_EVIDENCE__?.mounted === true, undefined, { timeout: 45_000 });
    const diag = await page.evaluate(() => {
      const evidence = (window as unknown as { __AURORA_LANDER_EVIDENCE__?: Record<string, unknown> }).__AURORA_LANDER_EVIDENCE__;
      const keys: string[] = [];
      for (let i = 0; i < window.localStorage.length; i += 1) {
        const key = window.localStorage.key(i);
        if (key) keys.push(key);
      }
      return {
        keys,
        ghostActive: evidence?.ghostActive,
        ghostImportError: evidence?.ghostImportError
      };
    });
    console.log("DIAG:", JSON.stringify(diag));
    console.log("ERRORS:", JSON.stringify(errors.slice(0, 6)));
  } finally {
    await server.close();
  }
});
