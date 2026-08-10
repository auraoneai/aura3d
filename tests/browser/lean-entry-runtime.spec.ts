import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

test.describe("lean public entries", () => {
  test.setTimeout(120_000);
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("renders the documented core entry through the production WebGL2 path", async ({ page }) => {
    await page.goto(server.origin, { waitUntil: "domcontentloaded" });
    await page.setContent(`
      <!doctype html><style>html,body{margin:0;background:#05070b}canvas{width:320px;height:240px}</style>
      <canvas id="scene" width="320" height="240"></canvas>
      <script type="module">
        import { createAuraApp, camera, material, primitives, scene } from "${server.origin}/packages/lean/src/index.js";
        const canvas = document.querySelector("#scene");
        const app = createAuraApp(canvas, {
          autoStart: false,
          scene: scene().background("#07111f")
            .camera(camera.perspective({ position: [2.4, 1.8, 3.2], target: [0, 0, 0] }))
            .add(primitives.box({ material: material.pbr({ color: "#35d4c7", roughness: 0.34 }) }))
        });
        try {
          await app.ready();
          window.__AURA_LEAN_CORE__ = { status: "ready", diagnostics: app.diagnostics() };
        } catch (error) {
          window.__AURA_LEAN_CORE__ = { status: "error", error: String(error) };
        }
      </script>
    `);
    await page.waitForFunction(() => Boolean(window.__AURA_LEAN_CORE__), undefined, { timeout: 90_000 });
    const result = await page.evaluate(() => window.__AURA_LEAN_CORE__);
    expect(result?.status, result?.error).toBe("ready");
    expect(result?.diagnostics?.backend).toBe("webgl2");
    expect(result?.diagnostics?.runtimeBackend).toBe("production-runtime");
    expect(result?.diagnostics?.drawCalls ?? 0).toBeGreaterThan(0);
    expect(result?.diagnostics?.errors).toEqual([]);
    expect((await page.locator("#scene").screenshot()).byteLength).toBeGreaterThan(1_000);
  });

  test("drives solver-free deterministic arcade input and motion from the lean game entry", async ({ page }) => {
    await page.goto(server.origin, { waitUntil: "domcontentloaded" });
    await page.setContent(`
      <!doctype html><style>html,body{margin:0}canvas{width:320px;height:240px}</style>
      <canvas id="scene" width="320" height="240"></canvas>
      <script type="module">
        import { createAuraApp, camera, game, material, primitives, scene } from "${server.origin}/packages/lean/src/game.js";
        const app = createAuraApp(document.querySelector("#scene"), {
          scene: scene().camera(camera.perspective({ position: [0, 5, 8], target: [0, 1, 0] }))
            .add(primitives.box({ name: "player", material: material.pbr({ color: "#4fd1c5" }) })
              .position(0, 0.35, 0).runtime("player"))
        });
        const input = app.input({ actions: { jump: ["Space"] }, autoListen: false });
        const platformer = game.platformer({ platforms: [{ id: "ground", x: -4, y: 0, width: 8, height: 0.35 }] });
        const player = app.nodes.require("player");
        const before = platformer.snapshot().player.y;
        let after = before;
        app.onFrame((dt) => {
          const state = platformer.step(dt, { jumpPressed: input.pressed("jump") });
          after = state.player.y;
          player.setPosition(state.player.x, state.player.y + 0.5, 0);
        });
        input.press("Space");
        try {
          await app.ready();
          setTimeout(() => {
            window.__AURA_LEAN_GAME__ = {
              status: "ready",
              before,
              after,
              runtime: game.runtime,
              diagnostics: app.diagnostics()
            };
          }, 240);
        } catch (error) {
          window.__AURA_LEAN_GAME__ = { status: "error", error: String(error) };
        }
      </script>
    `);
    await page.waitForFunction(() => Boolean(window.__AURA_LEAN_GAME__), undefined, { timeout: 90_000 });
    const result = await page.evaluate(() => window.__AURA_LEAN_GAME__);
    expect(result?.status, result?.error).toBe("ready");
    expect(result?.diagnostics?.backend).toBe("webgl2");
    expect(result?.diagnostics?.runtimeBackend).toBe("production-runtime");
    expect(result?.diagnostics?.drawCalls ?? 0).toBeGreaterThan(0);
    expect(result?.after ?? 0).toBeGreaterThan(result?.before ?? 0);
    expect(result?.runtime).toBe("lean-deterministic-arcade");
  });

  test("loads and draws a real GLB through the lean product entry", async ({ page }) => {
    await page.goto(server.origin, { waitUntil: "domcontentloaded" });
    await page.setContent(`
      <!doctype html><style>html,body{margin:0}canvas{width:320px;height:240px}</style>
      <canvas id="scene" width="320" height="240"></canvas>
      <script type="module">
        import { createAuraApp, camera, model, scene } from "${server.origin}/packages/lean/src/product.js";
        const app = createAuraApp(document.querySelector("#scene"), {
          autoStart: false,
          scene: scene().camera(camera.orbit({ target: [0, 0, 0], distance: 3 }))
            .add(model({
              id: "morph-cube",
              type: "model",
              format: "glb",
              url: "${server.origin}/aura-assets/showcaseMorphCube.929dffbf.glb",
              hash: "sha256-browser-fixture"
            }))
        });
        try {
          await app.ready();
          window.__AURA_LEAN_PRODUCT__ = { status: "ready", diagnostics: app.diagnostics() };
        } catch (error) {
          window.__AURA_LEAN_PRODUCT__ = { status: "error", error: String(error) };
        }
      </script>
    `);
    await page.waitForFunction(() => Boolean(window.__AURA_LEAN_PRODUCT__), undefined, { timeout: 90_000 });
    const result = await page.evaluate(() => window.__AURA_LEAN_PRODUCT__);
    expect(result?.status, result?.error).toBe("ready");
    expect(result?.diagnostics?.backend).toBe("webgl2");
    expect(result?.diagnostics?.runtimeBackend).toBe("production-runtime");
    expect(result?.diagnostics?.drawCalls ?? 0).toBeGreaterThan(0);
  });
});

declare global {
  interface Window {
    __AURA_LEAN_CORE__?: {
      readonly status: "ready" | "error";
      readonly error?: string;
      readonly diagnostics?: { readonly backend: string; readonly runtimeBackend: string; readonly drawCalls: number; readonly errors: readonly string[] };
    };
    __AURA_LEAN_GAME__?: {
      readonly status: "ready" | "error";
      readonly error?: string;
      readonly before?: number;
      readonly after?: number;
      readonly runtime?: string;
      readonly diagnostics?: { readonly backend: string; readonly runtimeBackend: string; readonly drawCalls: number };
    };
    __AURA_LEAN_PRODUCT__?: {
      readonly status: "ready" | "error";
      readonly error?: string;
      readonly diagnostics?: { readonly backend: string; readonly runtimeBackend: string; readonly drawCalls: number };
    };
  }
}
