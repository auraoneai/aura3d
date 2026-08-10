import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

// Verifies the create-aura3d template preview routes actually BOOT in a browser with the workspace
// packages (the templates' own pinned-version vite needs `npm install`; the monorepo dev server
// resolves @aura3d/* to local source, so this proves the route logic boots + drives the kit).
test.describe("create-aura3d template preview routes boot", () => {
  test.setTimeout(60_000);
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });
  test.afterAll(async () => {
    await server.close();
  });

  test("character-controller route boots and exposes a live locomotion proof", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`${server.origin}/tests/browser/character-controller-route-harness.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean((window as unknown as { __AURA3D_CHARACTER_CONTROLLER_PROOF__?: unknown }).__AURA3D_CHARACTER_CONTROLLER_PROOF__));
    const idle = await page.evaluate(() => (window as unknown as { __AURA3D_CHARACTER_CONTROLLER_PROOF__?: { state: string } }).__AURA3D_CHARACTER_CONTROLLER_PROOF__);
    expect(idle!.state).toBe("idle");
    await page.keyboard.down("KeyD");
    await page.waitForTimeout(500);
    const moving = await page.evaluate(() => (window as unknown as { __AURA3D_CHARACTER_CONTROLLER_PROOF__?: { state: string; clipWeights: { weight: number }[] } }).__AURA3D_CHARACTER_CONTROLLER_PROOF__);
    await page.keyboard.up("KeyD");
    expect(["walk", "run"]).toContain(moving!.state);
    expect(moving!.clipWeights.reduce((a, w) => a + w.weight, 0)).toBeGreaterThan(0.9);
    expect(errors).toEqual([]);
  });

  test("animation-studio preview route boots and exposes live route readiness proof", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (message) => {
      const text = message.text();
      if (message.type() === "error" && !text.includes("favicon") && !text.includes("404 (Not Found)")) {
        errors.push(text);
      }
    });
    await page.goto(`${server.origin}/tests/browser/animation-studio-route-harness.html`, { waitUntil: "domcontentloaded" });
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const w = window as unknown as {
              __AURA_LIVE_ROUTE_READY__?: { ready?: boolean };
              __AURA_LIVE_ROUTE_ERROR__?: string;
            };
            if (w.__AURA_LIVE_ROUTE_ERROR__) return `error: ${w.__AURA_LIVE_ROUTE_ERROR__}`;
            return w.__AURA_LIVE_ROUTE_READY__?.ready === true ? "ready" : "pending";
          }),
        { timeout: 45_000 }
      )
      .toBe("ready");
    const proof = await page.evaluate(() => {
      const w = window as unknown as {
        __AURA_LIVE_ROUTE_READY__?: { ready?: boolean; backend?: string; characters?: readonly unknown[] };
        __auraSeek__?: (time: number) => { shot?: { shotId?: string }; drawCalls?: number };
      };
      return {
        ready: w.__AURA_LIVE_ROUTE_READY__?.ready,
        backend: w.__AURA_LIVE_ROUTE_READY__?.backend,
        characterCount: w.__AURA_LIVE_ROUTE_READY__?.characters?.length ?? 0,
        seekShot: w.__auraSeek__?.(0)?.shot?.shotId,
        drawCalls: w.__auraSeek__?.(0)?.drawCalls
      };
    });
    expect(proof.ready).toBe(true);
    expect(typeof proof.backend).toBe("string");
    expect(proof.characterCount).toBe(0);
    expect(proof.seekShot).toBe("shot-empty");
    expect(proof.drawCalls).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });

  test("mini-game template boots as a playable platformer starter", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(`${server.origin}/templates/mini-game/index.html`, { waitUntil: "domcontentloaded" });
    await expect.poll(
      () => page.evaluate(() => document.body.dataset.aura3dError
        ? `error: ${document.body.dataset.aura3dError}`
        : document.body.dataset.aura3dReady === "true"
          ? "ready"
          : `pending:${document.querySelector("canvas")?.dataset.aura3dModelStage ?? "no-stage"}`),
      { timeout: 45_000 }
    ).toBe("ready");
    await page.waitForFunction(() => Boolean((window as unknown as { __AURA3D_MINI_GAME__?: unknown }).__AURA3D_MINI_GAME__), undefined, {
      timeout: 20_000
    });

    const initial = await miniGameState(page);
    expect(initial.player.x).toBeLessThan(0.2);

    await page.keyboard.down("ArrowRight");
    await page.waitForTimeout(650);
    await page.keyboard.up("ArrowRight");
    const moved = await miniGameState(page);
    expect(moved.player.x).toBeGreaterThan(initial.player.x + 1.2);

    await page.keyboard.down("Space");
    await page.waitForTimeout(180);
    await page.keyboard.up("Space");
    const jumped = await miniGameState(page);
    expect(jumped.player.y).toBeGreaterThan(moved.player.y);

    await page.keyboard.down("ArrowRight");
    await page.waitForTimeout(1600);
    await page.keyboard.up("ArrowRight");
    const scored = await miniGameState(page);
    expect(scored.score).toBeGreaterThanOrEqual(50);
    expect(scored.events.length).toBeGreaterThan(0);

    await page.keyboard.press("KeyR");
    await page.waitForTimeout(140);
    const reset = await miniGameState(page);
    expect(reset.player.x).toBeLessThan(0.3);
    expect(reset.events.some((event) => event.includes("reset"))).toBe(true);

    await mkdir(resolve(process.cwd(), "tests/reports/templates"), { recursive: true });
    await page.screenshot({ path: resolve(process.cwd(), "tests/reports/templates/mini-game-playable.png"), fullPage: false });
    expect(errors).toEqual([]);
  });

  test("product-viewer template fills the viewport with a rendered typed product", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(`${server.origin}/templates/product-viewer/index.html`, { waitUntil: "domcontentloaded" });
    await expect.poll(
      () => page.evaluate(() => document.body.dataset.aura3dError
        ? `error: ${document.body.dataset.aura3dError}`
        : document.body.dataset.aura3dReady === "true"
          ? "ready"
          : `pending:${document.querySelector("canvas")?.dataset.aura3dModelStage ?? "no-stage"}`),
      { timeout: 45_000 }
    ).toBe("ready");

    const proof = await page.evaluate(() => {
      const canvas = document.querySelector("canvas");
      const diagnostics = (window as unknown as {
        __AURA3D_ROUTE_READY__?: { diagnostics?: { backend?: string; runtimeBackend?: string; drawCalls?: number } };
      }).__AURA3D_ROUTE_READY__?.diagnostics;
      return {
        clientWidth: canvas?.clientWidth ?? 0,
        clientHeight: canvas?.clientHeight ?? 0,
        renderWidth: canvas?.width ?? 0,
        renderHeight: canvas?.height ?? 0,
        diagnostics
      };
    });
    expect(proof.clientWidth).toBe(1280);
    expect(proof.clientHeight).toBe(720);
    expect(proof.renderWidth).toBeGreaterThanOrEqual(1280);
    expect(proof.renderHeight).toBeGreaterThanOrEqual(720);
    expect(proof.diagnostics).toMatchObject({ backend: "webgl2", runtimeBackend: "production-runtime" });
    expect(proof.diagnostics?.drawCalls).toBeGreaterThan(3);

    await mkdir(resolve(process.cwd(), "tests/reports/templates"), { recursive: true });
    await page.screenshot({ path: resolve(process.cwd(), "tests/reports/templates/product-viewer-lean.png"), fullPage: false });
    expect(errors).toEqual([]);
  });

  test("racing-starter template is keyboard-playable and exposes its multi-lap route contract", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(`${server.origin}/templates/racing-starter/index.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.body.dataset.aura3dReady === "true", undefined, { timeout: 45_000 });
    await page.waitForFunction(() => Boolean((window as unknown as { __AURA3D_RACING_STARTER__?: unknown }).__AURA3D_RACING_STARTER__), undefined, {
      timeout: 20_000
    });

    const initial = await racingStarterState(page);
    expect(initial.status).toBe("running");
    expect(initial.speed).toBeCloseTo(0, 5);
    expect(initial.lapProof.status).toBe("contract-ready");
    expect(initial.lapProof.events).toEqual(expect.arrayContaining([
      "checkpoint:checkpoint-1",
      "checkpoint:checkpoint-6",
      "lap:multi-lap-contract",
      "reset:available"
    ]));
    expect(initial.lapProof.lapsToWin).toBeGreaterThanOrEqual(3);
    expect(initial.lapProof.minLapSeconds).toBeGreaterThanOrEqual(20);
    expect(initial.lapProof.routeAlignedToVisibleTrack).toBe(true);

    await page.keyboard.down("ArrowUp");
    await page.waitForTimeout(260);
    const accelerated = await racingStarterState(page);
    expect(accelerated.speed).toBeGreaterThan(initial.speed + 0.5);
    expect(accelerated.progress).not.toBe(initial.progress);

    await page.keyboard.down("ArrowRight");
    await page.waitForTimeout(300);
    await page.keyboard.up("ArrowRight");
    const steered = await racingStarterState(page);
    expect(steered.heading).not.toBe(accelerated.heading);

    await page.keyboard.up("ArrowUp");
    const afterInput = await racingStarterState(page);
    expect(afterInput.events.length).toBeGreaterThanOrEqual(initial.events.length);

    await tapKey(page, "KeyR");
    await page.waitForTimeout(140);
    const reset = await racingStarterState(page);
    expect(reset.status).toBe("running");
    expect(reset.checkpoint).toBe(0);
    expect(reset.events.some((event) => event.includes("reset"))).toBe(true);

    await mkdir(resolve(process.cwd(), "tests/reports/templates"), { recursive: true });
    await page.screenshot({ path: resolve(process.cwd(), "tests/reports/templates/racing-starter-playable.png"), fullPage: false });
    expect(errors).toEqual([]);
  });

  test("falling-blocks-starter template is keyboard-playable and proves line clear", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(`${server.origin}/templates/falling-blocks-starter/index.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.body.dataset.aura3dReady === "true", undefined, { timeout: 45_000 });
    await page.waitForFunction(
      () => Boolean((window as unknown as { __AURA3D_FALLING_BLOCKS_STARTER__?: unknown }).__AURA3D_FALLING_BLOCKS_STARTER__),
      undefined,
      { timeout: 20_000 }
    );

    const initial = await fallingBlocksStarterState(page);
    expect(initial.active?.kind).toBe("I");
    expect(initial.active?.x).toBe(3);
    expect(initial.lineClearProof.lines).toBe(1);
    expect(initial.lineClearProof.events).toContain("line-clear");

    await tapKey(page, "ArrowRight");
    await page.waitForTimeout(120);
    const moved = await fallingBlocksStarterState(page);
    expect(moved.active?.x).toBe((initial.active?.x ?? 0) + 1);

    await tapKey(page, "KeyR");
    await page.waitForTimeout(120);
    await tapKey(page, "ArrowUp");
    await page.waitForTimeout(120);
    const rotated = await fallingBlocksStarterState(page);
    expect(rotated.active?.rotation).not.toBe(initial.active?.rotation);

    await tapKey(page, "KeyR");
    await page.waitForTimeout(120);
    await tapKey(page, "KeyC");
    await page.waitForTimeout(120);
    const held = await fallingBlocksStarterState(page);
    expect(held.hold).toBe("I");
    expect(held.events).toEqual(expect.arrayContaining(["hold:I"]));

    await tapKey(page, "KeyR");
    await page.waitForTimeout(120);
    await tapKey(page, "Space");
    await page.waitForTimeout(160);
    const cleared = await fallingBlocksStarterState(page);
    expect(cleared.lines).toBe(1);
    expect(cleared.score).toBeGreaterThanOrEqual(100);
    expect(cleared.events).toEqual(expect.arrayContaining(["hard-drop:I", "line-clear"]));

    await tapKey(page, "KeyR");
    await page.waitForTimeout(120);
    const reset = await fallingBlocksStarterState(page);
    expect(reset.lines).toBe(0);
    expect(reset.active?.kind).toBe("I");
    expect(reset.events.some((event) => event.includes("reset"))).toBe(true);

    await mkdir(resolve(process.cwd(), "tests/reports/templates"), { recursive: true });
    await page.screenshot({ path: resolve(process.cwd(), "tests/reports/templates/falling-blocks-starter-playable.png"), fullPage: false });
    expect(errors).toEqual([]);
  });
});

async function miniGameState(page: import("@playwright/test").Page): Promise<{
  readonly score: number;
  readonly events: readonly string[];
  readonly player: { readonly x: number; readonly y: number };
}> {
  return await page.evaluate(() => {
    const state = (window as unknown as {
      readonly __AURA3D_MINI_GAME__?: {
        readonly score: number;
        readonly events: readonly string[];
        readonly player: { readonly x: number; readonly y: number };
      };
    }).__AURA3D_MINI_GAME__;
    if (!state) throw new Error("Missing __AURA3D_MINI_GAME__ state.");
    return state;
  });
}

async function tapKey(page: import("@playwright/test").Page, key: string, holdMs = 90): Promise<void> {
  await page.keyboard.down(key);
  await page.waitForTimeout(holdMs);
  await page.keyboard.up(key);
}

async function racingStarterState(page: import("@playwright/test").Page): Promise<{
  readonly status: string;
  readonly checkpoint: number;
  readonly checkpointCount: number;
  readonly speed: number;
  readonly progress: number;
  readonly heading: number;
  readonly events: readonly string[];
  readonly lapProof: {
    readonly status: string;
    readonly events: readonly string[];
    readonly lapsToWin: number;
    readonly minLapSeconds: number;
    readonly routeAlignedToVisibleTrack: boolean;
  };
}> {
  return await page.evaluate(() => {
    const state = (window as unknown as {
      readonly __AURA3D_RACING_STARTER__?: {
        readonly status: string;
        readonly checkpoint: number;
        readonly checkpointCount: number;
        readonly speed: number;
        readonly progress: number;
        readonly heading: number;
        readonly events: readonly string[];
        readonly lapProof: {
          readonly status: string;
          readonly events: readonly string[];
          readonly lapsToWin: number;
          readonly minLapSeconds: number;
          readonly routeAlignedToVisibleTrack: boolean;
        };
      };
    }).__AURA3D_RACING_STARTER__;
    if (!state) throw new Error("Missing __AURA3D_RACING_STARTER__ state.");
    return state;
  });
}

async function fallingBlocksStarterState(page: import("@playwright/test").Page): Promise<{
  readonly score: number;
  readonly lines: number;
  readonly active: { readonly kind: string; readonly x: number; readonly rotation: number } | null;
  readonly hold: string | null;
  readonly events: readonly string[];
  readonly lineClearProof: {
    readonly lines: number;
    readonly events: readonly string[];
  };
}> {
  return await page.evaluate(() => {
    const state = (window as unknown as {
      readonly __AURA3D_FALLING_BLOCKS_STARTER__?: {
        readonly score: number;
        readonly lines: number;
        readonly active: { readonly kind: string; readonly x: number; readonly rotation: number } | null;
        readonly hold: string | null;
        readonly events: readonly string[];
        readonly lineClearProof: {
          readonly lines: number;
          readonly events: readonly string[];
        };
      };
    }).__AURA3D_FALLING_BLOCKS_STARTER__;
    if (!state) throw new Error("Missing __AURA3D_FALLING_BLOCKS_STARTER__ state.");
    return state;
  });
}
