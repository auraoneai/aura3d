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

// Per-slug staging so thumbnails show real gameplay instead of the boot
// instant: extra settle time (swarm's intermission countdown) or real held
// input (turbo's countdown waits for throttle before the race exists).
const STAGING: Record<string, { waitMs?: number; holdKey?: string; holdMs?: number; query?: string; evalJs?: string; settleDelayMs?: number }> = {
  // Skip the pausing settle (holdKey path) and stage wave 1 through the
  // route's own debug hooks on the live loop instead.
  "neon-swarm": { evalJs: "window.__NEON_SWARM_DEBUG__?.startWaveNow(); window.__NEON_SWARM_DEBUG__?.spawnTestSwarm(120); window.__NEON_SWARM_DEBUG__?.stepFixed(90)", waitMs: 1500, holdKey: "KeyQ" },
  // The overview lens alone freezes (via the settle seam) on the boot
  // instant: an empty grey void. Like the route-primary probe, hold throttle
  // on the live loop instead so the capture shows the hero+rival chase.
  // The holdKey path skips the pausing settle seam on purpose.
  "turbo-drift-circuit": { query: "?capture=overview&evidenceDriver=1", holdKey: "Space", holdMs: 22000 },
  // Aurora's settle seam freezes the sim wherever it is, and a fixed extra
  // delay overshoots into the crash banner (the boot flight plunges
  // untouched). Hold main thrust on the live loop instead (holdKey path
  // skips the freeze) so the capture shows the hover near the pad rig,
  // mirroring the route-primary probe's fresh-attempt frame.
  "aurora-lander": { holdKey: "KeyW", holdMs: 3500 },
  // The live planning board crowds the frame edge with overlapping DOM-free
  // world labels; the probe-proven review lens shows the composed Rust->Gale
  // freight corridor instead (labels omitted by the route in review capture).
  "gravity-post": { query: "?capture=review&debug=1" },
  // The public follow lens sits on top of the 0.16 m ball (boulder read);
  // the route's own structural review frame pulls back to show tee, obstacle
  // bay, and sensor keep as one decision.
  "siege-golf": { query: "?capture=review" },
  // Mascot cutouts are authored smaller and further out in review capture so
  // the well owns the frame instead of the anime side panels.
  "blockfall-reactor": { query: "?capture=review" },
  // The oblique play lens crowds the foreground with the blocky Kenney thief;
  // the probe-proven review lens plus the route's own reset+pump hooks stage
  // the guard-1 LOS intercept as a readable flat-plan heist moment. Pump 140
  // (not the probe's 240): any more fills the meter into the Caught card,
  // which covers the frame center.
  "gallery-shift": { query: "?capture=review&debug=1", evalJs: "window.__GS_RESET_CAPTURE__?.(); window.__GS_PUMP__?.(140)", waitMs: 400 },
  // The boot instant freezes the sub far from the lens (small ghost in open
  // water). Hold throttle on the live loop so the capture meets it mid-approach
  // with the wreck in frame; the holdKey path skips the freezing settle seam.
  "deep-recovery": { holdKey: "KeyW", holdMs: 1500 },
  // The settled boot frame pins the idle clip mid weight-shift with the hero
  // half-merged into the platform lip. Hold run briefly on the live loop so
  // the capture shows a grounded mid-stride moment with the course ahead; the
  // holdKey path skips the freezing settle seam on purpose.
  // A short 200ms run stages a grounded mid-stride hero on the opening
  // platform with the course and first relay diamond ahead but not
  // overlapping: longer blind holds drift into the collect frame (pickup
  // through the hero's head) and their timing varies with the settle seam,
  // so the early moment is the robust one.
  "skyline-runner": { holdKey: "KeyD", holdMs: 200 },
  // Serve through the route's own input path, then let the ball reach the
  // playfield: the boot frame stages balls-live 0 with no ball on the table.
  "vault-breakers": { evalJs: "(async () => { const sleep = (ms) => new Promise((r) => setTimeout(r, ms)); window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true })); await sleep(1800); window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', bubbles: true })); await sleep(3200); })()", waitMs: 400 },
};

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
  // 18 routes with multi-second holds (turbo 22s, vault ~5s, aurora 3.5s)
  // structurally exceed 600s end to end; the gate must cover the whole
  // producer run, not a single capture.
  testInfo.setTimeout(900_000);
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
      const stagingEarly = STAGING[slug];
      const response = await page.goto(`${server.origin}${route}${stagingEarly?.query ?? ""}`, { waitUntil: "domcontentloaded", timeout: 90_000 });
      expect(response?.status(), `${slug} document response`).toBeLessThan(400);
      try {
        await expect(page.locator("canvas").first(), `${slug} must mount a renderer canvas`).toBeVisible({ timeout: 45_000 });
      } catch {
        // Cold dev-server transforms of large route bundles can serve a
        // partial module on first hit; one reload recovers deterministically.
        await page.reload({ waitUntil: "domcontentloaded", timeout: 90_000 });
        await expect(page.locator("canvas").first(), `${slug} must mount a renderer canvas after reload`).toBeVisible({ timeout: 90_000 });
      }
      await page.waitForTimeout(2_400);
      // Use the same route-owned settle seam as the route-primary probes so
      // thumbnails show the staged gameplay moment (post-countdown car,
      // mid-wave swarm) instead of the boot instant.
      const staging = STAGING[slug];
      if (!staging?.holdKey) {
        if (staging?.settleDelayMs) await page.waitForTimeout(staging.settleDelayMs);
        await page.evaluate(() => {
          (window as unknown as { __AURA3D_COMPOSITION_PROBE__?: { settleSubjectPose?: () => unknown } }).__AURA3D_COMPOSITION_PROBE__?.settleSubjectPose?.();
        });
        await page.waitForTimeout(800);
      }
      if (staging?.evalJs) await page.evaluate(staging.evalJs);
      if (staging?.waitMs) await page.waitForTimeout(staging.waitMs);
      if (staging?.holdKey) {
        await page.keyboard.down(staging.holdKey);
        await page.waitForTimeout(staging.holdMs ?? 1500);
        await page.keyboard.up(staging.holdKey);
        await page.waitForTimeout(400);
      }
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
