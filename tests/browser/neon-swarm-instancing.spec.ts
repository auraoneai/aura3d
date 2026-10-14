/**
 * Neon Swarm instancing telemetry proof - the headline claim.
 *
 * Asserts, from a live route:
 * - >= 300 drones alive simultaneously (PRD bar);
 * - renderer diagnostics record native instanced submissions;
 * - total draw calls stay bounded while the swarm renders;
 * - the canvas shows real non-blank pixels with the swarm on screen.
 *
 * This is pixel + telemetry evidence for a renderer claim, not DOM counters.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const REPORT_DIR = resolve("tests/reports/neon-swarm");
const SHOT_DIR = join(REPORT_DIR, "screenshots");
const ROUTE = "/apps/showcase-neon-swarm/";
const GLOBAL_NAME = "__NEON_SWARM_EVIDENCE__";
const PRODUCER_PATH = resolve("tests/browser/neon-swarm-instancing.spec.ts");
const ROUTE_SOURCE_DIR = resolve("apps/showcase-neon-swarm/src");

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function routeSourceSha256(): string {
  const hash = createHash("sha256");
  for (const name of readdirSync(ROUTE_SOURCE_DIR).filter((entry) => /\.(?:ts|css)$/.test(entry)).sort()) {
    hash.update(name).update("\0").update(readFileSync(join(ROUTE_SOURCE_DIR, name))).update("\0");
  }
  return hash.digest("hex");
}

interface SwarmTelemetry {
  readonly mounted: boolean;
  readonly alive: number;
  readonly instanceCount: number;
  readonly drawCalls: number;
  readonly nativeInstancedSubmissions: number;
  readonly state: string;
}

async function readTelemetry(page: Page): Promise<SwarmTelemetry> {
  return await page.evaluate((name) => {
    const value = (window as unknown as Record<string, unknown>)[name];
    return (value && typeof value === "object" ? value : {}) as SwarmTelemetry;
  }, GLOBAL_NAME);
}

test("300+ instanced drones render through bounded draw-call telemetry", async ({ page }, testInfo) => {
  testInfo.setTimeout(240_000);
  const server = await startExampleDevServer();
  const consoleErrors: string[] = [];
  try {
    page.on("console", (message) => {
      if (message.type() !== "error") return;
      if (/favicon/i.test(message.text())) return;
      consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => consoleErrors.push("pageerror: " + error.message));
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(server.origin + ROUTE, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      (name) => Boolean((window as unknown as Record<string, unknown>)[name]),
      GLOBAL_NAME,
      { timeout: 90_000 }
    );
    // Wait for the production renderer to present its first real frame.
    await page.waitForFunction(
      (name) => {
        const value = (window as unknown as Record<string, { drawCalls?: number } | undefined>)[name];
        return (value?.drawCalls ?? 0) > 0;
      },
      GLOBAL_NAME,
      { timeout: 120_000 }
    );

    // Fill both enemy pools well past the 300 bar and let frames present.
    await page.evaluate(() => {
      const hooks = (window as unknown as {
        __NEON_SWARM_DEBUG__?: { spawnTestSwarm(total: number): void; stepFixed(frames: number): void };
      }).__NEON_SWARM_DEBUG__;
      hooks?.spawnTestSwarm(320);
      hooks?.stepFixed(10);
    });
    // Wait until the presented telemetry reflects the staged swarm.
    await page.waitForFunction(
      (name) => {
        const value = (window as unknown as Record<string, { instanceCount?: number; nativeInstancedSubmissions?: number } | undefined>)[name];
        return (value?.instanceCount ?? 0) >= 300 && (value?.nativeInstancedSubmissions ?? 0) > 0;
      },
      GLOBAL_NAME,
      { timeout: 120_000 }
    );
    await page.waitForTimeout(700);

    const telemetry = await readTelemetry(page);
    expect(telemetry.mounted).toBe(true);
    expect(telemetry.instanceCount).toBeGreaterThanOrEqual(300);
    expect(telemetry.alive).toBe(telemetry.instanceCount);
    // The headline renderer evidence: native instanced submissions happened...
    expect(telemetry.nativeInstancedSubmissions).toBeGreaterThanOrEqual(1);
    // ...and total scene draws stayed bounded (pools + props + floor), far
    // below one-draw-per-drone expansion which would exceed 320 alone.
    expect(telemetry.drawCalls).toBeGreaterThan(0);
    expect(telemetry.drawCalls).toBeLessThan(64);

    // Pixel evidence: the mounted canvas carries real rendered content.
    const pixelProbe = await page.evaluate(() => {
      const canvas = document.querySelector("#app canvas");
      if (!(canvas instanceof HTMLCanvasElement)) return { ok: false, nonBlack: 0 };
      const gl = canvas.getContext("webgl2") as WebGL2RenderingContext | null;
      if (!gl) return { ok: false, nonBlack: 0 };
      const pixels = new Uint8Array(canvas.width * canvas.height * 4);
      gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      let nonBlack = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i]! + pixels[i + 1]! + pixels[i + 2]! > 24) nonBlack += 1;
      }
      return { ok: true, nonBlack };
    });
    expect(pixelProbe.ok).toBe(true);
    expect(pixelProbe.nonBlack).toBeGreaterThan(1500);

    mkdirSync(SHOT_DIR, { recursive: true });
    const screenshotPath = join(SHOT_DIR, "03-instancing-swarm.png");
    await page.screenshot({ path: screenshotPath });

    writeFileSync(join(REPORT_DIR, "instancing-telemetry.json"), JSON.stringify({
      schema: "aura3d-neon-swarm-instancing-telemetry/1.0",
      generatedAt: new Date().toISOString(),
      producer: "tests/browser/neon-swarm-instancing.spec.ts",
      producerSourceSha256: sha256(PRODUCER_PATH),
      routeSourceSha256: routeSourceSha256(),
      route: ROUTE,
      instanceCount: telemetry.instanceCount,
      alive: telemetry.alive,
      drawCalls: telemetry.drawCalls,
      nativeInstancedSubmissions: telemetry.nativeInstancedSubmissions,
      nonBlackPixels: pixelProbe.nonBlack,
      artifact: {
        path: "tests/reports/neon-swarm/screenshots/03-instancing-swarm.png",
        sha256: sha256(screenshotPath)
      },
      consoleErrors
    }, null, 2) + "\n");

    expect(consoleErrors).toEqual([]);
  } finally {
    await server.close();
  }
});
