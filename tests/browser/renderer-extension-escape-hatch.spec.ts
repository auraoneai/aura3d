import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * WS-2.8 — low-level escape hatches, proven by using them.
 *
 * The other clean-room projects prove a developer can build an *application* without touching internals.
 * This proves the opposite direction: a developer who needs to go *below* the safe API can, through
 * documented public exports only.
 *
 * That distinction is why this is a separate spec. `clean-room-projects.spec.ts` forbids
 * `requestAnimationFrame` and direct device construction, correctly — an app developer should never need
 * them. The claim here is that an engine developer *can* reach them, which those prohibitions would
 * otherwise make untestable.
 *
 * The assertion that matters is the negative one: **zero `@aura3d/*\/src/*` deep imports.** An escape hatch
 * that requires reaching into a package's `src/` is not an escape hatch, it is a leak.
 */
const LOW_LEVEL_PROJECT = "tests/clean-room/renderer-extension/src/main.ts";
const PORTABLE_MATERIAL_PROJECT = "examples/custom-material-lab/main.ts";
const REPORT_DIRECTORY = resolve("tests/reports/renderer-extension-escape-hatch");

test.describe("renderer extension escape hatch", () => {
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
    mkdirSync(REPORT_DIRECTORY, { recursive: true });
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("a custom postprocess pass is buildable from public exports with no deep imports", async ({ page }) => {
    const source = readFileSync(LOW_LEVEL_PROJECT, "utf8");

    // --- Static: the imports must all be published entry points -------------------------------
    const specifiers = [...source.matchAll(/from\s+["']([^"']+)["']/g)].map((match) => match[1]!);
    expect(specifiers.length, "the project must import something").toBeGreaterThan(0);
    for (const specifier of specifiers) {
      expect(specifier, `${specifier} reaches into a package's src/`).not.toMatch(/@aura3d\/[a-z0-9-]+\/src\//);
      expect(specifier, `${specifier} is a relative path into the monorepo`).not.toMatch(/packages\/[a-z0-9-]+\/src\//);
      expect(specifier, `${specifier} imports Three.js directly`).not.toMatch(/^three(\/|$)/);
    }
    // The escape hatches this row names must actually be the ones used.
    expect(source).toContain('from "@aura3d/rendering"');
    expect(source).toContain("Renderer");
    expect(source).toContain("Geometry");
    expect(source).toContain("ShaderModule");
    expect(source).toContain("renderer.device.draw");
    expect(source).not.toContain("createProgram(");
    expect(source).not.toContain("class Renderer");

    // --- Runtime: it must actually run and the custom pass must change pixels -----------------
    const consoleErrors: string[] = [];
    page.on("pageerror", (error) => consoleErrors.push(error.message));
    await page.goto(`${server.origin}/tests/clean-room/renderer-extension/index.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => Boolean((window as unknown as { __CLEAN_ROOM_RENDERER_EXTENSION__?: unknown }).__CLEAN_ROOM_RENDERER_EXTENSION__)
        || (window as unknown as { __CLEAN_ROOM_RENDERER_EXTENSION_ERROR__?: unknown }).__CLEAN_ROOM_RENDERER_EXTENSION_ERROR__ !== undefined,
      undefined,
      { timeout: 60_000 }
    );
    const failure = await page.evaluate(() => (window as unknown as { __CLEAN_ROOM_RENDERER_EXTENSION_ERROR__?: string }).__CLEAN_ROOM_RENDERER_EXTENSION_ERROR__);
    expect(failure ?? consoleErrors.join(" | "), "the extension project must run to completion").toBeFalsy();

    const state = await page.evaluate(() => (window as unknown as {
      __CLEAN_ROOM_RENDERER_EXTENSION__: {
        readonly deviceKind: string;
        readonly customPassCompiled: boolean;
        readonly customPassApplied: boolean;
        readonly baselineLitPixels: number;
        readonly tintedPixels: number;
        readonly rendererDrawCalls: number;
        readonly callerResourcesDisposed: boolean;
        readonly rendererDisposed: boolean;
      };
    }).__CLEAN_ROOM_RENDERER_EXTENSION__);

    // A real device, reached through the renderer's documented low-level seam.
    expect(state.deviceKind).toBe("webgl2");
    // The custom shader compiled and linked through ShaderModule's public sources.
    expect(state.customPassCompiled, "the custom pass must compile from public ShaderModule sources").toBe(true);
    /*
     * And it must have changed the frame. Compiling proves the API is reachable; changing pixels proves
     * the pass actually ran, which is the difference between an export existing and an escape hatch working.
     */
    expect(state.customPassApplied, "the custom pass must visibly affect the framebuffer").toBe(true);
    expect(state.baselineLitPixels).toBeGreaterThan(0);
    expect(state.tintedPixels).toBeGreaterThan(0);
    expect(state.rendererDrawCalls).toBeGreaterThanOrEqual(1);
    expect(state.callerResourcesDisposed).toBe(true);
    expect(state.rendererDisposed).toBe(true);
    writeFileSync(resolve(REPORT_DIRECTORY, "low-level.json"), `${JSON.stringify({
      schema: "aura3d.renderer-extension-integration/1.0",
      generatedAt: new Date().toISOString(),
      pass: true,
      integration: "clean-room-low-level-pass",
      state
    }, null, 2)}\n`);
  });

  test("a second external integration renders portable materials without a renderer fork", async ({ page }) => {
    const source = readFileSync(PORTABLE_MATERIAL_PROJECT, "utf8");
    expect(source).toContain('from "@aura3d/rendering"');
    expect(source).toContain("PortableShaderMaterial");
    expect(source).toContain("Renderer.create");
    expect(source).not.toMatch(/@aura3d\/[a-z0-9-]+\/src\//);
    expect(source).not.toMatch(/packages\/rendering\/src\//);
    expect(source).not.toMatch(/from\s+["']three(?:\/|["'])/);
    expect(source).not.toContain("class Renderer");
    expect(source).not.toContain("createProgram(");

    await page.goto(`${server.origin}/examples/custom-material-lab/?backend=webgl2`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => (window as unknown as { __AURA_PORTABLE_MATERIAL_LAB__?: { frame: number } }).__AURA_PORTABLE_MATERIAL_LAB__?.frame! >= 3,
      undefined,
      { timeout: 60_000 }
    );
    const state = await page.evaluate(() => (window as unknown as {
      __AURA_PORTABLE_MATERIAL_LAB__: { readonly backend: string; readonly materialCount: number; readonly publicApiOnly: boolean; readonly diagnostics: { readonly drawCalls: number } };
    }).__AURA_PORTABLE_MATERIAL_LAB__);
    expect(state).toMatchObject({ backend: "webgl2", materialCount: 3, publicApiOnly: true });
    expect(state.diagnostics.drawCalls).toBe(3);
    const disposal = await page.evaluate(() => (window as unknown as { __AURA_PORTABLE_MATERIAL_DISPOSE__: () => unknown }).__AURA_PORTABLE_MATERIAL_DISPOSE__());
    expect(disposal).toEqual({ materialsDisposed: true, rendererDisposed: true });
    writeFileSync(resolve(REPORT_DIRECTORY, "portable-material.json"), `${JSON.stringify({
      schema: "aura3d.renderer-extension-integration/1.0",
      generatedAt: new Date().toISOString(),
      pass: true,
      integration: "portable-custom-material-lab",
      state,
      disposal
    }, null, 2)}\n`);
  });
});
