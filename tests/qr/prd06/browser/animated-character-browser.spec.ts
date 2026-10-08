/**
 * PRD-06 §16 S-row — `animated-character-browser` flag-on lane case.
 *
 * The original spec drives a 2-joint procedural rig in
 * `/examples/animated-character/` — outside this lane. §16 requires the
 * >96-joint path flag-on: a 191-joint rig renders through the cached bone
 * texture with `texturesCreatedThisFrame === 0` after frame 10. No admitted
 * fixture has >96 joints, so the lane harness synthesizes a 191-joint
 * skinned quad in-page and draws it through the generated `prd06.deform`
 * program for 12 frames (the same program+bind path as skinned-pbr-parity).
 */
import { expect, test } from "@playwright/test";
import { startPrd04DevServer as startExampleDevServer, type ExampleDevServer } from "../../prd04/dev-server";

interface AnimatedCharacter191Report {
  status: "running" | "done" | "error";
  error?: string;
  jointCount?: number;
  framesRendered?: number;
  boneTextureActive?: boolean;
  missingUniforms?: readonly string[];
  createdThisFrameByFrame?: readonly number[];
  paletteBytes?: number;
  nonBlankFrames?: number;
  firstFramePixelsDrawn?: number;
}

test.describe("prd06 animated-character flag-on (§16)", () => {
  let server: ExampleDevServer | undefined;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });
  test.afterAll(async () => {
    await server?.close();
  });

  test("191-joint rig renders through the cached bone texture with zero textures created after frame 10", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(String(error)));
    await page.goto(`${server!.origin}/tests/qr/prd06/browser/animated-character-browser-harness.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => {
        const r = (window as unknown as { __AURA3D_QR_ANIMATED_CHARACTER_191__?: AnimatedCharacter191Report }).__AURA3D_QR_ANIMATED_CHARACTER_191__;
        return r !== undefined && r.status !== "running";
      },
      undefined,
      { timeout: 60_000 }
    );
    const report = await page.evaluate(() => (window as unknown as { __AURA3D_QR_ANIMATED_CHARACTER_191__?: AnimatedCharacter191Report }).__AURA3D_QR_ANIMATED_CHARACTER_191__);
    expect(report?.status, report?.error).toBe("done");

    // The 191-joint rig rendered through the bone-texture path — the
    // generated program declares `u_boneTexture` and every frame produced
    // visible pixels.
    expect(report!.jointCount).toBe(191);
    expect(report!.boneTextureActive).toBe(true);
    expect(report!.missingUniforms ?? []).toEqual([]);
    expect(report!.framesRendered).toBeGreaterThanOrEqual(10);
    expect(report!.nonBlankFrames, "no visible pixels — the draw was vacuous").toBe(report!.framesRendered);
    expect(report!.firstFramePixelsDrawn, "frame-0 coverage").toBeGreaterThan(1000);
    expect(report!.paletteBytes).toBeGreaterThan(0);

    // §16: the cache creates zero textures per frame once warm — frames
    // 0-1 own the pair's creation, every frame after frame 10 must be 0.
    const created = report!.createdThisFrameByFrame ?? [];
    expect(created.length).toBe(report!.framesRendered);
    for (let frame = 10; frame < created.length; frame += 1) {
      expect(created[frame], `frame ${frame} created ${created[frame]} palette textures`).toBe(0);
    }

    expect(pageErrors.filter((e) => !e.includes("favicon"))).toEqual([]);
  });
});
