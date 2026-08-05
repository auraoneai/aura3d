import { readFileSync } from "node:fs";
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
const PROJECT = "tests/clean-room/renderer-extension/src/main.ts";

test.describe("renderer extension escape hatch", () => {
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("a custom postprocess pass is buildable from public exports with no deep imports", async ({ page }) => {
    const source = readFileSync(PROJECT, "utf8");

    // --- Static: the imports must all be published entry points -------------------------------
    const specifiers = [...source.matchAll(/from\s+["']([^"']+)["']/g)].map((match) => match[1]!);
    expect(specifiers.length, "the project must import something").toBeGreaterThan(0);
    for (const specifier of specifiers) {
      expect(specifier, `${specifier} reaches into a package's src/`).not.toMatch(/@aura3d\/[a-z0-9-]+\/src\//);
      expect(specifier, `${specifier} is a relative path into the monorepo`).not.toMatch(/packages\/[a-z0-9-]+\/src\//);
      expect(specifier, `${specifier} imports Three.js directly`).not.toMatch(/^three(\/|$)/);
    }
    // The escape hatches this row names must actually be the ones used.
    expect(source).toContain("createRenderDevice");
    expect(source).toContain("Renderer");
    expect(source).toContain("Geometry");
    expect(source).toContain("ShaderModule");

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
        readonly litPixels: number;
        readonly tintedPixels: number;
      };
    }).__CLEAN_ROOM_RENDERER_EXTENSION__);

    // A real device, reached through createRenderDevice.
    expect(state.deviceKind).toBe("webgl2");
    // The custom shader compiled and linked through ShaderModule's public sources.
    expect(state.customPassCompiled, "the custom pass must compile from public ShaderModule sources").toBe(true);
    /*
     * And it must have changed the frame. Compiling proves the API is reachable; changing pixels proves
     * the pass actually ran, which is the difference between an export existing and an escape hatch working.
     */
    expect(state.customPassApplied, "the custom pass must visibly affect the framebuffer").toBe(true);
    expect(state.tintedPixels).toBeGreaterThan(state.litPixels);
  });
});
