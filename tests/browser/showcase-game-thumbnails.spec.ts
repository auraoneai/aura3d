import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const routes = [
  ["turbo-drift-circuit", "/apps/showcase-turbo-drift-circuit/"],
  ["aura-clash-arena", "/apps/aura-clash-showcase/playable/"],
  ["neon-corridor-strike", "/examples/neon-corridor-strike/"],
  ["blockfall-reactor", "/apps/showcase-blockfall-reactor/"],
  ["skyline-runner", "/apps/showcase-skyline-runner/"],
  ["siege-golf", "/apps/showcase-siege-golf/"],
  ["neon-swarm", "/apps/showcase-neon-swarm/"],
  ["aurora-lander", "/apps/showcase-aurora-lander/"],
  ["gravity-post", "/apps/showcase-gravity-post/"],
  ["courier-rush", "/apps/showcase-courier-rush/"],
  ["pulse-tunnel", "/apps/showcase-pulse-tunnel/"],
  ["mech-hangar", "/apps/showcase-mech-hangar/"],
  ["vault-breakers", "/apps/showcase-vault-breakers/"],
  ["bank-shot", "/apps/showcase-bank-shot/"],
  ["patrol-wing", "/apps/showcase-patrol-wing/"],
  ["gallery-shift", "/apps/showcase-gallery-shift/"],
  ["deep-recovery", "/apps/showcase-deep-recovery/"],
  ["rooftop-buckets", "/apps/showcase-rooftop-buckets/"]
] as const;

const reportDir = resolve("tests/reports/showcase-game-thumbnails");
const previewDir = resolve("marketing/public/previews/showcase-index");
const exactAuditDir = resolve("tests/reports/live-showcase-2.0.1");
let server: ExampleDevServer;

test.beforeAll(async () => {
  server = await startExampleDevServer();
  mkdirSync(reportDir, { recursive: true });
  mkdirSync(previewDir, { recursive: true });
  mkdirSync(exactAuditDir, { recursive: true });
});

test.afterAll(async () => { await server?.close(); });

test("regenerates every PRD game thumbnail from current machine-bound game imagery", async ({ browser }, testInfo) => {
  testInfo.setTimeout(600_000);
  const thumbnails: Array<Record<string, unknown>> = [];

  for (const [slug, route] of routes) {
    const pngPath = resolve(reportDir, `${slug}.png`);
    const webpPath = resolve(previewDir, `${slug}.webp`);
    let sourcePng = pngPath;
    if (slug === "aura-clash-arena") {
      // Aura Clash is an app-rooted Vite route whose absolute /src import cannot
      // be mounted by the repository's source-file server. Its exact special
      // capture is produced by the app's own passing visual-regression gate.
      sourcePng = resolve("apps/aura-clash-showcase/launch-evidence/aura-clash-visual-special.png");
      // Keep the exact blind-audit artifact source-bound to the same current visual-regression
      // capture used for the public thumbnail. Previously this producer regenerated only the WebP,
      // leaving `live-showcase-2.0.1/08-aura-clash-arena.png` frozen on stale bytes while still
      // reporting green. Writing the canonical PNG here makes producer success and audit freshness
      // the same operation.
      writeFileSync(resolve(exactAuditDir, "08-aura-clash-arena.png"), readFileSync(sourcePng));
    } else {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      const response = await page.goto(`${server.origin}${route}`, { waitUntil: "domcontentloaded", timeout: 90_000 });
      expect(response?.status(), `${slug} document response`).toBeLessThan(400);
      await expect(page.locator("canvas").first(), `${slug} must mount a renderer canvas`).toBeVisible({ timeout: 90_000 });
      await page.waitForTimeout(2_400);
      await page.screenshot({ path: pngPath });
      await page.close();
    }
    execFileSync("cwebp", ["-quiet", "-q", "88", "-resize", "720", "450", sourcePng, "-o", webpPath]);
    const bytes = readFileSync(webpPath);
    expect(bytes.subarray(0, 4).toString("ascii"), `${slug} WebP RIFF header`).toBe("RIFF");
    expect(bytes.subarray(8, 12).toString("ascii"), `${slug} WebP signature`).toBe("WEBP");
    thumbnails.push({
      slug,
      route,
      sourcePng: sourcePng.replace(`${process.cwd()}/`, ""),
      path: `marketing/public/previews/showcase-index/${slug}.webp`,
      width: 720,
      height: 450,
      bytes: statSync(webpPath).size,
      sha256: createHash("sha256").update(bytes).digest("hex")
    });
  }

  writeFileSync(resolve(reportDir, "manifest.json"), `${JSON.stringify({
    schema: "aura3d.showcase-game-thumbnails/1.0",
    generatedAt: new Date().toISOString(),
    producer: "tests/browser/showcase-game-thumbnails.spec.ts",
    pass: true,
    humanVisualApproval: false,
    humanVisualApprovalNote: "Current machine-captured route thumbnails; independent final visual review remains required.",
    thumbnails
  }, null, 2)}\n`);
  expect(thumbnails).toHaveLength(18);
});
