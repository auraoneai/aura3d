import { chromium, test, expect, type Page } from "@playwright/test";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readV6PngStats } from "../../tools/v6-report-bridge/pngStats";

interface WowRuntime {
  readonly status: "loading" | "ready" | "running" | "error";
  readonly frames: number;
  readonly drawCalls: number;
  readonly meshes: number;
  readonly materials: number;
  readonly textures: number;
  readonly animations: number;
  readonly renderSize: string;
  readonly loadMs: number;
  readonly clip: string;
  readonly timings?: Readonly<Record<string, number>>;
  readonly error?: string;
}

interface KiraIkRuntime {
  readonly status: "loading" | "ready" | "running" | "error";
  readonly statusLabel: string;
  readonly frameCount: number;
  readonly drawCalls: number;
  readonly fps: number;
  readonly elapsedMs: number;
  readonly skinningPalettesUpdated: number;
  readonly ikApplied: boolean;
  readonly animationTracksApplied: number;
  readonly animationMissingTargets: readonly string[];
  readonly skinnedDrawItems: number;
  readonly texturedDrawItems: number;
  readonly texturedSkinnedDrawItems: number;
  readonly untexturedSkinnedDrawItems: number;
  readonly fallbackWhiteDrawItems: number;
  readonly staticKiraMeshLabels: readonly string[];
  readonly characterMotion: number;
  readonly motionSamples: number;
  readonly motionTimeRange: number;
  readonly poseDiversityScore: number;
  readonly motionHealthy: boolean;
  readonly skinName: string;
  readonly fixture: string;
  readonly animationCount: number;
  readonly clipName: string;
  readonly animationBindingTracks: number;
  readonly animationBoundTracks: number;
  readonly originalAnimationCount: number;
  readonly textureCount: number;
  readonly materialCount: number;
  readonly meshCount: number;
  readonly loadMs: number;
  readonly limitations: readonly string[];
  readonly error?: string;
}

test.describe("authored WOW showcase screenshots", () => {
  let server: ViteDevServer;

  test.beforeAll(async () => {
    server = await startViteDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("Kira IK room runtime gate renders imported skinned GLB room content and visibly moves", async () => {
    test.setTimeout(120_000);
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1.25 });
    const errors = collectPageErrors(page);
    try {
      await page.goto(`${server.origin}/apps/wow-kira-ik-room/`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => {
        const runtime = (window as unknown as { readonly __g3dKiraIk?: KiraIkRuntime }).__g3dKiraIk;
        return runtime?.status === "error" || runtime?.frameCount >= 4;
      });

      const before = await readKiraMotionState(page);
      await page.waitForTimeout(1_500);
      const after = await readKiraMotionState(page);
      const runtime = after.runtime;

      expect(errors).toEqual([]);
      expect(runtime.status).not.toBe("error");
      expect(runtime.error).toBeUndefined();
      expect(runtime.frameCount).toBeGreaterThan(before.runtime.frameCount);
      expect(runtime.frameCount).toBeGreaterThanOrEqual(8);
      expect(runtime.drawCalls).toBeGreaterThan(0);
      expect(runtime.skinningPalettesUpdated).toBeGreaterThan(0);
      expect(runtime.ikApplied).toBe(true);
      expect(runtime.animationTracksApplied).toBeGreaterThan(0);
      expect(runtime.animationMissingTargets).toEqual([]);
      expect(runtime.skinnedDrawItems).toBeGreaterThan(0);
      expect(runtime.texturedSkinnedDrawItems).toBe(runtime.skinnedDrawItems);
      expect(runtime.fallbackWhiteDrawItems).toBe(1);
      expect(runtime.staticKiraMeshLabels).toEqual([
        "Kira_Feet:Kira_Feet.002",
        "Kira_Pants_B:Kira_Pants_B.001",
        "Kira_Shirt_right:Kira_Shirt.001"
      ]);
      expect(runtime.characterMotion).toBeGreaterThan(0.015);
      expect(runtime.textureCount).toBeGreaterThan(0);
      expect(runtime.materialCount).toBeGreaterThan(0);
      expect(runtime.meshCount).toBeGreaterThan(0);
      expect(runtime.motionSamples).toBeGreaterThan(before.runtime.motionSamples);
      expect(runtime.motionTimeRange).toBeGreaterThan(0.1);
      expect(runtime.poseDiversityScore).toBeGreaterThan(0.01);
      expect(runtime.motionHealthy).toBe(true);
      expect(runtime.animationCount).toBeGreaterThanOrEqual(1);
      expect(runtime.clipName).toBe("Kira_Attention_Reach");
      expect(runtime.animationBindingTracks).toBe(70);
      expect(runtime.animationBoundTracks).toBe(70);
      expect(runtime.originalAnimationCount).toBe(0);
      expect(runtime.fixture).toBe("imported kira-ik-room-animated.glb authored clip + skeleton IK");
      expect(runtime.limitations).toContain("The original source Kira GLB (/fixtures/v8/assets/showcase/kira-ik-room.glb) has skin data but 0 authored animation clips; this route uses a generated optimized copy with a real Kira_Attention_Reach clip.");
      expect(after.renderWidth).toBeGreaterThanOrEqual(1280);
      expect(after.renderHeight).toBeGreaterThanOrEqual(720);

      const screenshotPath = "tests/reports/wow-authored/wow-kira-ik-room-runtime-gate.png";
      mkdirSync(join(process.cwd(), "tests/reports/wow-authored"), { recursive: true });
      await page.screenshot({ path: screenshotPath, fullPage: false });
      expect(statSync(screenshotPath).size).toBeGreaterThan(30_000);
      const stats = readV6PngStats(screenshotPath);
      expect(stats.width).toBeGreaterThanOrEqual(1280);
      expect(stats.height).toBeGreaterThanOrEqual(720);
      expect(stats.uniqueColorBuckets).toBeGreaterThan(80);
      expect(stats.foregroundCoverage).toBeGreaterThan(0.18);
      expect(stats.centerForegroundCoverage).toBeGreaterThan(0.18);
      expect(stats.detailEdgeDensity).toBeGreaterThan(0.01);
      expect(stats.localContrast).toBeGreaterThan(18);
      writeFileSync("tests/reports/wow-authored/authored-quality-report.json", `${JSON.stringify({
        generatedAt: new Date().toISOString(),
        routes: [{
          slug: "wow-kira-ik-room",
          label: "Kira IK Room Runtime Gate",
          legacyPathNote: "This URL verifies a route-optimized Kira room GLB with a generated G3D-readable skeletal clip plus route-level IK.",
          runtimeSmokePass: true,
          visualAcceptance: false,
          visualBlockers: [
            "The original source asset had no authored animation clip; this route uses a generated optimized route copy with a G3D-readable skeletal clip.",
            "The current clip is functional and IK is applied at conservative weight because full-weight imported-skeleton solving can still create visible mesh artifacts on this asset.",
            "Cold load still includes GLB parse and texture upload, though the route copy removes Draco and downsizes the largest embedded textures."
          ],
          runtime,
          screenshot: screenshotPath,
          screenshotStats: stats,
          renderWidth: after.renderWidth,
          renderHeight: after.renderHeight,
          motionEvidence: {
            beforeFrameCount: before.runtime.frameCount,
            afterFrameCount: after.runtime.frameCount,
            beforeMotionSamples: before.runtime.motionSamples,
            afterMotionSamples: after.runtime.motionSamples,
            motionTimeRange: runtime.motionTimeRange,
            poseDiversityScore: runtime.poseDiversityScore,
            motionHealthy: runtime.motionHealthy
          }
        }]
      }, null, 2)}\n`);
    } finally {
      await browser.close();
    }
  });
});

function collectPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (text === "Failed to load resource: the server responded with a status of 404 (Not Found)") return;
    errors.push(text);
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

interface ViteDevServer {
  readonly origin: string;
  close(): Promise<void>;
}

async function startViteDevServer(): Promise<ViteDevServer> {
  if (process.env.G3D_WOW_BASE_URL) {
    return { origin: process.env.G3D_WOW_BASE_URL.replace(/\/$/, ""), close: async () => {} };
  }
  const port = 5191;
  const child = spawn("pnpm", ["exec", "vite", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
    cwd: process.cwd(),
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"]
  });
  await waitForViteReady(child, port);
  return {
    origin: `http://127.0.0.1:${port}`,
    close: () => closeVite(child)
  };
}

function waitForViteReady(child: ChildProcessWithoutNullStreams, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    let output = "";
    const timeout = setTimeout(() => {
      reject(new Error(`Timed out waiting for Vite test server on ${port}.\n${output}`));
    }, 20_000);
    const onData = (chunk: Buffer): void => {
      output += chunk.toString();
      if (output.includes(`http://127.0.0.1:${port}/`)) {
        clearTimeout(timeout);
        cleanup();
        resolve();
      }
    };
    const onExit = (code: number | null): void => {
      clearTimeout(timeout);
      cleanup();
      reject(new Error(`Vite test server exited with code ${code}.\n${output}`));
    };
    const cleanup = (): void => {
      child.stdout.off("data", onData);
      child.stderr.off("data", onData);
      child.off("exit", onExit);
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.once("exit", onExit);
  });
}

function closeVite(child: ChildProcessWithoutNullStreams): Promise<void> {
  return new Promise((resolve) => {
    if (child.exitCode !== null) {
      resolve();
      return;
    }
    child.once("exit", () => resolve());
    child.kill("SIGTERM");
    setTimeout(() => {
      if (child.exitCode === null) child.kill("SIGKILL");
    }, 2_000).unref();
  });
}

async function readKiraMotionState(page: Page): Promise<{
  readonly runtime: KiraIkRuntime;
  readonly className: string;
  readonly renderWidth: number;
  readonly renderHeight: number;
}> {
  return page.evaluate(() => {
    const canvas = document.querySelector("canvas#viewport");
    const runtime = (window as unknown as { readonly __g3dKiraIk?: KiraIkRuntime }).__g3dKiraIk;
    if (!(canvas instanceof HTMLCanvasElement) || !runtime) {
      throw new Error("Robot IK route did not expose canvas and runtime state.");
    }
    return {
      runtime,
      className: canvas.className,
      renderWidth: canvas.width,
      renderHeight: canvas.height
    };
  });
}
